/**
 * Parses structured constraints out of TSSN comment text.
 *
 * Two entry points:
 *   - parseInlineConstraints(raw): column-level constraints from a comment
 *     after `//` on a column line (e.g., "PRIMARY KEY, AUTO_INCREMENT").
 *   - parseInterfaceConstraint(raw): interface-level multi-column constraints
 *     from a standalone comment inside an interface body
 *     (e.g., "PK(a, b)", "UNIQUE(a, b)", "INDEX(a, b)").
 *
 * Both functions are conservative: patterns they don't recognize are left
 * as part of the raw comment text on the column, not consumed silently.
 * This preserves L1 opaque-capture semantics even for Level 2 and 3.
 */

import type {
  Constraint,
  ForeignKeyConstraint,
} from './ast.js';

/** Recognizes column-level constraint patterns in a column comment. */
export function parseInlineConstraints(rawComment: string): Constraint[] {
  const out: Constraint[] = [];

  // PRIMARY KEY / PK
  const pkMatch = rawComment.match(/\b(?:PRIMARY\s+KEY|PK)\b/i);
  if (pkMatch) {
    out.push({ kind: 'primary_key', raw: pkMatch[0] });
  }

  // FOREIGN KEY / FK -> [schema.]Table(column) [ON DELETE ...]
  // Supports optional schema prefix, quoted identifiers left for future work.
  const fkPattern =
    /\b(?:FOREIGN\s+KEY|FK)\s*->\s*(?:(\w+)\.)?(\w+)\s*\(\s*(\w+)\s*\)(?:\s*,?\s*(ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION|RESTRICT)))?/i;
  const fkMatch = rawComment.match(fkPattern);
  if (fkMatch) {
    const fk: ForeignKeyConstraint = {
      kind: 'foreign_key',
      table: fkMatch[2]!,
      column: fkMatch[3]!,
      raw: fkMatch[0],
    };
    if (fkMatch[1] !== undefined) fk.schema = fkMatch[1];
    if (fkMatch[4] !== undefined) fk.tail = fkMatch[4].trim();
    out.push(fk);
  }

  // UNIQUE (single-column, inline)
  const uniqueMatch = rawComment.match(/\bUNIQUE\b/i);
  if (uniqueMatch) {
    out.push({ kind: 'unique', raw: uniqueMatch[0] });
  }

  // INDEX (single-column, inline)
  const indexMatch = rawComment.match(/\bINDEX\b/i);
  if (indexMatch) {
    out.push({ kind: 'index', raw: indexMatch[0] });
  }

  // AUTO_INCREMENT / IDENTITY
  const aiMatch = rawComment.match(/\b(?:AUTO_INCREMENT|IDENTITY)\b/i);
  if (aiMatch) {
    out.push({ kind: 'auto_increment', raw: aiMatch[0] });
  }

  // DEFAULT <value>  — value runs to the next comma or end of string.
  const defaultMatch = rawComment.match(/\bDEFAULT\s+([^,]+?)(?:\s*,|$)/i);
  if (defaultMatch) {
    const value = defaultMatch[1]!.trim();
    out.push({
      kind: 'default',
      value,
      raw: `DEFAULT ${value}`,
    });
  }

  // @computed [: expression]
  // Expression runs to end of comment, since it's often free-form SQL.
  const computedMatch = rawComment.match(/@computed(?:\s*:\s*(.*))?$/i);
  if (computedMatch) {
    const expr = computedMatch[1]?.trim();
    if (expr !== undefined && expr.length > 0) {
      out.push({ kind: 'computed', expression: expr, raw: computedMatch[0].trim() });
    } else {
      out.push({ kind: 'computed', raw: '@computed' });
    }
  }

  return out;
}

/** Recognizes interface-level `PK(a, b)` / `UNIQUE(a, b)` / `INDEX(a, b)`
 *  patterns in a standalone body comment. Returns null if the comment is
 *  not a recognized multi-column constraint. */
export function parseInterfaceConstraint(rawComment: string): Constraint | null {
  const trimmed = rawComment.trim();
  const match = trimmed.match(/^(PK|UNIQUE|INDEX)\s*\(\s*([^)]+?)\s*\)\s*$/i);
  if (!match) return null;

  const keyword = match[1]!.toUpperCase();
  const columns = match[2]!
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (columns.length === 0) return null;

  const raw = trimmed;
  if (keyword === 'PK') {
    return { kind: 'composite_primary_key', columns, raw };
  }
  if (keyword === 'UNIQUE') {
    return { kind: 'unique', columns, raw };
  }
  // keyword === 'INDEX'
  return { kind: 'index', columns, raw };
}
