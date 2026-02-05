import { describe, it, expect } from "vitest";
import { generate, generateTable } from "../src/generator.js";
import { parse } from "../src/parser.js";
import type { Schema, Table, Column } from "../src/types.js";
import { readFileSync } from "fs";
import { join } from "path";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("TSSN Generator", () => {
  describe("basic generation", () => {
    it("generates a simple table", () => {
      const table: Table = {
        name: "Users",
        columns: [
          {
            name: "id",
            type: { kind: "simple", base: "int", isArray: false },
            nullable: false,
            constraints: [{ type: "PRIMARY_KEY" }],
          },
          {
            name: "email",
            type: { kind: "simple", base: "string", length: 255, isArray: false },
            nullable: false,
            constraints: [{ type: "UNIQUE" }],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("interface Users {");
      expect(output).toContain("id: int;");
      expect(output).toContain("PRIMARY KEY");
      expect(output).toContain("email: string(255);");
      expect(output).toContain("UNIQUE");
      expect(output).toContain("}");
    });
  });

  describe("nullable columns", () => {
    it("generates ? suffix for nullable columns", () => {
      const table: Table = {
        name: "Test",
        columns: [
          {
            name: "optional_field",
            type: { kind: "simple", base: "text", isArray: false },
            nullable: true,
            constraints: [],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("optional_field?: text;");
    });
  });

  describe("array types", () => {
    it("generates [] suffix for array columns", () => {
      const table: Table = {
        name: "Articles",
        columns: [
          {
            name: "tags",
            type: { kind: "simple", base: "string", isArray: true },
            nullable: false,
            constraints: [],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("tags: string[];");
    });
  });

  describe("union types", () => {
    it("generates string literal unions", () => {
      const table: Table = {
        name: "Orders",
        columns: [
          {
            name: "status",
            type: { kind: "union", values: ["pending", "shipped", "delivered"] },
            nullable: false,
            constraints: [],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("status: 'pending' | 'shipped' | 'delivered';");
    });

    it("generates numeric unions", () => {
      const table: Table = {
        name: "Items",
        columns: [
          {
            name: "priority",
            type: { kind: "union", values: [1, 2, 3] },
            nullable: false,
            constraints: [],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("priority: 1 | 2 | 3;");
    });
  });

  describe("quoted identifiers", () => {
    it("quotes identifiers with special characters", () => {
      const table: Table = {
        name: "Order Details",
        columns: [
          {
            name: "Order ID",
            type: { kind: "simple", base: "int", isArray: false },
            nullable: false,
            constraints: [{ type: "PRIMARY_KEY" }],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("interface `Order Details` {");
      expect(output).toContain("`Order ID`: int;");
    });
  });

  describe("table constraints and annotations", () => {
    it("generates annotations and table-level constraints", () => {
      const table: Table = {
        name: "Users",
        columns: [
          {
            name: "id",
            type: { kind: "simple", base: "int", isArray: false },
            nullable: false,
            constraints: [{ type: "PRIMARY_KEY" }],
          },
        ],
        tableConstraints: [
          { type: "INDEX", columns: ["email", "role"] },
        ],
        annotations: { schema: "auth" },
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("// @schema: auth");
      expect(output).toContain("// INDEX(email, role)");
    });
  });

  describe("foreign keys", () => {
    it("generates FK with reference action", () => {
      const table: Table = {
        name: "Members",
        columns: [
          {
            name: "user_id",
            type: { kind: "simple", base: "int", isArray: false },
            nullable: false,
            constraints: [
              {
                type: "FOREIGN_KEY",
                referenceTable: "Users",
                referenceColumn: "id",
                referenceAction: "ON DELETE CASCADE",
              },
            ],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      expect(output).toContain("FK -> Users(id), ON DELETE CASCADE");
    });
  });

  describe("column sorting", () => {
    it("places PK first and timestamps last", () => {
      const table: Table = {
        name: "Test",
        columns: [
          {
            name: "created_at",
            type: { kind: "simple", base: "datetime", isArray: false },
            nullable: false,
            constraints: [],
          },
          {
            name: "name",
            type: { kind: "simple", base: "string", length: 100, isArray: false },
            nullable: false,
            constraints: [],
          },
          {
            name: "id",
            type: { kind: "simple", base: "int", isArray: false },
            nullable: false,
            constraints: [{ type: "PRIMARY_KEY" }],
          },
        ],
        tableConstraints: [],
        annotations: {},
        comments: [],
      };

      const output = generateTable(table);
      const lines = output.split("\n").filter((l) => l.trim().includes(":"));
      expect(lines[0]).toContain("id:");
      expect(lines[1]).toContain("name:");
      expect(lines[2]).toContain("created_at:");
    });
  });

  describe("round-trip", () => {
    it("parse -> generate preserves structure for basic fixture", () => {
      const input = fixture("basic.tssn");
      const schema = parse(input);
      const output = generate(schema);

      // Re-parse the output and compare
      const reparsed = parse(output);
      expect(reparsed.tables).toHaveLength(schema.tables.length);
      expect(reparsed.tables[0].name).toBe(schema.tables[0].name);
      expect(reparsed.tables[0].columns).toHaveLength(schema.tables[0].columns.length);

      for (let i = 0; i < schema.tables[0].columns.length; i++) {
        const original = schema.tables[0].columns[i];
        const roundTripped = reparsed.tables[0].columns[i];
        expect(roundTripped.name).toBe(original.name);
        expect(roundTripped.type).toEqual(original.type);
        expect(roundTripped.nullable).toBe(original.nullable);
      }
    });

    it("parse -> generate preserves union types", () => {
      const input = fixture("unions.tssn");
      const schema = parse(input);
      const output = generate(schema);
      const reparsed = parse(output);

      const status = reparsed.tables[0].columns.find((c) => c.name === "status")!;
      expect(status.type).toEqual({
        kind: "union",
        values: ["pending", "shipped", "delivered", "cancelled"],
      });
    });

    it("parse -> generate preserves quoted identifiers", () => {
      const input = fixture("quoted-identifiers.tssn");
      const schema = parse(input);
      const output = generate(schema);
      const reparsed = parse(output);

      expect(reparsed.tables[0].name).toBe("Order Details");
      expect(reparsed.tables[0].columns[0].name).toBe("Order ID");
    });
  });

  describe("schema generation", () => {
    it("generates multi-table schema with blank line separation", () => {
      const schema: Schema = {
        tables: [
          {
            name: "A",
            columns: [],
            tableConstraints: [],
            annotations: {},
            comments: [],
          },
          {
            name: "B",
            columns: [],
            tableConstraints: [],
            annotations: {},
            comments: [],
          },
        ],
        annotations: {},
      };

      const output = generate(schema);
      expect(output).toContain("interface A {\n}\n\ninterface B {\n}");
    });
  });
});
