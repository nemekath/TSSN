import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { tables, views, type ComputedConstraint } from '../src/ast.js';

describe('parser / leading annotations on tables', () => {
  it('parses @schema: name on a leading comment', () => {
    const t = tables(
      parse(`
        // @schema: auth
        interface Users { id: int; }
      `)
    )[0]!;
    expect(t.schema).toBe('auth');
    expect(t.annotations.find((a) => a.key === 'schema')?.value).toBe('auth');
  });

  it('parses @description', () => {
    const t = tables(
      parse(`
        // @description: User accounts with authentication data
        interface Users { id: int; }
      `)
    )[0]!;
    const desc = t.annotations.find((a) => a.key === 'description');
    expect(desc?.value).toBe('User accounts with authentication data');
  });

  it('keeps plain comments separate from annotations', () => {
    const t = tables(
      parse(`
        // This is a plain description.
        // @schema: auth
        interface Users { id: int; }
      `)
    )[0]!;
    expect(t.leadingComments).toContain(' This is a plain description.');
    expect(t.annotations.map((a) => a.key)).toEqual(['schema']);
  });

  it('preserves the declaration-site annotation span', () => {
    const t = tables(
      parse(`
        // @schema: billing
        interface Invoices { id: int; }
      `)
    )[0]!;
    const ann = t.annotations.find((a) => a.key === 'schema')!;
    expect(ann.span.start.line).toBeGreaterThan(0);
  });
});

describe('parser / inline annotations on columns', () => {
  it('parses @deprecated on a column', () => {
    const col = tables(
      parse('interface X { legacy_id?: int; // @deprecated: use id instead\n}')
    )[0]!.columns[0]!;
    const ann = col.annotations.find((a) => a.key === 'deprecated');
    expect(ann?.value).toBe('use id instead');
  });

  it('parses @since on a column', () => {
    const col = tables(
      parse('interface X { api_version: int; // @since: v2.0\n}')
    )[0]!.columns[0]!;
    const ann = col.annotations.find((a) => a.key === 'since');
    expect(ann?.value).toBe('v2.0');
  });

  it('parses @format on a column', () => {
    const col = tables(
      parse('interface X { location: string; // @format: wkt\n}')
    )[0]!.columns[0]!;
    expect(col.annotations.find((a) => a.key === 'format')?.value).toBe('wkt');
  });

  it('parses multiple annotations in one comment', () => {
    const col = tables(
      parse(
        'interface X { email: string; // @validation: email, @deprecated\n}'
      )
    )[0]!.columns[0]!;
    expect(col.annotations.map((a) => a.key).sort()).toEqual([
      'deprecated',
      'validation',
    ]);
  });

  it('parses annotations alongside constraints', () => {
    const col = tables(
      parse('interface X { id: int; // PRIMARY KEY, @generated: auto\n}')
    )[0]!.columns[0]!;
    expect(col.constraints.some((c) => c.kind === 'primary_key')).toBe(true);
    expect(col.annotations.find((a) => a.key === 'generated')?.value).toBe('auto');
  });
});

describe('parser / @computed constraint', () => {
  it('parses @computed without an expression', () => {
    const col = tables(
      parse('interface X { email_domain: string; // @computed\n}')
    )[0]!.columns[0]!;
    const c = col.constraints.find((x) => x.kind === 'computed') as ComputedConstraint;
    expect(c).toBeDefined();
    expect(c.expression).toBeUndefined();
  });

  it('parses @computed with a SQL expression', () => {
    const col = tables(
      parse(
        "interface X { full_name: string(101); // @computed: first_name || ' ' || last_name\n}"
      )
    )[0]!.columns[0]!;
    const c = col.constraints.find((x) => x.kind === 'computed') as ComputedConstraint;
    expect(c.expression).toBe("first_name || ' ' || last_name");
  });

  it('does not also report @computed as an annotation', () => {
    const col = tables(
      parse('interface X { v: string; // @computed: expr\n}')
    )[0]!.columns[0]!;
    expect(col.annotations.find((a) => a.key === 'computed')).toBeUndefined();
    expect(col.constraints.find((c) => c.kind === 'computed')).toBeDefined();
  });
});

describe('parser / L3 domain annotations by name', () => {
  it('captures @enum with value', () => {
    const col = tables(
      parse('interface X { status: string(20); // @enum: [admin, user, guest]\n}')
    )[0]!.columns[0]!;
    const enumAnn = col.annotations.find((a) => a.key === 'enum');
    expect(enumAnn).toBeDefined();
    expect(enumAnn!.value).toContain('admin');
  });

  it('captures @table as a leading declaration annotation', () => {
    const t = tables(
      parse(`
        // @table: user_accounts
        interface Users { id: int; }
      `)
    )[0]!;
    expect(t.annotations.find((a) => a.key === 'table')?.value).toBe('user_accounts');
  });

  it('captures @engine as a leading declaration annotation', () => {
    const t = tables(
      parse(`
        // @engine: InnoDB
        interface Users { id: int; }
      `)
    )[0]!;
    expect(t.annotations.find((a) => a.key === 'engine')?.value).toBe('InnoDB');
  });
});

describe('parser / @schema on views', () => {
  it('picks up the schema field on a view decl', () => {
    const v = views(
      parse(`
        // @schema: reporting
        view Dashboard { id: int; }
      `)
    )[0]!;
    expect(v.schema).toBe('reporting');
  });
});
