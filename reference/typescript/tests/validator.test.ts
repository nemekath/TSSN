import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import { validate } from '../src/validate.js';
import type { Schema, ViewDecl } from '../src/ast.js';

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

describe('validator / alias shadowing a base type (Q2)', () => {
  it('rejects type int = ...;', () => {
    const errs = errorsFor("type int = 'a' | 'b';");
    expect(errs.some((m) => /alias_shadows_base_type/.test(m))).toBe(true);
  });

  it('rejects type string = string(50);', () => {
    const errs = errorsFor('type string = string(50);');
    expect(errs.some((m) => /alias_shadows_base_type.*string/.test(m))).toBe(true);
  });

  it('rejects every base type name', () => {
    for (const name of [
      'int',
      'decimal',
      'float',
      'number',
      'string',
      'char',
      'text',
      'datetime',
      'date',
      'time',
      'boolean',
      'blob',
      'uuid',
      'json',
    ]) {
      const errs = errorsFor(`type ${name} = 'x' | 'y';`);
      expect(
        errs.some((m) => new RegExp(`alias_shadows_base_type.*${name}`).test(m))
      ).toBe(true);
    }
  });

  it('accepts PascalCase alias names that do not collide', () => {
    expect(errorsFor("type Status = 'a' | 'b';")).toEqual([]);
  });
});

describe('validator / mixed-literal unions (Q11)', () => {
  it('rejects a column union mixing strings and numbers', () => {
    const errs = errorsFor("interface X { v: 'a' | 1; }");
    expect(errs.some((m) => /heterogeneous_union/.test(m))).toBe(true);
  });

  it('rejects a mixed union inside a type alias', () => {
    const errs = errorsFor("type Bad = 'a' | 1;");
    expect(errs.some((m) => /heterogeneous_union/.test(m))).toBe(true);
  });

  it('accepts homogeneous string unions', () => {
    expect(errorsFor("interface X { v: 'a' | 'b'; }")).toEqual([]);
  });

  it('accepts homogeneous numeric unions', () => {
    expect(errorsFor('interface X { v: 1 | 2 | 3; }')).toEqual([]);
  });
});

describe('validator / unknown base types (Q12)', () => {
  it('rejects an unknown ident used as a column type', () => {
    const errs = errorsFor('interface X { v: Foobar; }');
    expect(errs.some((m) => /unknown_base_type.*Foobar/.test(m))).toBe(true);
  });

  it('rejects an unknown base type wrapped in an array', () => {
    const errs = errorsFor('interface X { v: Foobar[]; }');
    expect(errs.some((m) => /unknown_base_type.*Foobar/.test(m))).toBe(true);
  });

  it('rejects an unknown base type inside a type alias RHS', () => {
    const errs = errorsFor('type Bad = Foobar;');
    expect(errs.some((m) => /unknown_base_type.*Foobar/.test(m))).toBe(true);
  });

  it('accepts the 14 canonical base types', () => {
    for (const name of [
      'int',
      'decimal',
      'float',
      'number',
      'string',
      'char',
      'text',
      'datetime',
      'date',
      'time',
      'boolean',
      'blob',
      'uuid',
      'json',
    ]) {
      const maybeSized = name === 'string' || name === 'char' ? `${name}(10)` : name;
      expect(errorsFor(`interface X { v: ${maybeSized}; }`)).toEqual([]);
    }
  });

  it('accepts an alias used as a column type (not routed as a base type)', () => {
    expect(
      errorsFor(`
        type Status = 'a' | 'b';
        interface X { status: Status; }
      `)
    ).toEqual([]);
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

describe('validator / robustness on hand-built Schema', () => {
  // `validate()` is public API over exported AST types. It MUST treat
  // view.annotations as the source of truth and MUST NOT throw when
  // callers construct a Schema with convenience booleans out of sync
  // with the annotation array.
  const zeroSpan = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };

  function handBuiltViewSchema(overrides: Partial<ViewDecl>): Schema {
    const base: ViewDecl = {
      kind: 'view',
      name: 'V',
      quoted: false,
      columns: [],
      tableConstraints: [],
      materialized: false,
      readonly: true,
      readonlyAnnotated: false,
      updatable: false,
      annotations: [],
      leadingComments: [],
      span: zeroSpan,
    };
    return {
      source: '',
      declarations: [{ ...base, ...overrides }],
    };
  }

  it('does not throw when the updatable flag is set but no @updatable annotation is present', () => {
    // Simulates a caller that flipped .updatable = true without also
    // appending to .annotations. Pre-fix this made .find(...)! yield
    // undefined and .span threw a TypeError.
    const schema = handBuiltViewSchema({
      materialized: true,
      updatable: true,
      annotations: [], // deliberately out of sync
    });
    expect(() => validate(schema)).not.toThrow();
  });

  it('does not throw when materialized+updatable flags disagree with annotations', () => {
    const schema = handBuiltViewSchema({
      readonlyAnnotated: true,
      updatable: true,
      annotations: [],
    });
    expect(() => validate(schema)).not.toThrow();
  });

  it('treats view.annotations as the source of truth — contradiction only fires when both annotations are actually present', () => {
    // Flags say no conflict, but annotations contain @materialized +
    // @updatable. The validator MUST detect this based on annotations.
    const schema = handBuiltViewSchema({
      materialized: false, // lie: annotations say otherwise
      updatable: false, // lie: annotations say otherwise
      annotations: [
        { key: 'materialized', raw: '@materialized', span: zeroSpan },
        { key: 'updatable', raw: '@updatable', span: zeroSpan },
      ],
    });
    const errs = validate(schema);
    expect(errs.some((e) => e.code === 'contradictory_view_annotations')).toBe(true);
  });
});
