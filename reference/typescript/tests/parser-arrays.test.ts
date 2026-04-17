import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { type ArrayType, type BaseType } from '../src/ast.js';
import { firstColumn } from './helpers.js';

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

  it('rejects [] after the last literal of a union (array only applies to simple_type)', () => {
    // The input is 'a' | 'b'[] — the parser consumes the union 'a'|'b',
    // then [] is a leftover token that triggers a "Expected semi" error.
    expect(() => parse("interface X { v: 'a' | 'b'[]; }")).toThrow(AggregateError);
  });
});
