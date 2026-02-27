import { PATTERNS } from '../constants.js';

export interface TypeResult {
  type: string;
  length?: number;
  isArray: boolean;
  unionValues: (string | number)[];
}

/**
 * Parse a type expression string (the part after `:` in a column definition).
 *
 * Handles:
 * - Simple types: `int`, `string(255)`, `json[]`
 * - Literal union types: `'a' | 'b' | 'c'`, `1 | 2 | 3`, `-1 | 0 | 1`
 *
 * Returns `null` if the expression cannot be parsed.
 */
export function parseTypeExpression(expr: string): TypeResult | null {
  const trimmed = expr.trim();

  // Check for union type first
  if (PATTERNS.unionType.test(trimmed)) {
    return parseUnionType(trimmed);
  }

  // Simple type
  const match = PATTERNS.simpleType.exec(trimmed);
  if (!match) return null;

  return {
    type: match[1]!,
    length: match[2] !== undefined ? parseInt(match[2], 10) : undefined,
    isArray: match[3] !== undefined,
    unionValues: [],
  };
}

/** Parse a literal union type like `'a' | 'b'` or `1 | 2 | 3`. */
function parseUnionType(expr: string): TypeResult {
  const values: (string | number)[] = [];

  for (const part of expr.split('|')) {
    const trimmed = part.trim();
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      values.push(trimmed.slice(1, -1));
    } else {
      values.push(parseInt(trimmed, 10));
    }
  }

  return {
    type: 'union',
    length: undefined,
    isArray: false,
    unionValues: values,
  };
}
