import type { Schema, Table, Column, ParseOptions, Annotation } from './types.js';
import { PATTERNS } from './constants.js';
import { ParseError } from './errors.js';
import {
  createParserState,
  currentLine,
  isBlank,
  isComment,
  isInterfaceStart,
  extractCommentText,
  type ParserState,
} from './parser/lexer.js';
import { parseIdentifier } from './parser/identifier.js';
import { parseTypeExpression } from './parser/type.js';
import { parseConstraints } from './parser/constraint.js';
import { parseAnnotations } from './parser/annotation.js';

/**
 * Parse a LINDT document into a structured {@link Schema}.
 *
 * Level 2 (Standard) conformant with Level 3 annotation support (v0.7.0).
 * Supports literal union types, array types, quoted identifiers,
 * cross-schema foreign keys, and domain annotations.
 */
export function parse(input: string, options?: ParseOptions): Schema {
  const state = createParserState(input);
  const tables: Table[] = [];
  const schemaMetadata: string[] = [];
  const pendingComments: string[] = [];

  while (state.pos < state.lines.length) {
    if (isBlank(state)) {
      // Per spec Section 2.5: comments "immediately preceding" an interface
      // are table metadata. A blank line breaks that association, flushing
      // any pending comments to schema-level metadata instead.
      if (pendingComments.length > 0) {
        schemaMetadata.push(...pendingComments.splice(0));
      }
      state.pos++;
      continue;
    }

    if (isComment(state)) {
      pendingComments.push(extractCommentText(currentLine(state)!));
      state.pos++;
      continue;
    }

    if (isInterfaceStart(state)) {
      const table = parseInterface(state, pendingComments.splice(0), options);
      tables.push(table);
      continue;
    }

    // Unexpected non-blank, non-comment, non-interface line
    throw new ParseError(
      `Unexpected content: "${currentLine(state)}"`,
      state.pos + 1,
    );
  }

  // Any leftover pending comments become schema-level metadata
  schemaMetadata.push(...pendingComments.splice(0));
  const schemaAnnotations = options?.skipAnnotations
    ? []
    : extractAnnotationsFromMetadata(schemaMetadata);

  return {
    tables,
    metadata: schemaMetadata,
    annotations: schemaAnnotations,
  };
}

// ---------------------------------------------------------------------------
// Interface parsing
// ---------------------------------------------------------------------------

function parseInterface(
  state: ParserState,
  pendingComments: string[],
  options?: ParseOptions,
): Table {
  const lineNum = state.pos + 1; // 1-based for errors
  const line = currentLine(state)!;

  // Match interface declaration
  const match = PATTERNS.interfaceDecl.exec(line);
  if (!match) {
    throw new ParseError('Invalid interface declaration', lineNum);
  }

  // Name: group 1 = quoted (with `` escapes), group 2 = simple
  const rawQuoted = match[1];
  const name = rawQuoted !== undefined
    ? rawQuoted.replace(/``/g, '`')
    : match[2]!;

  const columns: Column[] = [];
  const constraintComments: string[] = [];

  // Check for inline body content after `{` on the same line
  const afterBrace = line.slice(match[0].length).trim();
  // Handle `interface T {}` — empty body, closing brace on same line
  if (afterBrace === '}') {
    state.pos++;
    return buildTable(name, columns, constraintComments, pendingComments, options);
  }
  if (afterBrace) {
    // Single-line or partial-line body: split on `;` and process each segment
    const inlineBody = afterBrace.endsWith('}')
      ? afterBrace.slice(0, -1).trim()
      : afterBrace;

    if (inlineBody) {
      // Split segments by `;` but keep `//` comment attached to preceding segment
      for (const segment of splitInlineBody(inlineBody)) {
        const trimmed = segment.trim();
        if (!trimmed || trimmed === '}') continue;
        if (trimmed.startsWith('//')) {
          constraintComments.push(extractCommentText(trimmed));
        } else if (trimmed.includes(':')) {
          columns.push(parseColumnLine(trimmed, lineNum, options));
        }
      }
    }

    // If closing brace was on this line, we're done
    if (afterBrace.endsWith('}')) {
      state.pos++;
      return buildTable(name, columns, constraintComments, pendingComments, options);
    }
  }

  // Advance past the `interface ... {` line
  state.pos++;

  // Parse body until closing `}`
  let closed = false;
  while (state.pos < state.lines.length) {
    const bodyLine = currentLine(state);

    if (bodyLine === undefined) break;

    // Closing brace (only a bare `}`, optionally with trailing whitespace)
    if (bodyLine.trimEnd() === '}') {
      state.pos++;
      closed = true;
      break;
    }

    // Blank line inside body
    if (bodyLine.trim() === '') {
      state.pos++;
      continue;
    }

    // Comment inside body → constraint comment
    if (bodyLine.startsWith('//')) {
      constraintComments.push(extractCommentText(bodyLine));
      state.pos++;
      continue;
    }

    // Column definition (must contain `:`)
    if (bodyLine.includes(':')) {
      const col = parseColumnLine(bodyLine, state.pos + 1, options);
      columns.push(col);
      state.pos++;
      continue;
    }

    throw new ParseError(
      `Invalid content inside interface: "${bodyLine}"`,
      state.pos + 1,
    );
  }

  if (!closed) {
    throw new ParseError('Unclosed interface (missing `}`)', lineNum);
  }

  return buildTable(name, columns, constraintComments, pendingComments, options);
}

function buildTable(
  name: string,
  columns: Column[],
  constraintComments: string[],
  pendingComments: string[],
  options?: ParseOptions,
): Table {
  const annotations = options?.skipAnnotations
    ? []
    : extractAnnotationsFromMetadata(pendingComments);

  const schemaAnnotation = annotations.find(a => a.name === 'schema');
  const schema = schemaAnnotation?.value;

  return {
    name,
    columns,
    metadata: pendingComments,
    constraintComments,
    annotations,
    ...(schema !== undefined ? { schema } : {}),
  };
}

/**
 * Split inline body content (between `{` and `}`) into column segments.
 *
 * Each column definition ends at `;`. A `//` comment following a `;` is
 * attached to the preceding segment (as its inline comment).
 */
function splitInlineBody(body: string): string[] {
  const segments: string[] = [];
  // First pass: split on `;` boundaries, being careful not to split inside
  // single-quoted strings (union types like 'a' | 'b').
  const rawParts: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "'" ) {
      inString = !inString;
      current += ch;
    } else if (ch === ';' && !inString) {
      rawParts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    rawParts.push(current);
  }

  // Second pass: if a part starts with `//`, it's a comment that belongs
  // to the previous segment rather than being its own segment.
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i]!.trim();
    if (!part) continue;

    if (part.startsWith('//') && segments.length > 0) {
      // Attach comment to previous segment
      const prev = segments[segments.length - 1]!;
      segments[segments.length - 1] = prev + '; ' + part;
    } else {
      segments.push(part);
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Column parsing
// ---------------------------------------------------------------------------

function parseColumnLine(
  rawLine: string,
  lineNum: number,
  options?: ParseOptions,
): Column {
  let line = rawLine.trim();

  // Split on first `//` that is NOT inside a single-quoted string literal.
  // Union types like `'http://url' | 'other'` contain `//` inside quotes.
  const commentIdx = findCommentStart(line);
  let definition: string;
  let comment: string | undefined;

  if (commentIdx !== -1) {
    definition = line.slice(0, commentIdx).trim();
    comment = line.slice(commentIdx + 2).trim();
  } else {
    definition = line.trim();
    comment = undefined;
  }

  // Strip trailing semicolon from definition
  if (definition.endsWith(';')) {
    definition = definition.slice(0, -1).trimEnd();
  }

  // Parse identifier
  const idResult = parseIdentifier(definition);
  if (!idResult) {
    throw new ParseError(`Invalid column name in: "${rawLine.trim()}"`, lineNum);
  }

  let [columnName, rest] = idResult;

  // Check for nullable `?`
  let nullable = false;
  if (rest.startsWith('?')) {
    nullable = true;
    rest = rest.slice(1);
  }

  // Expect `:` separator
  rest = rest.trimStart();
  if (!rest.startsWith(':')) {
    throw new ParseError(`Expected ':' after column name in: "${rawLine.trim()}"`, lineNum);
  }
  rest = rest.slice(1).trim();

  // Parse type expression
  const typeResult = parseTypeExpression(rest);
  if (!typeResult) {
    throw new ParseError(`Invalid type expression "${rest}" in: "${rawLine.trim()}"`, lineNum);
  }

  // Parse constraints and annotations from comment
  const constraints = (comment && !options?.skipConstraints)
    ? parseConstraints(comment)
    : [];

  const annotations = (comment && !options?.skipAnnotations)
    ? parseAnnotations(comment)
    : [];

  return {
    name: columnName,
    type: typeResult.type,
    length: typeResult.length,
    nullable,
    isArray: typeResult.isArray,
    unionValues: typeResult.unionValues,
    constraints,
    comment,
    annotations,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the first `//` that is not inside a single-quoted string.
 * Returns -1 if no comment delimiter is found outside of string literals.
 */
function findCommentStart(line: string): number {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inString) {
      inString = true;
    } else if (ch === "'" && inString) {
      inString = false;
    } else if (ch === '/' && line[i + 1] === '/' && !inString) {
      return i;
    }
  }
  return -1;
}

function extractAnnotationsFromMetadata(metadata: readonly string[]): Annotation[] {
  const annotations: Annotation[] = [];
  for (const line of metadata) {
    annotations.push(...parseAnnotations(line));
  }
  return annotations;
}
