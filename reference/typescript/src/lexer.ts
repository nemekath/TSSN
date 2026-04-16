/**
 * TSSN lexer — character-level tokenizer for Appendix A grammar.
 *
 * Normalizes CRLF and bare CR to LF at the character source level so that
 * line/column tracking downstream sees a single newline convention. Strips
 * a UTF-8 BOM if present. Handles string literals, backtick-quoted
 * identifiers with `` `` `` escape, and `//` line comments without being
 * confused by `//` appearing inside literals.
 *
 * Contextual keywords (`interface`, `view`, `type`) are NOT classified at
 * lex time — they are emitted as `ident` tokens and promoted to keywords
 * by the parser based on position. This lets a user write a column named
 * `type: string;` without conflict.
 */

export type TokenKind =
  | 'ident'
  | 'quoted_ident'
  | 'string'
  | 'number'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'colon'
  | 'semi'
  | 'pipe'
  | 'eq'
  | 'qmark'
  | 'comma'
  | 'line_comment'
  | 'eof';

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Span {
  start: Position;
  end: Position;
}

export interface Token {
  kind: TokenKind;
  /** For idents: the raw name. For quoted idents: the unescaped content. For
   *  strings: the content between quotes (no escape processing per spec).
   *  For numbers: the literal digits with optional leading minus. For
   *  comments: the raw text after `//`, with no trimming. For punctuation
   *  and EOF: an empty string. */
  value: string;
  span: Span;
}

export class LexError extends Error {
  constructor(
    message: string,
    public position: Position
  ) {
    super(`${message} (line ${position.line}, column ${position.column})`);
    this.name = 'LexError';
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).scan();
}

class Lexer {
  private source: string;
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor(rawSource: string) {
    // Strip UTF-8 BOM if present.
    let s = rawSource.charCodeAt(0) === 0xfeff ? rawSource.slice(1) : rawSource;
    // Normalize line endings to LF. This changes offsets relative to the
    // original source, but line/column remain human-accurate and the
    // normalized text is what downstream consumers see.
    s = s.replace(/\r\n?/g, '\n');
    this.source = s;
  }

  scan(): Token[] {
    const tokens: Token[] = [];
    while (this.offset < this.source.length) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t') {
        this.advance();
        continue;
      }
      if (ch === '\n') {
        this.advanceNewline();
        continue;
      }
      if (ch === '/' && this.peek(1) === '/') {
        tokens.push(this.scanLineComment());
        continue;
      }
      if (ch === "'") {
        tokens.push(this.scanString());
        continue;
      }
      if (ch === '`') {
        tokens.push(this.scanQuotedIdent());
        continue;
      }
      if (ch === '-' || this.isDigit(ch)) {
        // Disambiguate: `-` followed by a digit is a number. A bare `-` is
        // an error in v0.8 — no subtraction, no negation outside numbers.
        if (ch === '-' && !this.isDigit(this.peek(1))) {
          throw new LexError(`Unexpected character '-'`, this.position());
        }
        tokens.push(this.scanNumber());
        continue;
      }
      if (this.isIdentStart(ch)) {
        tokens.push(this.scanIdent());
        continue;
      }
      const punct = this.scanPunctuation();
      if (punct) {
        tokens.push(punct);
        continue;
      }
      throw new LexError(`Unexpected character '${ch}'`, this.position());
    }
    tokens.push({
      kind: 'eof',
      value: '',
      span: { start: this.position(), end: this.position() },
    });
    return tokens;
  }

  // ---------- scanners ----------

  private scanLineComment(): Token {
    const start = this.position();
    this.advance(); // /
    this.advance(); // /
    const valueStart = this.offset;
    while (this.offset < this.source.length && this.peek() !== '\n') {
      this.advance();
    }
    const value = this.source.slice(valueStart, this.offset);
    return { kind: 'line_comment', value, span: { start, end: this.position() } };
  }

  private scanString(): Token {
    const start = this.position();
    this.advance(); // opening '
    const valueStart = this.offset;
    while (true) {
      if (this.offset >= this.source.length) {
        throw new LexError('Unterminated string literal', start);
      }
      const ch = this.peek();
      if (ch === '\n') {
        throw new LexError('Newline in string literal', this.position());
      }
      if (ch === "'") break;
      this.advance();
    }
    const value = this.source.slice(valueStart, this.offset);
    this.advance(); // closing '
    return { kind: 'string', value, span: { start, end: this.position() } };
  }

  private scanQuotedIdent(): Token {
    const start = this.position();
    this.advance(); // opening `
    let value = '';
    while (true) {
      if (this.offset >= this.source.length) {
        throw new LexError('Unterminated quoted identifier', start);
      }
      const ch = this.peek();
      if (ch === '\n') {
        throw new LexError('Newline in quoted identifier', this.position());
      }
      if (ch === '`') {
        if (this.peek(1) === '`') {
          // Escaped backtick: consume both, append one literal backtick.
          value += '`';
          this.advance();
          this.advance();
          continue;
        }
        // Closing backtick.
        break;
      }
      value += ch;
      this.advance();
    }
    if (value.length === 0) {
      throw new LexError('Empty quoted identifier', start);
    }
    this.advance(); // closing `
    return { kind: 'quoted_ident', value, span: { start, end: this.position() } };
  }

  private scanNumber(): Token {
    const start = this.position();
    const valueStart = this.offset;
    if (this.peek() === '-') this.advance();
    if (!this.isDigit(this.peek())) {
      throw new LexError('Expected digit after minus sign', start);
    }
    while (this.offset < this.source.length && this.isDigit(this.peek())) {
      this.advance();
    }
    // Reject floats — EBNF defines number_lit = "-"? digits.
    if (this.peek() === '.') {
      throw new LexError(
        'Floating-point numbers are not allowed (EBNF defines number_lit as integer only)',
        this.position()
      );
    }
    const value = this.source.slice(valueStart, this.offset);
    return { kind: 'number', value, span: { start, end: this.position() } };
  }

  private scanIdent(): Token {
    const start = this.position();
    const valueStart = this.offset;
    this.advance();
    while (this.offset < this.source.length && this.isIdentCont(this.peek())) {
      this.advance();
    }
    const value = this.source.slice(valueStart, this.offset);
    return { kind: 'ident', value, span: { start, end: this.position() } };
  }

  private scanPunctuation(): Token | null {
    const start = this.position();
    const ch = this.peek();
    const single: Record<string, TokenKind> = {
      '{': 'lbrace',
      '}': 'rbrace',
      '(': 'lparen',
      ')': 'rparen',
      '[': 'lbracket',
      ']': 'rbracket',
      ':': 'colon',
      ';': 'semi',
      '|': 'pipe',
      '=': 'eq',
      '?': 'qmark',
      ',': 'comma',
    };
    const kind = single[ch];
    if (!kind) return null;
    this.advance();
    return { kind, value: '', span: { start, end: this.position() } };
  }

  // ---------- position helpers ----------

  private peek(offset = 0): string {
    return this.source[this.offset + offset] ?? '';
  }

  private advance(): void {
    this.offset += 1;
    this.column += 1;
  }

  private advanceNewline(): void {
    // Only LF reaches here (CRLF/CR are normalized in the constructor).
    this.offset += 1;
    this.line += 1;
    this.column = 1;
  }

  private position(): Position {
    return { line: this.line, column: this.column, offset: this.offset };
  }

  // ---------- character classes ----------

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
  }

  private isIdentCont(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }
}
