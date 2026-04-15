import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import { validate } from '../src/validate.js';

function errorsFor(src: string) {
  const { schema, errors } = parseRaw(src);
  if (errors.length > 0) return errors.map((e) => e.message);
  return validate(schema).map((e) => `${e.code}: ${e.message}`);
}

describe('validator / duplicate columns', () => {
  it('reports a duplicate column within an interface', () => {
    const errs = errorsFor('interface X { id: int; id: int; }');
    expect(errs.some((m) => /duplicate_column/.test(m))).toBe(true);
  });

  it('allows the same column name in different interfaces', () => {
    expect(errorsFor('interface A { id: int; } interface B { id: int; }')).toEqual([]);
  });

  it('reports a duplicate column within a view', () => {
    const errs = errorsFor('view V { id: int; id: int; }');
    expect(errs.some((m) => /duplicate_column/.test(m))).toBe(true);
  });
});

describe('validator / mixed PK forms', () => {
  it('rejects inline PK plus interface-level PK(...)', () => {
    const errs = errorsFor(`
      // PK(a, b)
      interface X {
        a: int; // PRIMARY KEY
        b: int;
      }
    `);
    expect(errs.some((m) => /mixed_pk_forms/.test(m))).toBe(true);
  });

  it('accepts only inline PK', () => {
    expect(errorsFor('interface X { id: int; // PRIMARY KEY\n}')).toEqual([]);
  });

  it('accepts only composite PK', () => {
    expect(
      errorsFor(`
        // PK(a, b)
        interface X {
          a: int;
          b: int;
        }
      `)
    ).toEqual([]);
  });
});

describe('validator / composite constraint column references', () => {
  it('rejects a PK(...) that names a nonexistent column', () => {
    const errs = errorsFor(`
      // PK(ghost)
      interface X { id: int; }
    `);
    expect(errs.some((m) => /unknown_column_in_constraint.*ghost/.test(m))).toBe(true);
  });

  it('rejects a UNIQUE(...) that names a nonexistent column', () => {
    const errs = errorsFor(`
      // UNIQUE(ghost)
      interface X { id: int; }
    `);
    expect(errs.some((m) => /unknown_column_in_constraint/.test(m))).toBe(true);
  });

  it('rejects an INDEX(...) that names a nonexistent column', () => {
    const errs = errorsFor(`
      // INDEX(ghost, other_ghost)
      interface X { id: int; }
    `);
    expect(errs.filter((m) => /unknown_column_in_constraint/.test(m))).toHaveLength(2);
  });

  it('accepts valid composite references', () => {
    expect(
      errorsFor(`
        // UNIQUE(user_id, org_id)
        // INDEX(created_at)
        interface Memberships {
          user_id: int;
          org_id: int;
          created_at: datetime;
        }
      `)
    ).toEqual([]);
  });
});

describe('validator / duplicate declarations', () => {
  it('rejects two interfaces with the same name', () => {
    const errs = errorsFor('interface X { id: int; } interface X { id: int; }');
    expect(errs.some((m) => /duplicate_declaration/.test(m))).toBe(true);
  });

  it('rejects an interface and a view sharing a name', () => {
    const errs = errorsFor('interface X { id: int; } view X { id: int; }');
    expect(errs.some((m) => /duplicate_declaration/.test(m))).toBe(true);
  });

  it('allows the same name under different @schema namespaces', () => {
    expect(
      errorsFor(`
        // @schema: a
        interface X { id: int; }
        // @schema: b
        interface X { id: int; }
      `)
    ).toEqual([]);
  });
});

describe('validator / @materialized placement', () => {
  it('rejects @materialized on an interface', () => {
    const errs = errorsFor(`
      // @materialized
      interface X { id: int; }
    `);
    expect(errs.some((m) => /materialized_on_table/.test(m))).toBe(true);
  });

  it('accepts @materialized on a view', () => {
    expect(
      errorsFor(`
        // @materialized
        view X { id: int; }
      `)
    ).toEqual([]);
  });
});

describe('validator / view annotation combinations', () => {
  it('accepts a plain view (default read-only)', () => {
    expect(errorsFor('view X { id: int; }')).toEqual([]);
  });

  it('accepts @materialized alone', () => {
    expect(
      errorsFor(`
        // @materialized
        view X { id: int; }
      `)
    ).toEqual([]);
  });

  it('accepts @materialized + @readonly (redundant but legal)', () => {
    expect(
      errorsFor(`
        // @materialized
        // @readonly
        view X { id: int; }
      `)
    ).toEqual([]);
  });

  it('rejects @readonly + @updatable as contradictory', () => {
    const errs = errorsFor(`
      // @readonly
      // @updatable
      view X { id: int; }
    `);
    expect(errs.some((m) => /contradictory_view_annotations/.test(m))).toBe(true);
  });

  it('rejects @materialized + @updatable', () => {
    const errs = errorsFor(`
      // @materialized
      // @updatable
      view X { id: int; }
    `);
    expect(errs.some((m) => /contradictory_view_annotations/.test(m))).toBe(true);
  });
});

describe('parse() integration', () => {
  it('surfaces validation errors via AggregateError', () => {
    expect(() => parse('interface X { id: int; id: int; }')).toThrow(AggregateError);
  });

  it('does not throw for a clean schema', () => {
    expect(() =>
      parse(`
        type Status = 'a' | 'b';
        // UNIQUE(email)
        interface Users {
          id: int; // PRIMARY KEY
          email: string(255);
          status: Status;
        }
        view ActiveUsers { id: int; email: string(255); }
      `)
    ).not.toThrow();
  });
});
