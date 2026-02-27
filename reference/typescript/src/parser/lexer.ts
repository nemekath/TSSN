import { PATTERNS } from '../constants.js';

/** Mutable cursor over the input lines. */
export interface ParserState {
  readonly lines: readonly string[];
  pos: number;
}

/** Create a new parser state by splitting raw input into lines. */
export function createParserState(input: string): ParserState {
  return {
    lines: input.split(/\r\n|\r|\n/),
    pos: 0,
  };
}

/** Return the current line (trimmed), or `undefined` if past end. */
export function currentLine(state: ParserState): string | undefined {
  return state.lines[state.pos]?.trimStart();
}

/** Whether the current (trimmed) line is blank. */
export function isBlank(state: ParserState): boolean {
  const line = state.lines[state.pos];
  return line !== undefined && line.trim() === '';
}

/** Whether the current (trimmed) line starts with `//`. */
export function isComment(state: ParserState): boolean {
  const line = currentLine(state);
  return line !== undefined && line.startsWith('//');
}

/** Whether the current (trimmed) line starts with `interface`. */
export function isInterfaceStart(state: ParserState): boolean {
  const line = currentLine(state);
  return line !== undefined && PATTERNS.interfaceDecl.test(line);
}

/** Extract the text content after `//` from a comment line, trimmed. */
export function extractCommentText(line: string): string {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//')
    ? trimmed.slice(2).trim()
    : trimmed;
}
