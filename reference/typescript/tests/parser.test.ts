import { describe, it, expect } from 'vitest';
import { parse, ParseError } from '../src/index.js';

describe('parse (integration)', () => {
  // -------------------------------------------------------------------
  // Minimal inputs
  // -------------------------------------------------------------------

  it('parses a minimal single-column interface', () => {
    const schema = parse(`interface T { id: int; }`);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.name).toBe('T');
    expect(schema.tables[0]!.columns).toHaveLength(1);
    expect(schema.tables[0]!.columns[0]!.name).toBe('id');
    expect(schema.tables[0]!.columns[0]!.type).toBe('int');
  });

  it('parses a multi-line single interface', () => {
    const input = `
interface Users {
  id: int;
  name: string(100);
}
`;
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    const t = schema.tables[0]!;
    expect(t.name).toBe('Users');
    expect(t.columns).toHaveLength(2);
    expect(t.columns[0]!.name).toBe('id');
    expect(t.columns[1]!.name).toBe('name');
    expect(t.columns[1]!.type).toBe('string');
    expect(t.columns[1]!.length).toBe(100);
  });

  // -------------------------------------------------------------------
  // All base types
  // -------------------------------------------------------------------

  it('parses all 14 base types', () => {
    const input = `
interface TypeShowcase {
  a: int;
  b: string;
  c: decimal;
  d: float;
  e: number;
  f: char;
  g: text;
  h: datetime;
  i: date;
  j: time;
  k: boolean;
  l: blob;
  m: uuid;
  n: json;
}
`;
    const schema = parse(input);
    const cols = schema.tables[0]!.columns;
    expect(cols).toHaveLength(14);
    expect(cols.map(c => c.type)).toEqual([
      'int', 'string', 'decimal', 'float', 'number',
      'char', 'text', 'datetime', 'date', 'time',
      'boolean', 'blob', 'uuid', 'json',
    ]);
  });

  // -------------------------------------------------------------------
  // Nullable columns
  // -------------------------------------------------------------------

  it('handles nullable columns', () => {
    const input = `
interface Users {
  id: int;
  email?: string;
  bio?: text;
}
`;
    const schema = parse(input);
    const cols = schema.tables[0]!.columns;
    expect(cols[0]!.nullable).toBe(false);
    expect(cols[1]!.nullable).toBe(true);
    expect(cols[2]!.nullable).toBe(true);
  });

  // -------------------------------------------------------------------
  // Multi-interface schemas
  // -------------------------------------------------------------------

  it('parses multiple interfaces', () => {
    const input = `
interface A {
  id: int;
}

interface B {
  id: int;
}

interface C {
  id: int;
}
`;
    const schema = parse(input);
    expect(schema.tables).toHaveLength(3);
    expect(schema.tables.map(t => t.name)).toEqual(['A', 'B', 'C']);
  });

  // -------------------------------------------------------------------
  // Complete example from spec Section 4.2
  // -------------------------------------------------------------------

  it('parses the complex schema from spec Section 4.2', () => {
    const input = `
interface Organizations {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(255);    // UNIQUE
  created_at: datetime;
}

// INDEX(organization_id, role)
interface Users {
  id: int;                    // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);         // UNIQUE
  organization_id: int;       // FK -> Organizations(id)
  role: string(20);           // CHECK IN ('admin', 'member', 'guest')
  last_login?: datetime;
  created_at: datetime;       // DEFAULT CURRENT_TIMESTAMP
}

// UNIQUE(user_id, project_id)
interface ProjectMemberships {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  project_id: int;      // FK -> Projects(id), ON DELETE CASCADE
  permission: string(50);
}
`;
    const schema = parse(input);
    expect(schema.tables).toHaveLength(3);

    // Organizations
    const orgs = schema.tables[0]!;
    expect(orgs.name).toBe('Organizations');
    expect(orgs.columns).toHaveLength(3);
    expect(orgs.columns[0]!.constraints).toEqual(
      expect.arrayContaining([
        { type: 'PRIMARY_KEY' },
        { type: 'AUTO_INCREMENT' },
      ]),
    );
    expect(orgs.columns[1]!.constraints).toEqual([{ type: 'UNIQUE' }]);

    // Users — has preceding comment (immediately before, no blank line)
    const users = schema.tables[1]!;
    expect(users.name).toBe('Users');
    expect(users.metadata).toEqual(['INDEX(organization_id, role)']);
    expect(users.columns).toHaveLength(6);
    expect(users.columns[4]!.nullable).toBe(true); // last_login

    // FK
    const orgIdCol = users.columns[2]!;
    expect(orgIdCol.constraints).toEqual([{
      type: 'FOREIGN_KEY',
      referenceTable: 'Organizations',
      referenceColumn: 'id',
    }]);

    // DEFAULT
    const createdAt = users.columns[5]!;
    expect(createdAt.constraints).toEqual([{
      type: 'DEFAULT',
      value: 'CURRENT_TIMESTAMP',
    }]);

    // ProjectMemberships
    const pm = schema.tables[2]!;
    expect(pm.name).toBe('ProjectMemberships');
    expect(pm.metadata).toEqual(['UNIQUE(user_id, project_id)']);
    expect(pm.columns[1]!.constraints[0]!.type).toBe('FOREIGN_KEY');
  });

  // -------------------------------------------------------------------
  // Quoted identifiers
  // -------------------------------------------------------------------

  it('parses quoted table and column identifiers', () => {
    const input = `
interface \`Order Details\` {
  \`Order ID\`: int;            // PRIMARY KEY
  \`Product Name\`: string(100);
  \`Unit Price\`: decimal;
  \`Qty Ordered\`: int;
  \`Ship Date\`?: datetime;
}
`;
    const schema = parse(input);
    const t = schema.tables[0]!;
    expect(t.name).toBe('Order Details');
    expect(t.columns).toHaveLength(5);
    expect(t.columns[0]!.name).toBe('Order ID');
    expect(t.columns[4]!.name).toBe('Ship Date');
    expect(t.columns[4]!.nullable).toBe(true);
  });

  // -------------------------------------------------------------------
  // Array types
  // -------------------------------------------------------------------

  it('parses array types', () => {
    const input = `
interface Articles {
  id: int;
  tags: string[];
  scores: int[];
  metadata?: json[];
}
`;
    const schema = parse(input);
    const cols = schema.tables[0]!.columns;
    expect(cols[0]!.isArray).toBe(false);
    expect(cols[1]!.isArray).toBe(true);
    expect(cols[1]!.type).toBe('string');
    expect(cols[2]!.isArray).toBe(true);
    expect(cols[3]!.isArray).toBe(true);
    expect(cols[3]!.nullable).toBe(true);
  });

  it('parses length + array combined (string(255)[])', () => {
    const input = `
interface T {
  names: string(255)[];
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.type).toBe('string');
    expect(col.length).toBe(255);
    expect(col.isArray).toBe(true);
  });

  // -------------------------------------------------------------------
  // Union types
  // -------------------------------------------------------------------

  it('parses string union types', () => {
    const input = `
interface Orders {
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.type).toBe('union');
    expect(col.unionValues).toEqual(['pending', 'shipped', 'delivered', 'cancelled']);
  });

  it('parses numeric union types', () => {
    const input = `
interface Tasks {
  priority: 1 | 2 | 3;
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.type).toBe('union');
    expect(col.unionValues).toEqual([1, 2, 3]);
  });

  it('parses nullable union types', () => {
    const input = `
interface Orders {
  payment?: 'card' | 'bank' | 'crypto';
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.type).toBe('union');
    expect(col.nullable).toBe(true);
    expect(col.unionValues).toEqual(['card', 'bank', 'crypto']);
  });

  it('parses negative numbers in union types', () => {
    const input = `
interface T {
  val: -1 | 0 | 1;
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.unionValues).toEqual([-1, 0, 1]);
  });

  it('handles union values containing // in single-quoted strings', () => {
    const input = `
interface T {
  protocol: 'http://foo' | 'https://bar';
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.type).toBe('union');
    expect(col.unionValues).toEqual(['http://foo', 'https://bar']);
    // No comment should be extracted (the // is inside quotes)
    expect(col.comment).toBeUndefined();
  });

  it('handles union values with // in quotes followed by a real comment', () => {
    const input = `
interface T {
  url: 'http://a' | 'http://b'; // the urls
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.type).toBe('union');
    expect(col.unionValues).toEqual(['http://a', 'http://b']);
    expect(col.comment).toBe('the urls');
  });

  // -------------------------------------------------------------------
  // Level 3 annotations
  // -------------------------------------------------------------------

  it('extracts annotations from table-level comments', () => {
    const input = `// @schema: auth
// @description: User accounts
interface Users {
  id: int;
}
`;
    const schema = parse(input);
    const t = schema.tables[0]!;
    expect(t.annotations).toEqual([
      { name: 'schema', value: 'auth' },
      { name: 'description', value: 'User accounts' },
    ]);
    expect(t.schema).toBe('auth');
  });

  it('extracts annotations from column comments', () => {
    const input = `
interface Users {
  id: int;              // PRIMARY KEY, @generated: auto
  email: string(255);   // @validation: email
}
`;
    const schema = parse(input);
    const cols = schema.tables[0]!.columns;
    expect(cols[0]!.annotations).toEqual([{ name: 'generated', value: 'auto' }]);
    expect(cols[1]!.annotations).toEqual([{ name: 'validation', value: 'email' }]);
  });

  it('extracts multiple annotations from one column comment', () => {
    const input = `
interface T {
  id: int; // @generated: auto, @since: v2.0
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.annotations).toEqual([
      { name: 'generated', value: 'auto' },
      { name: 'since', value: 'v2.0' },
    ]);
  });

  // -------------------------------------------------------------------
  // Cross-schema FK
  // -------------------------------------------------------------------

  it('parses cross-schema foreign key references', () => {
    const input = `// @schema: billing
interface Invoices {
  id: int;
  user_id: int;         // FK -> auth.Users(id)
}
`;
    const schema = parse(input);
    const fk = schema.tables[0]!.columns[1]!.constraints[0]!;
    expect(fk.type).toBe('FOREIGN_KEY');
    if (fk.type === 'FOREIGN_KEY') {
      expect(fk.referenceSchema).toBe('auth');
      expect(fk.referenceTable).toBe('Users');
      expect(fk.referenceColumn).toBe('id');
    }
  });

  // -------------------------------------------------------------------
  // Schema-level metadata (blank-line flushing)
  // -------------------------------------------------------------------

  it('flushes comments to schema metadata when separated by blank line', () => {
    const input = `
// @description: My database schema

interface T {
  id: int;
}
`;
    const schema = parse(input);
    // The blank line separates the comment from the interface,
    // so it becomes schema-level metadata, not table metadata.
    expect(schema.metadata).toEqual(['@description: My database schema']);
    expect(schema.annotations).toEqual([
      { name: 'description', value: 'My database schema' },
    ]);
    // The interface should have NO metadata from that comment
    expect(schema.tables[0]!.metadata).toHaveLength(0);
    expect(schema.tables[0]!.annotations).toHaveLength(0);
  });

  it('attaches comments immediately before interface as table metadata', () => {
    const input = `// @schema: auth
// @description: User accounts
interface Users {
  id: int;
}
`;
    const schema = parse(input);
    expect(schema.tables[0]!.metadata).toEqual([
      '@schema: auth',
      '@description: User accounts',
    ]);
    expect(schema.metadata).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // ParseOptions
  // -------------------------------------------------------------------

  it('skips constraint extraction when skipConstraints is true', () => {
    const input = `
interface T {
  id: int; // PRIMARY KEY
}
`;
    const schema = parse(input, { skipConstraints: true });
    expect(schema.tables[0]!.columns[0]!.constraints).toEqual([]);
    // Comment should still be preserved
    expect(schema.tables[0]!.columns[0]!.comment).toBe('PRIMARY KEY');
  });

  it('skips annotation extraction when skipAnnotations is true', () => {
    const input = `// @schema: auth
interface T {
  id: int; // @generated: auto
}
`;
    const schema = parse(input, { skipAnnotations: true });
    expect(schema.tables[0]!.annotations).toEqual([]);
    expect(schema.tables[0]!.columns[0]!.annotations).toEqual([]);
  });

  // -------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------

  it('throws ParseError for unexpected content', () => {
    expect(() => parse('not an interface')).toThrow(ParseError);
  });

  it('throws ParseError with line number for invalid content', () => {
    try {
      parse('garbage line');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(1);
    }
  });

  it('throws ParseError for unclosed interface', () => {
    expect(() => parse('interface T {\n  id: int;\n')).toThrow(ParseError);
  });

  it('throws ParseError for invalid column syntax', () => {
    expect(() => parse('interface T {\n  bad column line\n}')).toThrow(ParseError);
  });

  it('throws ParseError for missing colon after column name', () => {
    expect(() => parse('interface T {\n  id bad: int;\n}')).toThrow(ParseError);
    expect(() => parse('interface T {\n  id bad: int;\n}')).toThrow(/Expected ':'/);
  });

  it('throws ParseError for invalid type expression', () => {
    expect(() => parse('interface T {\n  id: (bad);\n}')).toThrow(ParseError);
    expect(() => parse('interface T {\n  id: (bad);\n}')).toThrow(/Invalid type expression/);
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------

  it('handles empty input', () => {
    const schema = parse('');
    expect(schema.tables).toHaveLength(0);
    expect(schema.metadata).toHaveLength(0);
  });

  it('handles comments-only input', () => {
    const schema = parse('// just a comment\n// another one');
    expect(schema.tables).toHaveLength(0);
    expect(schema.metadata).toEqual(['just a comment', 'another one']);
  });

  it('handles CRLF line endings', () => {
    const input = 'interface T {\r\n  id: int;\r\n}\r\n';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.columns[0]!.name).toBe('id');
  });

  it('handles CR-only line endings', () => {
    const input = 'interface T {\r  id: int;\r}\r';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
  });

  it('handles tab indentation', () => {
    const input = "interface T {\n\tid: int;\n\tname: string;\n}";
    const schema = parse(input);
    expect(schema.tables[0]!.columns).toHaveLength(2);
  });

  it('preserves standalone comments inside interface as constraintComments', () => {
    const input = `
interface T {
  // Some note
  id: int;
}
`;
    const schema = parse(input);
    expect(schema.tables[0]!.constraintComments).toEqual(['Some note']);
  });

  it('handles columns with both constraints and annotations', () => {
    const input = `
interface Users {
  role: string(20); // UNIQUE, @enum: [admin, user, guest]
}
`;
    const schema = parse(input);
    const col = schema.tables[0]!.columns[0]!;
    expect(col.constraints).toEqual([{ type: 'UNIQUE' }]);
    expect(col.annotations).toEqual([{ name: 'enum', value: '[admin, user, guest]' }]);
  });

  // -------------------------------------------------------------------
  // Single-line interfaces
  // -------------------------------------------------------------------

  it('parses single-line interface with inline comments', () => {
    const input = 'interface T { id: int; // PK }';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.columns).toHaveLength(1);
    expect(schema.tables[0]!.columns[0]!.name).toBe('id');
    expect(schema.tables[0]!.columns[0]!.comment).toBe('PK');
  });

  it('parses single-line interface with multiple columns', () => {
    const input = 'interface T { id: int; name: string; }';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.columns).toHaveLength(2);
    expect(schema.tables[0]!.columns[0]!.name).toBe('id');
    expect(schema.tables[0]!.columns[1]!.name).toBe('name');
  });

  it('parses single-line with comment containing ; followed by more columns', () => {
    // This was the splitInlineBody off-by-one bug
    const input = 'interface T { id: int; // note; name: string; }';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.columns).toHaveLength(2);
    expect(schema.tables[0]!.columns[0]!.name).toBe('id');
    expect(schema.tables[0]!.columns[0]!.comment).toBe('note');
    expect(schema.tables[0]!.columns[1]!.name).toBe('name');
  });

  it('parses empty single-line interface', () => {
    const input = 'interface T {}';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.name).toBe('T');
    expect(schema.tables[0]!.columns).toHaveLength(0);
  });

  it('handles interface with no columns (multi-line)', () => {
    const input = 'interface Empty {\n}';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.name).toBe('Empty');
    expect(schema.tables[0]!.columns).toHaveLength(0);
  });

  it('handles whitespace-only lines between interfaces', () => {
    const input = 'interface A {\n  id: int;\n}\n   \ninterface B {\n  id: int;\n}';
    const schema = parse(input);
    expect(schema.tables).toHaveLength(2);
  });

  // -------------------------------------------------------------------
  // DEFAULT value edge cases
  // -------------------------------------------------------------------

  it('handles DEFAULT NULL', () => {
    const input = `
interface T {
  val?: int; // DEFAULT NULL
}
`;
    const schema = parse(input);
    const c = schema.tables[0]!.columns[0]!.constraints.find(
      c => c.type === 'DEFAULT'
    );
    expect(c).toBeDefined();
    if (c && c.type === 'DEFAULT') {
      expect(c.value).toBe('NULL');
    }
  });

  // -------------------------------------------------------------------
  // FOREIGN KEY long form
  // -------------------------------------------------------------------

  it('parses FOREIGN KEY -> Table(col) long form in integration', () => {
    const input = `
interface T {
  user_id: int; // FOREIGN KEY -> Users(id)
}
`;
    const schema = parse(input);
    const fk = schema.tables[0]!.columns[0]!.constraints[0]!;
    expect(fk.type).toBe('FOREIGN_KEY');
    if (fk.type === 'FOREIGN_KEY') {
      expect(fk.referenceTable).toBe('Users');
      expect(fk.referenceColumn).toBe('id');
    }
  });
});
