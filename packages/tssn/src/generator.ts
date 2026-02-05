/**
 * TSSN Generator — Generates TSSN text from structured Schema objects.
 * Implements TSSN Specification v0.7.0.
 */

import type { Schema, Table, Column, ColumnType, Constraint } from "./types.js";

export interface GeneratorOptions {
  /** Number of spaces for indentation (default: 2) */
  indent?: number;
  /** Target column for type alignment (default: 25) */
  typeAlignment?: number;
  /** Target column for comment alignment (default: 45) */
  commentAlignment?: number;
  /** Sort columns: PK first, timestamps last (default: true) */
  sortColumns?: boolean;
}

const DEFAULTS: Required<GeneratorOptions> = {
  indent: 2,
  typeAlignment: 25,
  commentAlignment: 45,
  sortColumns: true,
};

/**
 * Generate TSSN text from a Schema object.
 */
export function generate(schema: Schema, options?: GeneratorOptions): string {
  const gen = new Generator({ ...DEFAULTS, ...options });
  return gen.generate(schema);
}

/**
 * Generate TSSN text for a single Table.
 */
export function generateTable(
  table: Table,
  options?: GeneratorOptions,
): string {
  const gen = new Generator({ ...DEFAULTS, ...options });
  return gen.generateTable(table);
}

class Generator {
  private opts: Required<GeneratorOptions>;
  private indentStr: string;

  constructor(opts: Required<GeneratorOptions>) {
    this.opts = opts;
    this.indentStr = " ".repeat(opts.indent);
  }

  generate(schema: Schema): string {
    const blocks: string[] = [];

    for (const table of schema.tables) {
      blocks.push(this.generateTable(table));
    }

    return blocks.join("\n\n") + "\n";
  }

  generateTable(table: Table): string {
    const lines: string[] = [];

    // Annotations (e.g. @schema: auth)
    for (const [key, value] of Object.entries(table.annotations)) {
      lines.push(`// @${key}: ${value}`);
    }

    // Plain comments
    for (const comment of table.comments) {
      lines.push(`// ${comment}`);
    }

    // Table-level constraints
    for (const tc of table.tableConstraints) {
      lines.push(`// ${tc.type}(${tc.columns.join(", ")})`);
    }

    // Interface declaration
    const tableName = this.quoteIdentifier(table.name);
    lines.push(`interface ${tableName} {`);

    // Columns
    const columns = this.opts.sortColumns
      ? this.sortColumns(table.columns)
      : table.columns;

    for (const col of columns) {
      lines.push(this.indentStr + this.generateColumn(col));
    }

    lines.push("}");

    return lines.join("\n");
  }

  private generateColumn(col: Column): string {
    const name = this.quoteIdentifier(col.name) + (col.nullable ? "?" : "");
    const typeStr = this.formatType(col.type);
    let definition = `${name}: ${typeStr};`;

    const comment = this.buildComment(col);

    if (comment) {
      // Pad to comment alignment
      const padTo = Math.max(
        this.opts.commentAlignment - this.opts.indent,
        definition.length + 1,
      );
      definition = definition.padEnd(padTo);
      definition += `// ${comment}`;
    }

    return definition;
  }

  private formatType(type: ColumnType): string {
    if (type.kind === "union") {
      return type.values
        .map((v) => (typeof v === "string" ? `'${v}'` : String(v)))
        .join(" | ");
    }

    let result = type.base;
    if (type.length !== undefined) {
      result += `(${type.length})`;
    }
    if (type.isArray) {
      result += "[]";
    }
    return result;
  }

  private buildComment(col: Column): string | undefined {
    // If the column has a raw comment from parsing, use it as-is for round-trip fidelity
    if (col.comment) {
      return col.comment;
    }

    // Otherwise build from constraints
    const parts: string[] = [];

    for (const c of col.constraints) {
      switch (c.type) {
        case "PRIMARY_KEY":
          parts.push("PRIMARY KEY");
          break;
        case "AUTO_INCREMENT":
          parts.push("AUTO_INCREMENT");
          break;
        case "UNIQUE":
          parts.push("UNIQUE");
          break;
        case "INDEX":
          parts.push("INDEX");
          break;
        case "FOREIGN_KEY": {
          const ref = `FK -> ${c.referenceTable}(${c.referenceColumn})`;
          parts.push(c.referenceAction ? `${ref}, ${c.referenceAction}` : ref);
          break;
        }
        case "DEFAULT":
          parts.push(`DEFAULT ${c.value}`);
          break;
        case "CHECK":
          parts.push(`CHECK IN (${c.expression})`);
          break;
      }
    }

    return parts.length > 0 ? parts.join(", ") : undefined;
  }

  private quoteIdentifier(name: string): string {
    if (/^\w+$/.test(name)) {
      return name;
    }
    return "`" + name.replace(/`/g, "``") + "`";
  }

  private sortColumns(columns: Column[]): Column[] {
    const TIMESTAMP_NAMES = new Set([
      "created_at",
      "updated_at",
      "deleted_at",
    ]);

    return [...columns].sort((a, b) => {
      const aOrder = this.columnSortOrder(a, TIMESTAMP_NAMES);
      const bOrder = this.columnSortOrder(b, TIMESTAMP_NAMES);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return 0; // preserve original order within the same group
    });
  }

  private columnSortOrder(
    col: Column,
    timestamps: Set<string>,
  ): number {
    if (col.constraints.some((c) => c.type === "PRIMARY_KEY")) return 0;
    if (timestamps.has(col.name.toLowerCase())) return 2;
    return 1;
  }
}
