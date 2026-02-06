import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse, TSSNParseError } from "../src/parser.js";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("TSSN Parser", () => {
  describe("basic table", () => {
    it("parses a simple table with columns and constraints", () => {
      const schema = parse(fixture("basic.tssn"));

      expect(schema.tables).toHaveLength(1);
      const table = schema.tables[0];
      expect(table.name).toBe("Products");
      expect(table.columns).toHaveLength(5);

      // id: int — PK + AUTO_INCREMENT
      const id = table.columns[0];
      expect(id.name).toBe("id");
      expect(id.type).toEqual({ kind: "simple", base: "int", length: undefined, isArray: false });
      expect(id.nullable).toBe(false);
      expect(id.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "PRIMARY_KEY" }),
          expect.objectContaining({ type: "AUTO_INCREMENT" }),
        ]),
      );

      // name: string(200)
      const name = table.columns[1];
      expect(name.name).toBe("name");
      expect(name.type).toEqual({ kind: "simple", base: "string", length: 200, isArray: false });
      expect(name.nullable).toBe(false);

      // description?: text — nullable
      const desc = table.columns[3];
      expect(desc.name).toBe("description");
      expect(desc.type).toEqual({ kind: "simple", base: "text", length: undefined, isArray: false });
      expect(desc.nullable).toBe(true);

      // created_at: datetime — DEFAULT
      const created = table.columns[4];
      expect(created.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "DEFAULT", value: "CURRENT_TIMESTAMP" }),
        ]),
      );
    });
  });

  describe("relations and table constraints", () => {
    it("parses foreign keys and table-level constraints", () => {
      const schema = parse(fixture("relations.tssn"));

      expect(schema.tables).toHaveLength(2);

      // Organizations
      const orgs = schema.tables[0];
      expect(orgs.name).toBe("Organizations");
      const orgName = orgs.columns.find((c) => c.name === "name")!;
      expect(orgName.constraints).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "UNIQUE" })]),
      );

      // Users
      const users = schema.tables[1];
      expect(users.name).toBe("Users");

      // Table-level INDEX
      expect(users.tableConstraints).toEqual([
        { type: "INDEX", columns: ["organization_id", "role"] },
      ]);

      // FK
      const orgId = users.columns.find((c) => c.name === "organization_id")!;
      expect(orgId.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "FOREIGN_KEY",
            referenceTable: "Organizations",
            referenceColumn: "id",
          }),
        ]),
      );

      // Nullable
      const lastLogin = users.columns.find((c) => c.name === "last_login")!;
      expect(lastLogin.nullable).toBe(true);
    });
  });

  describe("array types", () => {
    it("parses [] array suffix", () => {
      const schema = parse(fixture("arrays.tssn"));
      const table = schema.tables[0];

      const tags = table.columns.find((c) => c.name === "tags")!;
      expect(tags.type).toEqual({ kind: "simple", base: "string", length: undefined, isArray: true });

      const scores = table.columns.find((c) => c.name === "scores")!;
      expect(scores.type).toEqual({ kind: "simple", base: "int", length: undefined, isArray: true });

      const metadata = table.columns.find((c) => c.name === "metadata")!;
      expect(metadata.type).toEqual({ kind: "simple", base: "json", length: undefined, isArray: true });
      expect(metadata.nullable).toBe(true);
    });
  });

  describe("literal union types", () => {
    it("parses string and numeric unions", () => {
      const schema = parse(fixture("unions.tssn"));
      const table = schema.tables[0];

      // String union
      const status = table.columns.find((c) => c.name === "status")!;
      expect(status.type).toEqual({
        kind: "union",
        values: ["pending", "shipped", "delivered", "cancelled"],
      });
      expect(status.nullable).toBe(false);

      // Numeric union
      const priority = table.columns.find((c) => c.name === "priority")!;
      expect(priority.type).toEqual({
        kind: "union",
        values: [1, 2, 3],
      });

      // Nullable union
      const payment = table.columns.find((c) => c.name === "payment")!;
      expect(payment.type).toEqual({
        kind: "union",
        values: ["card", "bank", "crypto"],
      });
      expect(payment.nullable).toBe(true);
    });
  });

  describe("quoted identifiers", () => {
    it("parses backtick-quoted table and column names", () => {
      const schema = parse(fixture("quoted-identifiers.tssn"));
      const table = schema.tables[0];

      expect(table.name).toBe("Order Details");
      expect(table.columns[0].name).toBe("Order ID");
      expect(table.columns[1].name).toBe("Product Name");
      expect(table.columns[4].name).toBe("Ship Date");
      expect(table.columns[4].nullable).toBe(true);
    });
  });

  describe("schema namespaces", () => {
    it("parses @schema annotations", () => {
      const schema = parse(fixture("schema-namespace.tssn"));

      expect(schema.tables).toHaveLength(2);

      const users = schema.tables[0];
      expect(users.annotations).toEqual({ schema: "auth" });

      const invoices = schema.tables[1];
      expect(invoices.annotations).toEqual({ schema: "billing" });

      // Cross-schema FK reference
      const userId = invoices.columns.find((c) => c.name === "user_id")!;
      expect(userId.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "FOREIGN_KEY",
            referenceTable: "auth.Users",
            referenceColumn: "id",
          }),
        ]),
      );
    });
  });

  describe("all data types", () => {
    it("parses all TSSN base types", () => {
      const schema = parse(fixture("all-types.tssn"));
      const table = schema.tables[0];

      const types = table.columns.map((c) => {
        if (c.type.kind === "simple") return c.type.base;
        return "union";
      });

      expect(types).toEqual([
        "int", "decimal", "float", "number",
        "char", "string", "text",
        "datetime", "date", "time",
        "boolean", "json", "blob", "uuid",
      ]);

      // char(3) and string(100) have lengths
      const code = table.columns.find((c) => c.name === "code")!;
      expect(code.type).toEqual({ kind: "simple", base: "char", length: 3, isArray: false });

      const name = table.columns.find((c) => c.name === "name")!;
      expect(name.type).toEqual({ kind: "simple", base: "string", length: 100, isArray: false });
    });
  });

  describe("complex schema", () => {
    it("parses a multi-table schema with all features", () => {
      const schema = parse(fixture("complex.tssn"));

      expect(schema.tables).toHaveLength(3);

      // First table has annotations from preceding comments
      const orgs = schema.tables[0];
      expect(orgs.name).toBe("Organizations");

      // Users has two table-level constraints
      const users = schema.tables[1];
      expect(users.tableConstraints).toEqual([
        { type: "UNIQUE", columns: ["email"] },
        { type: "INDEX", columns: ["organization_id", "role"] },
      ]);

      // FK with ON DELETE CASCADE
      const orgId = users.columns.find((c) => c.name === "organization_id")!;
      const fk = orgId.constraints.find((c) => c.type === "FOREIGN_KEY")!;
      expect(fk.referenceTable).toBe("Organizations");
      expect(fk.referenceAction).toBe("ON DELETE CASCADE");
    });
  });

  describe("comments with colons inside interfaces", () => {
    it("treats // lines as comments even when they contain colons", () => {
      const schema = parse(`
interface Users {
  // NOTE: This is important
  id: int;              // PRIMARY KEY
  // @description: User email address
  email: string(255);
}
      `);

      expect(schema.tables[0].columns).toHaveLength(2);
      expect(schema.tables[0].columns[0].name).toBe("id");
      expect(schema.tables[0].columns[1].name).toBe("email");
    });
  });

  describe("escaped backticks", () => {
    it("unescapes double backticks in table identifiers", () => {
      const schema = parse("interface `Table``Name` {\n  id: int;\n}");
      expect(schema.tables[0].name).toBe("Table`Name");
    });

    it("unescapes double backticks in column identifiers", () => {
      const schema = parse("interface Test {\n  `Col``1`: int;\n}");
      expect(schema.tables[0].columns[0].name).toBe("Col`1");
    });
  });

  describe("FOREIGN KEY long form", () => {
    it("parses FOREIGN KEY -> syntax", () => {
      const schema = parse(`
interface Orders {
  id: int;                // PRIMARY KEY
  user_id: int;           // FOREIGN KEY -> Users(id)
}
      `);

      const userId = schema.tables[0].columns.find((c) => c.name === "user_id")!;
      const fk = userId.constraints.find((c) => c.type === "FOREIGN_KEY")!;
      expect(fk.referenceTable).toBe("Users");
      expect(fk.referenceColumn).toBe("id");
    });

    it("parses FOREIGN KEY with ON UPDATE CASCADE", () => {
      const schema = parse(`
interface Items {
  id: int;                // PRIMARY KEY
  order_id: int;          // FK -> Orders(id), ON UPDATE CASCADE
}
      `);

      const orderId = schema.tables[0].columns.find((c) => c.name === "order_id")!;
      const fk = orderId.constraints.find((c) => c.type === "FOREIGN_KEY")!;
      expect(fk.referenceAction).toBe("ON UPDATE CASCADE");
    });
  });

  describe("DEFAULT constraint edge cases", () => {
    it("parses DEFAULT followed by another constraint", () => {
      const schema = parse(`
interface Test {
  status: string(20);    // DEFAULT 'active', UNIQUE
}
      `);

      const status = schema.tables[0].columns[0];
      expect(status.constraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "UNIQUE" }),
          expect.objectContaining({ type: "DEFAULT", value: "'active'" }),
        ]),
      );
    });

    it("parses DEFAULT CURRENT_TIMESTAMP correctly", () => {
      const schema = parse(`
interface Test {
  created_at: datetime;   // DEFAULT CURRENT_TIMESTAMP
}
      `);

      const col = schema.tables[0].columns[0];
      const def = col.constraints.find((c) => c.type === "DEFAULT")!;
      expect(def.value).toBe("CURRENT_TIMESTAMP");
    });
  });

  describe("windows line endings", () => {
    it("parses input with \\r\\n line endings", () => {
      const input = "interface Users {\r\n  id: int;              // PRIMARY KEY\r\n  email: string(255);\r\n}\r\n";
      const schema = parse(input);

      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].columns).toHaveLength(2);
      expect(schema.tables[0].columns[0].name).toBe("id");
    });
  });

  describe("multiple annotations", () => {
    it("parses multiple annotations on a table", () => {
      const schema = parse(`
// @schema: auth
// @description: User accounts
interface Users {
  id: int;              // PRIMARY KEY
}
      `);

      const table = schema.tables[0];
      expect(table.annotations).toEqual({
        schema: "auth",
        description: "User accounts",
      });
    });
  });

  describe("mixed union types", () => {
    it("parses mixed string and number unions", () => {
      const schema = parse(`
interface Test {
  mixed: 'a' | 1 | 'b' | 2;
}
      `);

      const col = schema.tables[0].columns[0];
      expect(col.type).toEqual({
        kind: "union",
        values: ["a", 1, "b", 2],
      });
    });
  });

  describe("error handling", () => {
    it("throws TSSNParseError for invalid interface declaration", () => {
      expect(() => parse("interface {")).toThrow(TSSNParseError);
    });

    it("throws TSSNParseError for invalid column definition", () => {
      expect(() =>
        parse("interface Foo {\n  bad column here\n}"),
      ).toThrow(TSSNParseError);
    });

    it("parses empty input without error", () => {
      const schema = parse("");
      expect(schema.tables).toHaveLength(0);
    });

    it("parses empty interface", () => {
      const schema = parse("interface Empty {\n}");
      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].columns).toHaveLength(0);
    });
  });
});
