import type { Annotation } from '../types.js';
import { PATTERNS } from '../constants.js';

/**
 * Extract all `@name: value` annotations from a comment string.
 *
 * Multiple annotations in a single string are all returned.
 * Annotations are delimited by `, @` boundaries.
 */
export function parseAnnotations(comment: string): Annotation[] {
  const annotations: Annotation[] = [];
  const re = new RegExp(PATTERNS.annotation.source, 'g');

  let match: RegExpExecArray | null;
  while ((match = re.exec(comment)) !== null) {
    annotations.push({
      name: match[1]!,
      value: match[2]!.trim(),
    });
  }

  return annotations;
}
