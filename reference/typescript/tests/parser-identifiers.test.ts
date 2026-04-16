import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables } from '../src/ast.js';

describe('parser / quoted identifiers', () => {
  it('accepts a table name with a space', () => {
    const t = tables(parse('interface `Order Details` { id: int; }'))[0]!;
    expect(t.name).toBe('Order Details');
    expect(t.quoted).toBe(true);
  });

  it('accepts a column name with a space', () => {
    const col = tables(parse('interface X { `Order ID`: int; }'))[0]!.columns[0]!;
    expect(col.name).toBe('Order ID');
    expect(col.quoted).toBe(true);
  });

  it('accepts multiple quoted columns', () => {
    const t = tables(
      parse('interface `Order Details` { `Order ID`: int; `Product Name`: string(100); }')
    )[0]!;
    expect(t.columns.map((c) => c.name)).toEqual(['Order ID', 'Product Name']);
    expect(t.columns.every((c) => c.quoted)).toBe(true);
  });

  it('unescapes doubled backticks in quoted identifiers', () => {
    const t = tables(parse('interface `foo``bar` { `a``b`: int; }'))[0]!;
    expect(t.name).toBe('foo`bar');
    expect(t.columns[0]!.name).toBe('a`b');
  });

  it('accepts hyphens in quoted identifiers', () => {
    const col = tables(parse('interface X { `user-id`: int; }'))[0]!.columns[0]!;
    expect(col.name).toBe('user-id');
  });

  it('accepts reserved-looking words inside quoted identifiers', () => {
    const col = tables(parse('interface X { `order`: int; }'))[0]!.columns[0]!;
    expect(col.name).toBe('order');
    expect(col.quoted).toBe(true);
  });

  it('allows identifier starting with a digit when quoted', () => {
    const col = tables(parse('interface X { `123Orders`: int; }'))[0]!.columns[0]!;
    expect(col.name).toBe('123Orders');
  });
});
