import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables, type ArrayType, type BaseType } from '../src/ast.js';

function firstColumn(src: string) {
  return tables(parse(src))[0]!.columns[0]!;
}

describe('parser / array types', () => {
  it('parses an array of strings', () => {
    const col = firstColumn('interface X { tags: string[]; }');
    expect(col.type.kind).toBe('array');
    const arr = col.type as ArrayType;
    expect(arr.element.kind).toBe('base');
    expect((arr.element as BaseType).base).toBe('string');
  });

  it('parses an array of ints', () => {
    const col = firstColumn('interface X { scores: int[]; }');
    expect(col.type.kind).toBe('array');
    expect(((col.type as ArrayType).element as BaseType).base).toBe('int');
  });

  it('parses an array of json', () => {
    const col = firstColumn('interface X { metadata: json[]; }');
    expect(col.type.kind).toBe('array');
  });

  it('parses an array of sized strings', () => {
    const col = firstColumn('interface X { codes: string(10)[]; }');
    const arr = col.type as ArrayType;
    expect(arr.element.kind).toBe('base');
    expect((arr.element as BaseType).length).toBe(10);
  });

  it('allows nullable array columns', () => {
    const col = firstColumn('interface X { metadata?: json[]; }');
    expect(col.nullable).toBe(true);
    expect(col.type.kind).toBe('array');
  });

  it('rejects an array suffix applied to a union', () => {
    // ('a'|'b')[] is not allowed per the grammar — array only applies to simple_type
    expect(() => parse("interface X { v: 'a' | 'b'[]; }")).toThrow(AggregateError);
  });
});
