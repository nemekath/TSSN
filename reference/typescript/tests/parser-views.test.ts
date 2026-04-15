import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables, views } from '../src/ast.js';

describe('parser / views', () => {
  it('parses a basic view declaration', () => {
    const schema = parse(`
      view ActiveUsers {
        id: int;
        email: string(255);
      }
    `);
    expect(views(schema)).toHaveLength(1);
    expect(tables(schema)).toHaveLength(0);
    const v = views(schema)[0]!;
    expect(v.kind).toBe('view');
    expect(v.name).toBe('ActiveUsers');
    expect(v.columns).toHaveLength(2);
  });

  it('marks a view as read-only by default', () => {
    const v = views(parse('view X { id: int; }'))[0]!;
    expect(v.readonly).toBe(true);
    expect(v.updatable).toBe(false);
    expect(v.materialized).toBe(false);
  });

  it('recognises @materialized', () => {
    const v = views(
      parse(`
        // @materialized
        view UserStats {
          user_id: int;
          total_orders: int;
        }
      `)
    )[0]!;
    expect(v.materialized).toBe(true);
  });

  it('recognises explicit @readonly', () => {
    const v = views(
      parse(`
        // @readonly
        view X { id: int; }
      `)
    )[0]!;
    expect(v.readonly).toBe(true);
  });

  it('recognises @updatable and flips default read-only off', () => {
    const v = views(
      parse(`
        // @updatable
        view X { id: int; }
      `)
    )[0]!;
    expect(v.updatable).toBe(true);
    expect(v.readonly).toBe(false);
  });

  it('allows mixing materialized with other annotations', () => {
    const v = views(
      parse(`
        // @materialized
        // @readonly
        view X { id: int; }
      `)
    )[0]!;
    expect(v.materialized).toBe(true);
    expect(v.readonly).toBe(true);
  });

  it('allows a view to live alongside an interface', () => {
    const schema = parse(`
      interface Users { id: int; }
      view ActiveUsers { id: int; }
    `);
    expect(tables(schema)).toHaveLength(1);
    expect(views(schema)).toHaveLength(1);
    expect(schema.declarations.map((d) => d.kind)).toEqual(['table', 'view']);
  });

  it('supports quoted view names', () => {
    const v = views(parse('view `Active Users` { id: int; }'))[0]!;
    expect(v.name).toBe('Active Users');
    expect(v.quoted).toBe(true);
  });

  it('supports a @schema annotation on a view', () => {
    const v = views(
      parse(`
        // @schema: reporting
        view Dashboard { id: int; }
      `)
    )[0]!;
    expect(v.schema).toBe('reporting');
  });
});
