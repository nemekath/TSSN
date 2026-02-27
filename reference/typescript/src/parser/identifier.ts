import { PATTERNS } from '../constants.js';

/**
 * Parse an identifier (simple or backtick-quoted) from the start of `input`.
 *
 * Returns `[name, rest]` where `rest` is the remaining string after the
 * identifier, or `null` if no valid identifier is found.
 *
 * Inside quoted identifiers, ```` `` ```` is unescaped to a single backtick.
 */
export function parseIdentifier(input: string): [name: string, rest: string] | null {
  // Try quoted identifier first
  if (input.startsWith('`')) {
    const match = PATTERNS.quotedId.exec(input);
    if (!match) return null;
    const raw = match[1]!;
    // Unescape doubled backticks
    const name = raw.replace(/``/g, '`');
    const rest = input.slice(match[0].length);
    return [name, rest];
  }

  // Simple identifier
  const match = PATTERNS.simpleId.exec(input);
  if (!match) return null;
  return [match[0], input.slice(match[0].length)];
}
