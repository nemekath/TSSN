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
  ArrayType,
  BaseType,
  Column,
  Schema,
  TableDecl,
  TopLevel,
  TypeExpr,
  UnionType,
} from './ast.js';
import { ParseError } from './errors.js';
import { LexError, tokenize, type Span, type Token, type TokenKind } from './lexer.js';

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
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `TSSN parse failed with ${errors.length} error(s)`
    );
  }
  return schema;
}

// ---------- Parser class ----------

class Parser {
  private pos = 0;
  private readonly errors: ParseError[] = [];

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
        if (tok.value === 'interface') {
          try {
            declarations.push(this.parseInterfaceDecl(pendingComments));
          } catch (e) {
            this.handleError(e);
            this.recoverToNextDeclaration();
          }
          pendingComments = [];
          continue;
        }
        // Unknown top-level keyword (view/type are L3; reached via later
        // phases extending this switch).
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
    const { columns } = this.parseBody();
    const endTok = this.expect('rbrace');

    const leadingComments = leading.map((t) => t.value);

    return {
      kind: 'table',
      name: nameInfo.name,
      quoted: nameInfo.quoted,
      columns,
      tableConstraints: [],
      annotations: [],
      leadingComments,
      span: { start: startTok.span.start, end: endTok.span.end },
    };
  }

  // ---------- body ----------

  private parseBody(): { columns: Column[] } {
    const columns: Column[] = [];
    while (!this.isEOF() && this.peek().kind !== 'rbrace') {
      const tok = this.peek();
      if (tok.kind === 'line_comment') {
        // Phase 4: interface-level comments inside the body are ignored
        // for now. L2 will parse PK/UNIQUE/INDEX forms out of them.
        this.consume();
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
    return { columns };
  }

  private parseColumn(): Column {
    const startTok = this.peek();
    const nameInfo = this.parseDeclIdent();
    let nullable = false;
    if (this.peek().kind === 'qmark') {
      this.consume();
      nullable = true;
    }
    this.expect('colon');
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

    return {
      name: nameInfo.name,
      quoted: nameInfo.quoted,
      nullable,
      type,
      rawComment,
      constraints: [],
      annotations: [],
      span: { start: startTok.span.start, end: semi.span.end },
    };
  }

  // ---------- type expressions ----------

  /** Dispatch point for the three `type_expr` alternatives. Phase 4 only
   *  handles `simple_type`; later phases extend this. */
  private parseTypeExpr(): TypeExpr {
    return this.parseSimpleType();
  }

  private parseSimpleType(): BaseType | ArrayType | UnionType {
    const tok = this.peek();
    if (tok.kind !== 'ident') {
      throw new ParseError({
        message: `Expected type name, got ${tok.kind}`,
        span: tok.span,
      });
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
