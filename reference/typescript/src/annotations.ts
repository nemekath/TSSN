/**
 * Parses `@key` and `@key: value` domain annotations out of TSSN comments.
 *
 * Two entry points:
 *   - parseLeadingAnnotation(rawComment, span): a standalone leading
 *     comment that is expected to be entirely one annotation (e.g.
 *     `@schema: auth`, `@materialized`). Returns null if the comment
 *     doesn't match the single-annotation form.
 *   - parseInlineAnnotations(rawComment, span): one or more annotations
 *     embedded in a column-level comment alongside other text (e.g.
 *     `UNIQUE, @deprecated, @since: v2.0`). Returns all annotation
 *     occurrences found.
 *
 * Annotations whose semantics are modeled as constraints elsewhere in
 * the parser (currently just `@computed`) are deliberately skipped by
 * parseInlineAnnotations so they don't get double-reported under both
 * `column.constraints` and `column.annotations`.
 */

import type { Annotation, Span } from './ast.js';

/** Annotation keys that are modeled as constraints in the AST rather
 *  than as entries in the annotations array. Kept out of inline
 *  annotation extraction to avoid duplicate reporting. */
const CONSTRAINT_ANNOTATION_KEYS = new Set(['computed']);

/** Parse a comment that is expected to be exactly one annotation. */
export function parseLeadingAnnotation(
  rawComment: string,
  span: Span
): Annotation | null {
  const match = rawComment.match(/^\s*@(\w+)(?:\s*:\s*(.+?))?\s*$/);
  if (!match) return null;
  const ann: Annotation = {
    key: match[1]!,
    raw: rawComment.trim(),
    span,
  };
  if (match[2] !== undefined) ann.value = match[2].trim();
  return ann;
}

/** Find every `@key` / `@key: value` fragment inside a mixed comment. */
export function parseInlineAnnotations(
  rawComment: string,
  span: Span
): Annotation[] {
  const out: Annotation[] = [];
  // Each annotation runs until the next comma or end of string.
  const pattern = /@(\w+)(?:\s*:\s*([^,]+))?/g;
  for (const match of rawComment.matchAll(pattern)) {
    const key = match[1]!;
    if (CONSTRAINT_ANNOTATION_KEYS.has(key)) continue;
    const ann: Annotation = {
      key,
      raw: match[0].trim(),
      span,
    };
    if (match[2] !== undefined) ann.value = match[2].trim();
    out.push(ann);
  }
  return out;
}
