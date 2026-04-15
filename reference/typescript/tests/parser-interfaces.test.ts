import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import { tables } from '../src/ast.js';

describe('parser / interface declarations', () => {
  it('parses an empty interface', () => {
    const schema = parse('interface Empty {}');
    expect(tables(schema)).toHaveLength(1);
    expect(tables(schema)[0]!.name).toBe('Empty');
    expect(tables(schema)[0]!.columns).toEqual([]);
  });

  it('parses a minimal interface with one column', () => {
    const schema = parse('interface Users { id: int; }');
    const t = tables(schema)[0]!;
    expect(t.name).toBe('Users');
    expect(t.quoted).toBe(false);
    expect(t.columns).toHaveLength(1);
    expect(t.columns[0]!.name).toBe('id');
    expect(t.columns[0]!.nullable).toBe(false);
  });

  it('parses multiple interfaces in one source', () => {
    const schema = parse(`
      interface A { id: int; }
      interface B { id: int; }
    `);
    expect(tables(schema).map((t) => t.name)).toEqual(['A', 'B']);
  });

  it('preserves top-level declaration order', () => {
    const schema = parse(`
      interface C { id: int; }
      interface A { id: int; }
      interface B { id: int; }
    `);
    expect(tables(schema).map((t) => t.name)).toEqual(['C', 'A', 'B']);
  });

  it('parses an interface spread across multiple lines', () => {
    const schema = parse(`
      interface Users {
        id: int;
        email: string;
      }
    `);
    const t = tables(schema)[0]!;
    expect(t.columns.map((c) => c.name)).toEqual(['id', 'email']);
  });

  it('parses an interface with all columns on one line', () => {
    const schema = parse('interface X { a: int; b: int; c: int; }');
    expect(tables(schema)[0]!.columns).toHaveLength(3);
  });

  it('accepts a quoted-identifier interface name', () => {
    const schema = parse('interface `Order Details` { id: int; }');
    const t = tables(schema)[0]!;
    expect(t.name).toBe('Order Details');
    expect(t.quoted).toBe(true);
  });

  it('accepts an identifier containing escaped backticks', () => {
    const schema = parse('interface `foo``bar` { id: int; }');
    expect(tables(schema)[0]!.name).toBe('foo`bar');
  });

  it('captures leading comments on the interface', () => {
    const schema = parse(`
      // description line 1
      // description line 2
      interface X { id: int; }
    `);
    expect(tables(schema)[0]!.leadingComments).toEqual([
      ' description line 1',
      ' description line 2',
    ]);
  });

  it('reports a parse error with line and column for a missing brace', () => {
    const result = parseRaw('interface X id: int;');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/lbrace/);
  });

  it('parse() throws AggregateError on parse failure', () => {
    expect(() => parse('interface X')).toThrow(AggregateError);
  });

  it('ignores a trailing comment on the closing brace line', () => {
    const schema = parse('interface X { id: int; } // end of X');
    expect(tables(schema)).toHaveLength(1);
    expect(tables(schema)[0]!.columns).toHaveLength(1);
  });

  it('parses an interface whose body contains only comments', () => {
    const schema = parse(`
      interface Empty {
        // This interface has no columns yet.
      }
    `);
    expect(tables(schema)[0]!.columns).toEqual([]);
  });
});

describe('parser / contextual keywords as column names', () => {
  it('accepts "type" as a column name', () => {
    const schema = parse('interface X { type: string; }');
    expect(tables(schema)[0]!.columns[0]!.name).toBe('type');
  });

  it('accepts "view" as a column name', () => {
    const schema = parse('interface X { view: string; }');
    expect(tables(schema)[0]!.columns[0]!.name).toBe('view');
  });

  it('accepts "interface" as a column name', () => {
    const schema = parse('interface X { interface: string; }');
    expect(tables(schema)[0]!.columns[0]!.name).toBe('interface');
  });

  it('accepts multiple contextual-keyword columns in one interface', () => {
    const schema = parse('interface X { type: string; view: int; interface: boolean; }');
    expect(tables(schema)[0]!.columns.map((c) => c.name)).toEqual([
      'type',
      'view',
      'interface',
    ]);
  });
});
