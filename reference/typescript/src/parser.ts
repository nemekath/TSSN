/**
 * Recursive-descent parser for TSSN v0.8, mirroring Appendix A of the spec.
 *
 * The parser consumes the token stream produced by `lexer.ts` and returns
 * a `Schema` plus a `ParseError[]`. Errors are collected rather than
 * thrown so that downstream tools can render multiple problems at once.
 * The top-level `parse()` wraps `parseRaw()` and throws an AggregateError
 * if any errors were collected.
 *
 * Phase 4 (this file at time of introduction) implements Level 1:
 * interface declarations, simple base types with optional length,
 * nullability markers, and opaque trailing-comment capture. Later
 * phases extend `parseTypeExpr` and add top-level `view` / `type` handling.
 */

import type {
  Annotation,
  AliasType,
  ArrayType,
  BaseType,
  Column,
  Constraint,
  Literal,
  Schema,
  TableDecl,
  TopLevel,
  TypeAliasDecl,
  TypeExpr,
  UnionType,
  ViewDecl,
} from './ast.js';
import {
  parseInlineAnnotations,
  parseLeadingAnnotation,
} from './annotations.js';
import { parseInlineConstraints, parseInterfaceConstraint } from './constraints.js';
import { ParseError } from './errors.js';
import { LexError, tokenize, type Span, type Token, type TokenKind } from './lexer.js';
import { validate, type ValidationError } from './validate.js';

export interface ParseOptions {
  filename?: string;
}

export interface ParseResult {
  schema: Schema;
  errors: ParseError[];
}

export function parseRaw(source: string, opts: ParseOptions = {}): ParseResult {
  try {
    const tokens = tokenize(source);
    return new Parser(source, tokens, opts.filename).parse();
  } catch (e) {
    if (e instanceof LexError) {
      const span: Span = { start: e.position, end: e.position };
      const base: Schema = { source, declarations: [] };
      const schema: Schema = opts.filename !== undefined
        ? { ...base, filename: opts.filename }
        : base;
      return {
        schema,
        errors: [new ParseError({ message: e.message, span })],
      };
    }
    throw e;
  }
}

export function parse(source: string, opts: ParseOptions = {}): Schema {
  const { schema, errors } = parseRaw(source, opts);
  const validationErrors: ValidationError[] =
    errors.length === 0 ? validate(schema) : [];
  const all: Array<ParseError | ValidationError> = [
    ...errors,
    ...validationErrors,
  ];
  if (all.length > 0) {
    throw new AggregateError(
      all,
      `TSSN parse failed with ${all.length} error(s)`
    );
  }
  return schema;
}

// ---------- helpers ----------

function literalFromToken(tok: Token): Literal {
  if (tok.kind === 'string') {
    return { kind: 'string', value: tok.value };
  }
  if (tok.kind === 'number') {
    const n = Number.parseInt(tok.value, 10);
    return { kind: 'number', value: n };
  }
  throw new ParseError({
    message: `Expected literal, got ${tok.kind}`,
    span: tok.span,
  });
}

// ---------- Parser class ----------

class Parser {
  private pos = 0;
  private readonly errors: ParseError[] = [];
  private readonly aliases = new Map<string, TypeAliasDecl>();
  /** True once the parser has consumed its first interface or view,
   *  after which further `type` declarations are invalid per Spec 2.2.7. */
  private seenDeclarationKeyword = false;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
    private readonly filename: string | undefined
  ) {}

  parse(): ParseResult {
    const declarations: TopLevel[] = [];
    let pendingComments: Token[] = [];

    while (!this.isEOF()) {
      const tok = this.peek();
      if (tok.kind === 'line_comment') {
        pendingComments.push(this.consume());
        continue;
      }
      if (tok.kind === 'ident') {
        if (tok.value === 'type') {
          if (this.seenDeclarationKeyword) {
            this.recordError(
              'Type aliases must be declared before any interface or view',
              tok.span
            );
            this.recoverToNextDeclaration();
            pendingComments = [];
            continue;
          }
          try {
            const alias = this.parseTypeAliasDecl();
            if (this.aliases.has(alias.name)) {
              this.recordError(
                `Duplicate type alias '${alias.name}'`,
                alias.span
              );
            } else {
              this.aliases.set(alias.name, alias);
            }
            declarations.push(alias);
          } catch (e) {
            this.handleError(e);
            this.recoverToNextDeclaration();
          }
          pendingComments = [];
          continue;
        }
        if (tok.value === 'interface') {
          this.seenDeclarationKeyword = true;
          try {
            declarations.push(this.parseInterfaceDecl(pendingComments));
          } catch (e) {
            this.handleError(e);
            this.recoverToNextDeclaration();
          }
          pendingComments = [];
          continue;
        }
        if (tok.value === 'view') {
          this.seenDeclarationKeyword = true;
          try {
            declarations.push(this.parseViewDecl(pendingComments));
          } catch (e) {
            this.handleError(e);
            this.recoverToNextDeclaration();
          }
          pendingComments = [];
          continue;
        }
        this.recordError(
          `Unexpected top-level identifier '${tok.value}'`,
          tok.span
        );
        this.recoverToNextDeclaration();
        pendingComments = [];
        continue;
      }
      this.recordError(
        `Unexpected token ${tok.kind} at top level`,
        tok.span
      );
      this.recoverToNextDeclaration();
      pendingComments = [];
    }

    const base: Schema = { source: this.source, declarations };
    const schema: Schema =
      this.filename !== undefined ? { ...base, filename: this.filename } : base;
    return { schema, errors: this.errors };
  }

  // ---------- top-level declarations ----------

  private parseInterfaceDecl(leading: Token[]): TableDecl {
    const startTok = this.expectKeyword('interface');
    const nameInfo = this.parseDeclIdent();
    this.expect('lbrace');
    const { columns, tableConstraints: bodyConstraints } = this.parseBody();
    const endTok = this.expect('rbrace');

    const {
      annotations,
      constraints: leadingConstraints,
      plainComments,
      schemaName,
    } = this.classifyLeading(leading);

    const decl: TableDecl = {
      kind: 'table',
      name: nameInfo.name,
      quoted: nameInfo.quoted,
      columns,
      tableConstraints: [...leadingConstraints, ...bodyConstraints],
      annotations,
      leadingComments: plainComments,
      span: { start: startTok.span.start, end: endTok.span.end },
    };
    if (schemaName !== undefined) decl.schema = schemaName;
    return decl;
  }

  private parseViewDecl(leading: Token[]): ViewDecl {
    const startTok = this.expectKeyword('view');
    const nameInfo = this.parseDeclIdent();
    this.expect('lbrace');
    const { columns, tableConstraints: bodyConstraints } = this.parseBody();
    const endTok = this.expect('rbrace');

    const {
      annotations,
      constraints: leadingConstraints,
      plainComments,
      schemaName,
    } = this.classifyLeading(leading);

    const materialized = annotations.some((a) => a.key === 'materialized');
    const updatable = annotations.some((a) => a.key === 'updatable');
    const readonlyAnnotated = annotations.some((a) => a.key === 'readonly');
    // Default view semantics are read-only. Explicit @updatable flips it.
    const readonly = readonlyAnnotated || !updatable;

    const decl: ViewDecl = {
      kind: 'view',
      name: nameInfo.name,
      quoted: nameInfo.quoted,
      columns,
      tableConstraints: [...leadingConstraints, ...bodyConstraints],
      materialized,
      readonly,
      readonlyAnnotated,
      updatable,
      annotations,
      leadingComments: plainComments,
      span: { start: startTok.span.start, end: endTok.span.end },
    };
    if (schemaName !== undefined) decl.schema = schemaName;
    return decl;
  }

  private parseTypeAliasDecl(): TypeAliasDecl {
    const startTok = this.expectKeyword('type');
    const nameTok = this.peek();
    if (nameTok.kind !== 'ident') {
      throw new ParseError({
        message: `Expected alias name after 'type', got ${nameTok.kind}`,
        span: nameTok.span,
      });
    }
    this.consume();
    this.expect('eq');
    const rhs = this.parseTypeExpr();

    // Alias-to-alias references are invalid per Spec 2.2.7.
    if (rhs.kind === 'alias') {
      throw new ParseError({
        message: `Type alias '${nameTok.value}' cannot reference another alias '${rhs.name}' — aliases may not nest`,
        span: rhs.span,
      });
    }

    const semi = this.expect('semi');

    // Consume a trailing comment on the same line if present, so it
    // doesn't attach to the following declaration as a leading comment.
    const next = this.peek();
    if (
      next.kind === 'line_comment' &&
      next.span.start.line === semi.span.end.line
    ) {
      this.consume();
    }

    return {
      kind: 'type_alias',
      name: nameTok.value,
      rhs,
      span: { start: startTok.span.start, end: semi.span.end },
    };
  }

  private classifyLeading(tokens: Token[]): {
    annotations: Annotation[];
    constraints: Constraint[];
    plainComments: string[];
    schemaName?: string;
  } {
    const annotations: Annotation[] = [];
    const constraints: Constraint[] = [];
    const plainComments: string[] = [];
    let schemaName: string | undefined;

    for (const tok of tokens) {
      // 1. Multi-column interface constraint: PK(...) / UNIQUE(...) / INDEX(...)
      const constraint = parseInterfaceConstraint(tok.value);
      if (constraint !== null) {
        constraints.push(constraint);
        continue;
      }

      // 2. Single-annotation comment: @key / @key: value
      const annotation = parseLeadingAnnotation(tok.value, tok.span);
      if (annotation !== null) {
        annotations.push(annotation);
        if (annotation.key === 'schema' && annotation.value !== undefined) {
          schemaName = annotation.value;
        }
        continue;
      }

      // 3. Plain descriptive comment — preserve verbatim for round-trip.
      plainComments.push(tok.value);
    }

    const result: {
      annotations: Annotation[];
      constraints: Constraint[];
      plainComments: string[];
      schemaName?: string;
    } = { annotations, constraints, plainComments };
    if (schemaName !== undefined) result.schemaName = schemaName;
    return result;
  }

  // ---------- body ----------

  private parseBody(): { columns: Column[]; tableConstraints: Constraint[] } {
    const columns: Column[] = [];
    const tableConstraints: Constraint[] = [];
    while (!this.isEOF() && this.peek().kind !== 'rbrace') {
      const tok = this.peek();
      if (tok.kind === 'line_comment') {
        const commentTok = this.consume();
        const constraint = parseInterfaceConstraint(commentTok.value);
        if (constraint) tableConstraints.push(constraint);
        continue;
      }
      try {
        columns.push(this.parseColumn());
      } catch (e) {
        this.handleError(e);
        this.skipUntil(['semi', 'rbrace']);
        if (this.peek().kind === 'semi') this.consume();
      }
    }
    return { columns, tableConstraints };
  }

  private parseColumn(): Column {
    const startTok = this.peek();
    const nameInfo = this.parseDeclIdent();
    let nullable = false;
    if (this.peek().kind === 'qmark') {
      this.consume();
      nullable = true;
    }
    // Report a missing colon at the column's own start so the caret
    // points at the broken column rather than the following token.
    if (this.peek().kind !== 'colon') {
      throw new ParseError({
        message: `Expected ':' after column name '${nameInfo.name}'`,
        span: startTok.span,
      });
    }
    this.consume();
    const type = this.parseTypeExpr();
    const semi = this.expect('semi');

    let rawComment: string | null = null;
    const next = this.peek();
    if (
      next.kind === 'line_comment' &&
      next.span.start.line === semi.span.end.line
    ) {
      rawComment = this.consume().value;
    }

    const constraints =
      rawComment !== null ? parseInlineConstraints(rawComment) : [];
    const annotations =
      rawComment !== null
        ? parseInlineAnnotations(rawComment, {
            start: startTok.span.start,
            end: semi.span.end,
          })
        : [];

    return {
      name: nameInfo.name,
      quoted: nameInfo.quoted,
      nullable,
      type,
      rawComment,
      constraints,
      annotations,
      span: { start: startTok.span.start, end: semi.span.end },
    };
  }

  // ---------- type expressions ----------

  /** Dispatch point for the three `type_expr` alternatives in the
   *  grammar. A literal (`string` or `number` token) signals a union.
   *  Otherwise the type begins with an `ident` and we parse a simple
   *  type, optionally followed by an array suffix. Alias references are
   *  handled transparently in `parseSimpleType` (Phase 6). */
  private parseTypeExpr(): TypeExpr {
    const tok = this.peek();
    if (tok.kind === 'string' || tok.kind === 'number') {
      return this.parseUnionType();
    }
    if (tok.kind === 'ident') {
      return this.parseSimpleTypeWithArray();
    }
    throw new ParseError({
      message: `Expected type expression, got ${tok.kind}`,
      span: tok.span,
    });
  }

  private parseUnionType(): UnionType {
    const startTok = this.peek();
    const literals: Literal[] = [];
    const firstTok = this.expectLiteralToken();
    literals.push(literalFromToken(firstTok));
    let endPos = firstTok.span.end;

    if (this.peek().kind !== 'pipe') {
      throw new ParseError({
        message:
          'A single literal is not a valid type — use a base type or a union of at least two literals',
        span: startTok.span,
      });
    }

    while (this.peek().kind === 'pipe') {
      this.consume();
      const nextTok = this.expectLiteralToken();
      literals.push(literalFromToken(nextTok));
      endPos = nextTok.span.end;
    }

    return {
      kind: 'union',
      literals,
      span: { start: startTok.span.start, end: endPos },
    };
  }

  private expectLiteralToken(): Token {
    const tok = this.peek();
    if (tok.kind !== 'string' && tok.kind !== 'number') {
      throw new ParseError({
        message: `Expected string or number literal, got ${tok.kind}`,
        span: tok.span,
      });
    }
    return this.consume();
  }

  private parseSimpleTypeWithArray(): BaseType | ArrayType | AliasType {
    const base = this.parseSimpleOrAlias();
    // Per the grammar, the array suffix only applies to `simple_type`,
    // not to `alias_ref`. Aliases that happen to expand to an array
    // type already carry the array shape in their resolved field.
    if (base.kind === 'alias') return base;
    if (this.peek().kind === 'lbracket') {
      this.consume();
      const rb = this.expect('rbracket');
      return {
        kind: 'array',
        element: base,
        span: { start: base.span.start, end: rb.span.end },
      };
    }
    return base;
  }

  /** Reads an identifier and either resolves it as an alias reference
   *  (if one was declared earlier) or parses it as a base type with
   *  optional length. Alias resolution is skipped inside the RHS of a
   *  `type X = ...;` declaration — see `parseTypeAliasDecl`. */
  private parseSimpleOrAlias(): BaseType | AliasType {
    const tok = this.peek();
    if (tok.kind !== 'ident') {
      throw new ParseError({
        message: `Expected type name, got ${tok.kind}`,
        span: tok.span,
      });
    }

    // Alias reference: only valid if the name was previously declared
    // AND the ident is not followed by `(` (which would indicate a
    // length-parameterised base type, not an alias reference).
    const alias = this.aliases.get(tok.value);
    if (alias !== undefined && this.peek(1).kind !== 'lparen') {
      this.consume();
      return {
        kind: 'alias',
        name: tok.value,
        resolved: alias.rhs,
        span: tok.span,
      };
    }

    this.consume();
    let length: number | undefined;
    let endPos = tok.span.end;

    if (this.peek().kind === 'lparen') {
      this.consume();
      const numTok = this.peek();
      if (numTok.kind !== 'number') {
        throw new ParseError({
          message: 'Expected length digits inside parentheses',
          span: numTok.span,
        });
      }
      this.consume();
      const parsed = Number.parseInt(numTok.value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new ParseError({
          message: 'Length must be a non-negative integer',
          span: numTok.span,
        });
      }
      length = parsed;
      const rpar = this.expect('rparen');
      endPos = rpar.span.end;
    }

    const base: BaseType = {
      kind: 'base',
      base: tok.value,
      span: { start: tok.span.start, end: endPos },
    };
    if (length !== undefined) base.length = length;
    return base;
  }

  // ---------- identifier parsing ----------

  private parseDeclIdent(): { name: string; quoted: boolean; span: Span } {
    const tok = this.peek();
    if (tok.kind === 'ident') {
      this.consume();
      return { name: tok.value, quoted: false, span: tok.span };
    }
    if (tok.kind === 'quoted_ident') {
      this.consume();
      return { name: tok.value, quoted: true, span: tok.span };
    }
    throw new ParseError({
      message: `Expected identifier, got ${tok.kind}`,
      span: tok.span,
    });
  }

  // ---------- token helpers ----------

  private peek(n = 0): Token {
    return this.tokens[this.pos + n] ?? this.tokens[this.tokens.length - 1]!;
  }

  private consume(): Token {
    const tok = this.tokens[this.pos]!;
    this.pos += 1;
    return tok;
  }

  private isEOF(): boolean {
    return this.peek().kind === 'eof';
  }

  private expect(kind: TokenKind): Token {
    const tok = this.peek();
    if (tok.kind !== kind) {
      throw new ParseError({
        message: `Expected ${kind}, got ${tok.kind}`,
        span: tok.span,
      });
    }
    return this.consume();
  }

  private expectKeyword(name: string): Token {
    const tok = this.peek();
    if (tok.kind !== 'ident' || tok.value !== name) {
      throw new ParseError({
        message: `Expected '${name}', got ${tok.kind === 'ident' ? `'${tok.value}'` : tok.kind}`,
        span: tok.span,
      });
    }
    return this.consume();
  }

  private skipUntil(kinds: TokenKind[]): void {
    while (!this.isEOF() && !kinds.includes(this.peek().kind)) {
      this.consume();
    }
  }

  private recoverToNextDeclaration(): void {
    // Always advance past the current token first so we don't get stuck
    // in a loop when the current token is itself the broken keyword that
    // triggered recovery (e.g. a misplaced `type` after an interface).
    if (!this.isEOF()) this.consume();
    while (!this.isEOF()) {
      const tok = this.peek();
      if (
        tok.kind === 'ident' &&
        (tok.value === 'interface' || tok.value === 'view' || tok.value === 'type')
      ) {
        return;
      }
      this.consume();
    }
  }

  private handleError(e: unknown): void {
    if (e instanceof ParseError) {
      this.errors.push(e);
      return;
    }
    throw e;
  }

  private recordError(message: string, span: Span): void {
    this.errors.push(new ParseError({ message, span }));
  }
}
