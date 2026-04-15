import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables, type Literal, type UnionType } from '../src/ast.js';

function firstColumn(src: string) {
  return tables(parse(src))[0]!.columns[0]!;
}

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
    // Grammar allows it syntactically (both are literals) so this is
    // technically parseable. The validator would flag it as semantically
    // suspect, but for v0.8 we accept it at parse time for maximum
    // compatibility with terse enums.
    const u = union("interface X { v: 'yes' | 1; }");
    expect(u.literals).toHaveLength(2);
    expect(u.literals[0]!.kind).toBe('string');
    expect(u.literals[1]!.kind).toBe('number');
  });
});
