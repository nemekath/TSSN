import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import {
  tables,
  typeAliases,
  type AliasType,
  type ArrayType,
  type BaseType,
  type UnionType,
} from '../src/ast.js';

describe('parser / type aliases', () => {
  it('collects a simple string-union alias', () => {
    const schema = parse(`
      type OrderStatus = 'pending' | 'shipped' | 'delivered';
      interface Orders { id: int; }
    `);
    const aliases = typeAliases(schema);
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.name).toBe('OrderStatus');
    expect(aliases[0]!.rhs.kind).toBe('union');
  });

  it('collects a numeric union alias', () => {
    const schema = parse('type Priority = 1 | 2 | 3;');
    expect(typeAliases(schema)[0]!.rhs.kind).toBe('union');
  });

  it('collects a sized-string alias', () => {
    const schema = parse('type ShortCode = string(10);');
    const rhs = typeAliases(schema)[0]!.rhs as BaseType;
    expect(rhs.kind).toBe('base');
    expect(rhs.length).toBe(10);
  });

  it('collects an array-type alias', () => {
    const schema = parse('type Tags = string[];');
    const rhs = typeAliases(schema)[0]!.rhs as ArrayType;
    expect(rhs.kind).toBe('array');
  });

  it('collects an unsized base-type alias', () => {
    const schema = parse('type Name = string;');
    const rhs = typeAliases(schema)[0]!.rhs as BaseType;
    expect(rhs.kind).toBe('base');
    expect(rhs.length).toBeUndefined();
  });

  it('resolves an alias at a column site', () => {
    const schema = parse(`
      type OrderStatus = 'pending' | 'shipped' | 'delivered';
      interface Orders {
        id: int;
        status: OrderStatus;
      }
    `);
    const col = tables(schema)[0]!.columns[1]!;
    expect(col.type.kind).toBe('alias');
    const alias = col.type as AliasType;
    expect(alias.name).toBe('OrderStatus');
    expect(alias.resolved.kind).toBe('union');
    expect((alias.resolved as UnionType).literals).toHaveLength(3);
  });

  it('allows the same alias to be used in multiple interfaces', () => {
    const schema = parse(`
      type OrderStatus = 'pending' | 'shipped';
      interface Orders { status: OrderStatus; }
      interface Shipments { status: OrderStatus; }
    `);
    const [orders, shipments] = tables(schema);
    expect(orders!.columns[0]!.type.kind).toBe('alias');
    expect(shipments!.columns[0]!.type.kind).toBe('alias');
    expect((orders!.columns[0]!.type as AliasType).name).toBe('OrderStatus');
    expect((shipments!.columns[0]!.type as AliasType).name).toBe('OrderStatus');
  });

  it('preserves the alias name alongside the resolved type for round-trip', () => {
    const schema = parse(`
      type Status = 'a' | 'b';
      interface X { status: Status; }
    `);
    const alias = tables(schema)[0]!.columns[0]!.type as AliasType;
    expect(alias.name).toBe('Status');
    expect(alias.resolved.kind).toBe('union');
  });

  it('allows a nullable column using an alias', () => {
    const schema = parse(`
      type Status = 'a' | 'b';
      interface X { prev?: Status; }
    `);
    const col = tables(schema)[0]!.columns[0]!;
    expect(col.nullable).toBe(true);
    expect(col.type.kind).toBe('alias');
  });

  it('rejects alias-to-alias references', () => {
    const result = parseRaw(`
      type A = 'x' | 'y';
      type B = A;
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toMatch(/cannot reference another alias/i);
  });

  it('rejects a type alias declared after an interface', () => {
    const result = parseRaw(`
      interface X { id: int; }
      type Late = 'a' | 'b';
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toMatch(/before any interface or view/i);
  });

  it('rejects duplicate alias names', () => {
    const result = parseRaw(`
      type Status = 'a' | 'b';
      type Status = 'c' | 'd';
    `);
    expect(result.errors.some((e) => /duplicate/i.test(e.message))).toBe(true);
  });

  it('falls back to base-type interpretation for unknown ident that looks like an alias', () => {
    // With no alias declared, MyCustomType is treated as a base type.
    const schema = parse('interface X { v: MyCustomType; }');
    const col = tables(schema)[0]!.columns[0]!;
    expect(col.type.kind).toBe('base');
    expect((col.type as BaseType).base).toBe('MyCustomType');
  });
});
