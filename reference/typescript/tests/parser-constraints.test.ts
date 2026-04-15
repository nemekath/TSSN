import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables, type ForeignKeyConstraint } from '../src/ast.js';

function constraintsOf(src: string) {
  const col = tables(parse(src))[0]!.columns[0]!;
  return col.constraints;
}

describe('parser / inline constraints', () => {
  it('parses PRIMARY KEY', () => {
    const cs = constraintsOf('interface X { id: int; // PRIMARY KEY\n}');
    expect(cs.some((c) => c.kind === 'primary_key')).toBe(true);
  });

  it('parses the short PK form', () => {
    const cs = constraintsOf('interface X { id: int; // PK\n}');
    expect(cs.some((c) => c.kind === 'primary_key')).toBe(true);
  });

  it('parses UNIQUE', () => {
    const cs = constraintsOf('interface X { email: string; // UNIQUE\n}');
    expect(cs.some((c) => c.kind === 'unique')).toBe(true);
  });

  it('parses INDEX', () => {
    const cs = constraintsOf('interface X { created_at: datetime; // INDEX\n}');
    expect(cs.some((c) => c.kind === 'index')).toBe(true);
  });

  it('parses AUTO_INCREMENT alongside PRIMARY KEY', () => {
    const cs = constraintsOf(
      'interface X { id: int; // PRIMARY KEY, AUTO_INCREMENT\n}'
    );
    expect(cs.map((c) => c.kind).sort()).toEqual(['auto_increment', 'primary_key']);
  });

  it('parses the IDENTITY keyword as auto_increment', () => {
    const cs = constraintsOf('interface X { id: int; // PK, IDENTITY\n}');
    expect(cs.some((c) => c.kind === 'auto_increment')).toBe(true);
  });

  it('parses a DEFAULT clause', () => {
    const cs = constraintsOf(
      'interface X { created_at: datetime; // DEFAULT CURRENT_TIMESTAMP\n}'
    );
    const def = cs.find((c) => c.kind === 'default');
    expect(def).toBeDefined();
    expect((def as { value: string }).value).toBe('CURRENT_TIMESTAMP');
  });

  it('parses DEFAULT alongside another constraint', () => {
    const cs = constraintsOf(
      'interface X { created_at: datetime; // PK, DEFAULT NOW()\n}'
    );
    expect(cs.find((c) => c.kind === 'default')).toBeDefined();
    expect(cs.find((c) => c.kind === 'primary_key')).toBeDefined();
  });

  it('parses a foreign key reference', () => {
    const cs = constraintsOf(
      'interface X { user_id: int; // FK -> Users(id)\n}'
    );
    const fk = cs.find((c) => c.kind === 'foreign_key') as ForeignKeyConstraint;
    expect(fk).toBeDefined();
    expect(fk.table).toBe('Users');
    expect(fk.column).toBe('id');
    expect(fk.schema).toBeUndefined();
  });

  it('parses a cross-schema foreign key triple', () => {
    const cs = constraintsOf(
      'interface X { user_id: int; // FK -> auth.Users(id)\n}'
    );
    const fk = cs.find((c) => c.kind === 'foreign_key') as ForeignKeyConstraint;
    expect(fk.schema).toBe('auth');
    expect(fk.table).toBe('Users');
    expect(fk.column).toBe('id');
  });

  it('parses ON DELETE CASCADE into the FK tail', () => {
    const cs = constraintsOf(
      'interface X { user_id: int; // FK -> Users(id), ON DELETE CASCADE\n}'
    );
    const fk = cs.find((c) => c.kind === 'foreign_key') as ForeignKeyConstraint;
    expect(fk.tail).toBe('ON DELETE CASCADE');
  });

  it('preserves the raw comment text alongside parsed constraints', () => {
    const col = tables(
      parse('interface X { id: int; // PRIMARY KEY, AUTO_INCREMENT\n}')
    )[0]!.columns[0]!;
    expect(col.rawComment).toBe(' PRIMARY KEY, AUTO_INCREMENT');
  });
});

describe('parser / interface-level multi-column constraints', () => {
  it('parses UNIQUE(a, b)', () => {
    const t = tables(
      parse(`
        // UNIQUE(user_id, organization_id)
        interface Memberships {
          id: int;
          user_id: int;
          organization_id: int;
        }
      `)
    )[0]!;
    const u = t.tableConstraints.find((c) => c.kind === 'unique');
    expect(u).toBeDefined();
    expect((u as { columns?: string[] }).columns).toEqual([
      'user_id',
      'organization_id',
    ]);
  });

  it('parses INDEX(col1, col2)', () => {
    const t = tables(
      parse(`
        // INDEX(created_at, status)
        interface Events {
          id: int;
          created_at: datetime;
          status: string;
        }
      `)
    )[0]!;
    const idx = t.tableConstraints.find((c) => c.kind === 'index');
    expect(idx).toBeDefined();
    expect((idx as { columns?: string[] }).columns).toEqual(['created_at', 'status']);
  });

  it('parses composite PK(a, b)', () => {
    const t = tables(
      parse(`
        // PK(post_id, tag_id)
        interface PostTags {
          post_id: int;
          tag_id: int;
        }
      `)
    )[0]!;
    const pk = t.tableConstraints.find((c) => c.kind === 'composite_primary_key');
    expect(pk).toBeDefined();
    expect((pk as { columns: string[] }).columns).toEqual(['post_id', 'tag_id']);
  });

  it('accepts multiple interface-level constraints on the same table', () => {
    const t = tables(
      parse(`
        // UNIQUE(email)
        // INDEX(organization_id, role)
        interface Users {
          id: int;
          email: string;
          organization_id: int;
          role: string;
        }
      `)
    )[0]!;
    expect(t.tableConstraints).toHaveLength(2);
    expect(t.tableConstraints.map((c) => c.kind).sort()).toEqual(['index', 'unique']);
  });
});
