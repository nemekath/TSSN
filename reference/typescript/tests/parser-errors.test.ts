import { describe, expect, it } from 'vitest';
import { parse, parseRaw } from '../src/parser.js';
import { tables } from '../src/ast.js';

describe('parser / error reporting / line and column accuracy', () => {
  it('reports an error on the line where it occurs', () => {
    const src = `interface X {
  id: int;
  broken
  email: string;
}`;
    const { errors } = parseRaw(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.span.start.line).toBe(3);
  });

  it('reports a column index 1-indexed from the start of the line', () => {
    const src = `interface X {
  id: int;
  broken
}`;
    const { errors } = parseRaw(src);
    expect(errors[0]!.span.start.column).toBe(3);
  });

  it('points at the offending token for a missing brace', () => {
    const { errors } = parseRaw('interface X id: int;');
    expect(errors[0]!.span.start.line).toBe(1);
    // The error is at `id` where `{` was expected
    expect(errors[0]!.message).toMatch(/lbrace/);
  });

  it('tracks columns correctly across multi-line input', () => {
    const src = `
interface X {
  id: int;
}
interface Y {
  broken
}`;
    const { errors } = parseRaw(src);
    expect(errors[0]!.span.start.line).toBe(6);
  });
});

describe('parser / error reporting / multi-error collection', () => {
  it('reports multiple errors in one parseRaw call', () => {
    const src = `
      interface A { broken1 }
      interface B { id: int; }
      interface C { broken2 }
    `;
    const { schema, errors } = parseRaw(src);
    expect(errors.length).toBeGreaterThan(1);
    // Good interface B should still be in the schema.
    expect(tables(schema).find((t) => t.name === 'B')).toBeDefined();
  });

  it('continues past a misplaced type-alias declaration', () => {
    const src = `
      interface X { id: int; }
      type Late = 'a' | 'b';
      interface Y { id: int; }
    `;
    const { schema, errors } = parseRaw(src);
    // The type alias is rejected but the parser continues to interface Y
    expect(errors.some((e) => /before any interface or view/.test(e.message))).toBe(true);
    expect(tables(schema).map((t) => t.name)).toContain('Y');
  });

  it('collects one error per broken column', () => {
    const src = `interface X {
      id: int;
      broken1
      email: string;
      broken2
    }`;
    const { errors } = parseRaw(src);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parser / error reporting / AggregateError shape', () => {
  it('throws AggregateError from parse() containing every collected error', () => {
    let caught: AggregateError | undefined;
    try {
      parse('interface X { id: int; id: int; id: int; }');
    } catch (e) {
      if (e instanceof AggregateError) caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught!.errors.length).toBe(2);
  });

  it('AggregateError message includes error count', () => {
    let caught = false;
    try {
      parse('interface X { id: int; id: int; }');
    } catch (e) {
      caught = true;
      expect(e).toBeInstanceOf(AggregateError);
      expect((e as AggregateError).message).toMatch(/error\(s\)/);
    }
    expect(caught).toBe(true);
  });
});

describe('parser / cross-platform input', () => {
  it('parses identical ASTs for LF and CRLF forms of the same file', () => {
    const lf = `interface X {
  id: int;
  email: string;
}`;
    const crlf = lf.replace(/\n/g, '\r\n');
    const a = parse(lf);
    const b = parse(crlf);
    expect(tables(a)[0]!.columns.map((c) => c.name)).toEqual(
      tables(b)[0]!.columns.map((c) => c.name)
    );
    expect(tables(a)[0]!.columns[0]!.span.start.line).toBe(
      tables(b)[0]!.columns[0]!.span.start.line
    );
  });

  it('parses identical ASTs for LF and bare-CR forms', () => {
    const lf = `interface X {
  id: int;
}`;
    const cr = lf.replace(/\n/g, '\r');
    const a = parse(lf);
    const b = parse(cr);
    expect(tables(a)[0]!.columns.map((c) => c.name)).toEqual(
      tables(b)[0]!.columns.map((c) => c.name)
    );
  });

  it('parses a file with a UTF-8 BOM', () => {
    const schema = parse('\uFEFFinterface X { id: int; }');
    expect(tables(schema)).toHaveLength(1);
  });

  it('parses a file with mixed line endings', () => {
    const src = 'interface X {\n  id: int;\r\n  email: string;\r}';
    const schema = parse(src);
    expect(tables(schema)[0]!.columns.map((c) => c.name)).toEqual(['id', 'email']);
  });
});

describe('parser / lex-error propagation', () => {
  it('converts a LexError for a float literal into a collected parse error', () => {
    const { errors } = parseRaw("interface X { v: 1.5 | 2.5; }");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/floating-point|Expected|digit/i);
  });

  it('converts an unterminated string into a collected error', () => {
    const { errors } = parseRaw("interface X { v: 'oops; }");
    expect(errors.length).toBeGreaterThan(0);
  });

  it('parseRaw never throws on lex errors', () => {
    expect(() => parseRaw("interface X { v: 1.5; }")).not.toThrow();
  });
});

describe('parser / filename propagation', () => {
  it('echoes the filename into the Schema object', () => {
    const { schema } = parseRaw('interface X { id: int; }', {
      filename: 'users.tssn',
    });
    expect(schema.filename).toBe('users.tssn');
  });

  it('omits filename when not provided', () => {
    const { schema } = parseRaw('interface X { id: int; }');
    expect(schema.filename).toBeUndefined();
  });
});
