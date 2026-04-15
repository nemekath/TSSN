import type { Span } from './lexer.js';

export interface ParseErrorInfo {
  message: string;
  span: Span;
}

export class ParseError extends Error {
  constructor(public info: ParseErrorInfo) {
    super(
      `${info.message} (line ${info.span.start.line}, column ${info.span.start.column})`
    );
    this.name = 'ParseError';
  }

  get span(): Span {
    return this.info.span;
  }
}
