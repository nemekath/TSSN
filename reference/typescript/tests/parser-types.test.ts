import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables, type BaseType } from '../src/ast.js';
import { firstColumn } from './helpers.js';

describe('parser / base types', () => {
  it.each([
    ['int'],
    ['string'],
    ['text'],
    ['char'],
    ['datetime'],
    ['date'],
    ['time'],
    ['boolean'],
    ['decimal'],
    ['float'],
    ['number'],
    ['blob'],
    ['uuid'],
    ['json'],
  ])('parses base type %s', (typeName) => {
    const col = firstColumn(`interface X { v: ${typeName}; }`);
    expect(col.type.kind).toBe('base');
    expect((col.type as BaseType).base).toBe(typeName);
    expect((col.type as BaseType).length).toBeUndefined();
  });

  it('parses a sized string', () => {
    const col = firstColumn('interface X { email: string(255); }');
    expect(col.type.kind).toBe('base');
    expect((col.type as BaseType).base).toBe('string');
    expect((col.type as BaseType).length).toBe(255);
  });

  it('parses a sized char', () => {
    const col = firstColumn('interface X { code: char(3); }');
    expect((col.type as BaseType).length).toBe(3);
  });

  it('allows zero length', () => {
    const col = firstColumn('interface X { v: string(0); }');
    expect((col.type as BaseType).length).toBe(0);
  });

  it('rejects a negative length', () => {
    expect(() => parse('interface X { v: string(-1); }')).toThrow(AggregateError);
  });
});

describe('parser / nullability', () => {
  it('defaults to non-nullable', () => {
    const col = firstColumn('interface X { id: int; }');
    expect(col.nullable).toBe(false);
  });

  it('recognises the ? marker', () => {
    const col = firstColumn('interface X { email?: string; }');
    expect(col.nullable).toBe(true);
  });

  it('allows ? on a sized type', () => {
    const col = firstColumn('interface X { email?: string(255); }');
    expect(col.nullable).toBe(true);
    expect((col.type as BaseType).length).toBe(255);
  });
});

describe('parser / underscore-leading identifiers', () => {
  it('accepts a column name starting with an underscore', () => {
    const col = firstColumn('interface X { _internal: int; }');
    expect(col.name).toBe('_internal');
    expect(col.quoted).toBe(false);
  });

  it('accepts a bare underscore as a column name', () => {
    const col = firstColumn('interface X { _: int; }');
    expect(col.name).toBe('_');
  });

  it('accepts underscore-leading table names', () => {
    const schema = parse('interface _Internal { id: int; }');
    expect(tables(schema)[0]!.name).toBe('_Internal');
  });
});

describe('parser / quoted column identifiers', () => {
  it('parses a quoted column name', () => {
    const col = firstColumn('interface X { `Order ID`: int; }');
    expect(col.name).toBe('Order ID');
    expect(col.quoted).toBe(true);
  });

  it('parses a quoted column with nullable marker', () => {
    const col = firstColumn('interface X { `Ship Date`?: datetime; }');
    expect(col.name).toBe('Ship Date');
    expect(col.nullable).toBe(true);
  });
});

describe('parser / trailing comments', () => {
  it('captures a trailing comment raw', () => {
    const col = firstColumn('interface X { id: int; // PRIMARY KEY\n}');
    expect(col.rawComment).toBe(' PRIMARY KEY');
  });

  it('leaves rawComment null when no trailing comment is present', () => {
    const col = firstColumn('interface X { id: int; }');
    expect(col.rawComment).toBeNull();
  });

  it('does not attach a comment on a following line to the previous column', () => {
    const schema = parse(
      `interface X {
        id: int;
        // UNIQUE(id, email)
        email: string;
      }`
    );
    const cols = tables(schema)[0]!.columns;
    expect(cols[0]!.rawComment).toBeNull();
    expect(cols[1]!.rawComment).toBeNull();
  });
});

describe('parser / spans', () => {
  it('records a span on every column', () => {
    const col = firstColumn('interface X { id: int; }');
    expect(col.span.start.line).toBe(1);
    expect(col.span.end.line).toBe(1);
    expect(col.span.end.offset).toBeGreaterThan(col.span.start.offset);
  });

  it('records a span on every base type', () => {
    const col = firstColumn('interface X { id: int; }');
    expect(col.type.span.start.line).toBe(1);
    expect(col.type.span.end.offset).toBeGreaterThan(col.type.span.start.offset);
  });
});
