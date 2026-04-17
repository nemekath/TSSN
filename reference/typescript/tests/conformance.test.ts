/**
 * Data-driven harness for the repo-level conformance suite at
 * /tests/conformance/. For every `.tssn` / `.expected.json` pair
 * under level1/, level2/, level3/, this test either parses and
 * verifies the described outcome (positive fixture) or confirms the
 * expected errors are raised (negative fixture).
 *
 * The fixture format is documented at tests/conformance/README.md.
 * If you add fields to the sidecar, extend the type PositiveExpected
 * and/or NegativeExpected below and add the corresponding assertion.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import { validate } from '../src/validate.js';
import { tables, views, typeAliases } from '../src/ast.js';

// ---------- fixture discovery ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFORMANCE_ROOT = resolve(__dirname, '../../../tests/conformance');

type ColumnSpec = string | { name: string; nullable?: boolean };

interface PositiveExpected {
  kind: 'positive';
  description: string;
  level: 1 | 2 | 3;
  declarationCount?: number;
  tables?: Array<{
    name: string;
    columns?: ColumnSpec[];
    /** Per-column constraint-kind assertions. Key = column name, value = expected kinds. */
    columnConstraints?: Record<string, string[]>;
    schema?: string;
  }>;
  views?: Array<{
    name: string;
    columns?: ColumnSpec[];
    columnConstraints?: Record<string, string[]>;
    materialized?: boolean;
    readonly?: boolean;
    schema?: string;
  }>;
  aliases?: Array<{ name: string }>;
}

interface NegativeExpected {
  kind: 'negative';
  description: string;
  level: 1 | 2 | 3;
  errorCodes?: string[];
  errorMessage?: string;
}

type Expected = PositiveExpected | NegativeExpected;

interface Fixture {
  name: string;
  level: 1 | 2 | 3;
  tssn: string;
  expected: Expected;
}

function loadFixtures(level: 1 | 2 | 3): Fixture[] {
  const dir = join(CONFORMANCE_ROOT, `level${level}`);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const tssnFiles = entries.filter((f) => f.endsWith('.tssn')).sort();
  const fixtures: Fixture[] = [];
  for (const tssnFile of tssnFiles) {
    const name = basename(tssnFile, '.tssn');
    const tssnPath = join(dir, tssnFile);
    const expectedPath = join(dir, `${name}.expected.json`);
    const tssn = readFileSync(tssnPath, 'utf8');
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as Expected;
    fixtures.push({ name, level, tssn, expected });
  }
  return fixtures;
}

// ---------- assertion helpers ----------

import type { Column } from '../src/ast.js';

function assertColumns(got: Column[], expected: ColumnSpec[]): void {
  const expectedNames = expected.map((c) => (typeof c === 'string' ? c : c.name));
  expect(got.map((c) => c.name)).toEqual(expectedNames);
  for (const [i, spec] of expected.entries()) {
    if (typeof spec === 'object' && spec.nullable !== undefined) {
      expect(got[i]!.nullable).toBe(spec.nullable);
    }
  }
}

/**
 * Subset assertion: every expected constraint kind MUST be present
 * on the column, but the harness does NOT fail on extra kinds the
 * parser emits. This is a deliberate design choice, not a bug — see
 * the normative contract at `tests/conformance/README.md` §76-79:
 * "An implementation MAY expose additional AST detail that is not
 * described here; the harness MUST NOT fail on extra fields."
 *
 * A future fixture that needs exact equality (e.g., "this column has
 * PK and nothing else") would require a new sidecar field such as
 * `columnConstraintsExact`. Not added speculatively.
 */
function assertColumnConstraints(
  got: Column[],
  expectedConstraints: Record<string, string[]>
): void {
  for (const [colName, kinds] of Object.entries(expectedConstraints)) {
    const col = got.find((c) => c.name === colName);
    expect(col, `column '${colName}' not found`).toBeDefined();
    const gotKinds = col!.constraints.map((c) => c.kind);
    for (const kind of kinds) {
      expect(gotKinds).toContain(kind);
    }
  }
}

function runPositive(fx: Fixture, expected: PositiveExpected): void {
  const schema = parse(fx.tssn, { filename: `${fx.name}.tssn` });

  if (expected.declarationCount !== undefined) {
    expect(schema.declarations).toHaveLength(expected.declarationCount);
  }

  if (expected.aliases !== undefined) {
    const got = typeAliases(schema);
    expect(got.map((a) => a.name)).toEqual(expected.aliases.map((a) => a.name));
  }

  if (expected.tables !== undefined) {
    const got = tables(schema);
    expect(got.map((t) => t.name)).toEqual(expected.tables.map((t) => t.name));
    for (const [i, expectedTable] of expected.tables.entries()) {
      const gotTable = got[i]!;
      if (expectedTable.columns !== undefined) {
        assertColumns(gotTable.columns, expectedTable.columns);
      }
      if (expectedTable.columnConstraints !== undefined) {
        assertColumnConstraints(gotTable.columns, expectedTable.columnConstraints);
      }
      if (expectedTable.schema !== undefined) {
        expect(gotTable.schema).toBe(expectedTable.schema);
      }
    }
  }

  if (expected.views !== undefined) {
    const got = views(schema);
    expect(got.map((v) => v.name)).toEqual(expected.views.map((v) => v.name));
    for (const [i, expectedView] of expected.views.entries()) {
      const gotView = got[i]!;
      if (expectedView.columns !== undefined) {
        assertColumns(gotView.columns, expectedView.columns);
      }
      if (expectedView.columnConstraints !== undefined) {
        assertColumnConstraints(gotView.columns, expectedView.columnConstraints);
      }
      if (expectedView.materialized !== undefined) {
        expect(gotView.materialized).toBe(expectedView.materialized);
      }
      if (expectedView.readonly !== undefined) {
        expect(gotView.readonly).toBe(expectedView.readonly);
      }
      if (expectedView.schema !== undefined) {
        expect(gotView.schema).toBe(expectedView.schema);
      }
    }
  }
}

function runNegative(fx: Fixture, expected: NegativeExpected): void {
  // Collect both parse errors and validation errors
  const { schema, errors: parseErrors } = parseRaw(fx.tssn, {
    filename: `${fx.name}.tssn`,
  });
  const validationErrors =
    parseErrors.length === 0 ? validate(schema) : [];
  const allErrors = [
    ...parseErrors.map((e) => ({ code: undefined, message: e.message })),
    ...validationErrors.map((e) => ({ code: e.code, message: e.message })),
  ];
  expect(allErrors.length).toBeGreaterThan(0);

  if (expected.errorCodes !== undefined) {
    const gotCodes = allErrors
      .map((e) => e.code)
      .filter((c): c is string => c !== undefined);
    for (const code of expected.errorCodes) {
      expect(gotCodes).toContain(code);
    }
  }

  if (expected.errorMessage !== undefined) {
    const combined = allErrors.map((e) => e.message).join(' | ');
    expect(combined).toContain(expected.errorMessage);
  }
}

// ---------- test registration ----------

for (const level of [1, 2, 3] as const) {
  const fixtures = loadFixtures(level);
  describe(`conformance / Level ${level}`, () => {
    if (fixtures.length === 0) {
      it.skip('(no fixtures found — place files under tests/conformance/level{N}/)', () => {});
      return;
    }
    for (const fx of fixtures) {
      it(`${fx.name}: ${fx.expected.description}`, () => {
        if (fx.expected.kind === 'positive') {
          runPositive(fx, fx.expected);
        } else {
          runNegative(fx, fx.expected);
        }
      });
    }
  });
}
