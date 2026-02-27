/** Error thrown when LINDT input cannot be parsed. */
export class ParseError extends Error {
  /** 1-based line number where the error occurred. */
  readonly line: number;

  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.name = 'ParseError';
    this.line = line;
  }
}
