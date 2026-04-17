import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import { type Literal, type UnionType } from '../src/ast.js';
import { firstColumn } from './helpers.js';

function union(src: string): UnionType {
  const col = firstColumn(src);
  expect(col.type.kind).toBe('union');
  return col.type as UnionType;
}

function literalValues(u: UnionType): (string | number)[] {
  return u.literals.map((l: Literal) => l.value);
}

describe('parser / literal union types', () => {
  it('parses a string union', () => {
    const u = union("interface X { status: 'pending' | 'shipped' | 'delivered'; }");
    expect(literalValues(u)).toEqual(['pending', 'shipped', 'delivered']);
    expect(u.literals.every((l) => l.kind === 'string')).toBe(true);
  });

  it('parses a numeric union', () => {
    const u = union('interface X { priority: 1 | 2 | 3; }');
    expect(literalValues(u)).toEqual([1, 2, 3]);
    expect(u.literals.every((l) => l.kind === 'number')).toBe(true);
  });

  it('parses a two-value union (the minimum)', () => {
    const u = union("interface X { flag: 'on' | 'off'; }");
    expect(u.literals).toHaveLength(2);
  });

  it('rejects a single-literal "union"', () => {
    expect(() => parse("interface X { v: 'only'; }")).toThrow(AggregateError);
  });

  it('accepts negative numbers in a union', () => {
    const u = union('interface X { temp: -1 | 0 | 1; }');
    expect(literalValues(u)).toEqual([-1, 0, 1]);
  });

  it('accepts nullable unions', () => {
    const col = firstColumn("interface X { method?: 'card' | 'bank'; }");
    expect(col.nullable).toBe(true);
    expect(col.type.kind).toBe('union');
  });

  it('allows string literals containing // without confusing the comment scanner', () => {
    const u = union("interface X { scheme: 'http://example' | 'https://example'; }");
    expect(literalValues(u)).toEqual(['http://example', 'https://example']);
  });

  it('parses a multi-line union', () => {
    const u = union(`interface X {
      status:
        'pending'
      | 'shipped'
      | 'delivered';
    }`);
    expect(literalValues(u)).toEqual(['pending', 'shipped', 'delivered']);
  });

  it('rejects mixed string and numeric literals in a union', () => {
    // Per Spec 2.2.6 (added in 0.8), unions MUST be homogeneous.
    // Grammar accepts the token sequence but the validator rejects it.
    expect(() => parse("interface X { v: 'yes' | 1; }")).toThrow(AggregateError);
  });

  it('reports the heterogeneous_union error code for mixed literals', () => {
    const { schema, errors: parseErrors } = parseRaw(
      "interface X { v: 'yes' | 1; }"
    );
    expect(parseErrors).toEqual([]);
    expect(schema.declarations).toHaveLength(1);
    // parse() includes validation — MUST throw, catch guard ensures
    // the test fails if it doesn't
    let caught = false;
    try {
      parse("interface X { v: 'yes' | 1; }");
    } catch (e) {
      caught = true;
      expect(e).toBeInstanceOf(AggregateError);
      const codes = ((e as AggregateError).errors as Array<{ code?: string }>).map(
        (er) => er.code
      );
      expect(codes).toContain('heterogeneous_union');
    }
    expect(caught).toBe(true);
  });
});
