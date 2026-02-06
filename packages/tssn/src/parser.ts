/**
 * TSSN Parser — Parses TSSN text into structured Schema objects.
 * Implements TSSN Specification v0.7.0.
 */

import type {
  Schema,
  Table,
  Column,
  ColumnType,
  SimpleType,
  UnionType,
  Constraint,
  TableConstraint,
} from "./types.js";

export class TSSNParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public source?: string,
  ) {
    super(`Parse error at line ${line}: ${message}`);
    this.name = "TSSNParseError";
  }
}

/**
 * Parse a TSSN string into a Schema object.
 */
export function parse(input: string): Schema {
  const parser = new Parser(input);
  return parser.parse();
}

class Parser {
  private lines: string[];
  private pos: number;

  constructor(input: string) {
    this.lines = input.split(/\r?\n/);
    this.pos = 0;
  }

  parse(): Schema {
    const schema: Schema = { tables: [], annotations: {} };
    const pendingComments: string[] = [];

    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos].trim();

      if (line === "" || line === "}") {
        this.pos++;
        continue;
      }

      // Comment line — could be table-level constraint, annotation, or plain comment
      if (line.startsWith("//")) {
        pendingComments.push(line.slice(2).trimStart());
        this.pos++;
        continue;
      }

      // Interface declaration
      if (line.startsWith("interface")) {
        const table = this.parseInterface(pendingComments);
        schema.tables.push(table);
        pendingComments.length = 0;
        continue;
      }

      // Unknown line — skip
      this.pos++;
    }

    return schema;
  }

  private parseInterface(precedingComments: string[]): Table {
    const line = this.lines[this.pos];
    const match = line.match(
      /^\s*interface\s+(?:`([^`]*(?:``[^`]*)*)`|(\w+))\s*\{/,
    );
    if (!match) {
      throw new TSSNParseError("Invalid interface declaration", this.pos + 1, line);
    }

    const rawName = match[1] ?? match[2];
    const name = rawName.replace(/``/g, "`");

    // Process preceding comments: extract annotations and table constraints
    const annotations: Record<string, string> = {};
    const tableConstraints: TableConstraint[] = [];
    const comments: string[] = [];

    for (const comment of precedingComments) {
      const annotationMatch = comment.match(/^@(\w+):\s*(.+)$/);
      if (annotationMatch) {
        annotations[annotationMatch[1]] = annotationMatch[2].trim();
        continue;
      }

      const constraintMatch = comment.match(
        /^(UNIQUE|INDEX)\s*\(([^)]+)\)$/i,
      );
      if (constraintMatch) {
        tableConstraints.push({
          type: constraintMatch[1].toUpperCase() as "UNIQUE" | "INDEX",
          columns: constraintMatch[2].split(",").map((c) => c.trim()),
        });
        continue;
      }

      comments.push(comment);
    }

    this.pos++; // move past the interface line

    const columns: Column[] = [];

    while (this.pos < this.lines.length) {
      const colLine = this.lines[this.pos].trim();

      if (colLine === "}") {
        this.pos++;
        break;
      }

      if (colLine === "") {
        this.pos++;
        continue;
      }

      // Standalone comment inside interface
      // A line is a comment if it starts with "//" — detect this BEFORE trying
      // to parse as a column definition (comments may contain ":" characters).
      if (colLine.startsWith("//")) {
        const inner = colLine.slice(2).trimStart();
        const cMatch = inner.match(/^(UNIQUE|INDEX)\s*\(([^)]+)\)$/i);
        if (cMatch) {
          tableConstraints.push({
            type: cMatch[1].toUpperCase() as "UNIQUE" | "INDEX",
            columns: cMatch[2].split(",").map((c) => c.trim()),
          });
        }
        this.pos++;
        continue;
      }

      const column = this.parseColumn(colLine);
      columns.push(column);
      this.pos++;
    }

    return { name, columns, tableConstraints, annotations, comments };
  }

  private parseColumn(line: string): Column {
    // Remove trailing semicolon (with optional trailing whitespace)
    const stripped = line.replace(/;\s*(?=\/\/|$)/, " ").trim();

    // Split definition from comment
    const commentIdx = stripped.indexOf("//");
    const definition =
      commentIdx >= 0
        ? stripped.slice(0, commentIdx).trim()
        : stripped.trim();
    const rawComment =
      commentIdx >= 0 ? stripped.slice(commentIdx + 2).trimStart() : undefined;

    // Parse column name (quoted or simple) + nullable marker + type
    const colMatch = definition.match(
      /^(?:`([^`]*(?:``[^`]*)*)`|(\w+))(\?)?:\s*(.+)$/,
    );
    if (!colMatch) {
      throw new TSSNParseError(
        `Invalid column definition: ${definition}`,
        this.pos + 1,
        line,
      );
    }

    const rawColName = colMatch[1] ?? colMatch[2];
    const columnName = rawColName.replace(/``/g, "`");
    const nullable = colMatch[3] === "?";
    const typePart = colMatch[4].replace(/;$/, "").trim();

    const type = this.parseType(typePart);
    const constraints = rawComment
      ? this.parseConstraints(rawComment)
      : [];

    return {
      name: columnName,
      type,
      nullable,
      constraints,
      comment: rawComment,
    };
  }

  /**
   * Parse a type expression: either a literal union or a simple type.
   */
  private parseType(typePart: string): ColumnType {
    // Check for union type: 'val1' | 'val2' or 1 | 2 | 3
    if (/^('[^']*'|\d+)\s*\|/.test(typePart)) {
      return this.parseUnionType(typePart);
    }

    return this.parseSimpleType(typePart);
  }

  private parseUnionType(typePart: string): UnionType {
    const values: (string | number)[] = [];
    const parts = typePart.split("|");

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        values.push(trimmed.slice(1, -1));
      } else {
        const num = Number(trimmed);
        if (isNaN(num)) {
          throw new TSSNParseError(
            `Invalid union literal: ${trimmed}`,
            this.pos + 1,
          );
        }
        values.push(num);
      }
    }

    return { kind: "union", values };
  }

  private parseSimpleType(typePart: string): SimpleType {
    const match = typePart.match(/^(\w+)(?:\((\d+)\))?(\[\])?$/);
    if (!match) {
      throw new TSSNParseError(
        `Invalid type: ${typePart}`,
        this.pos + 1,
      );
    }

    return {
      kind: "simple",
      base: match[1],
      length: match[2] ? parseInt(match[2], 10) : undefined,
      isArray: match[3] === "[]",
    };
  }

  /**
   * Extract structured constraints from a comment string.
   */
  private parseConstraints(comment: string): Constraint[] {
    const constraints: Constraint[] = [];

    // PRIMARY KEY
    if (/\bPRIMARY\s+KEY\b|\bPK\b/i.test(comment)) {
      constraints.push({ type: "PRIMARY_KEY" });
    }

    // AUTO_INCREMENT / IDENTITY
    if (/\bAUTO_INCREMENT\b|\bIDENTITY\b/i.test(comment)) {
      constraints.push({ type: "AUTO_INCREMENT" });
    }

    // UNIQUE (standalone, not part of table-level constraint)
    if (/\bUNIQUE\b/i.test(comment)) {
      constraints.push({ type: "UNIQUE" });
    }

    // INDEX
    if (/\bINDEX\b/i.test(comment)) {
      constraints.push({ type: "INDEX" });
    }

    // FOREIGN KEY: FK -> Table(column) with optional action
    const fkMatch = comment.match(
      /(?:FOREIGN\s+KEY|FK)\s*->\s*([\w.]+)\((\w+)\)(?:,?\s*(ON\s+\w+\s+\w+(?:\s+\w+)?))?/i,
    );
    if (fkMatch) {
      constraints.push({
        type: "FOREIGN_KEY",
        referenceTable: fkMatch[1],
        referenceColumn: fkMatch[2],
        referenceAction: fkMatch[3]?.trim(),
      });
    }

    // DEFAULT value — match until next comma-separated constraint or end of comment
    const defaultMatch = comment.match(
      /\bDEFAULT\s+((?:'[^']*'|\S)+)/i,
    );
    if (defaultMatch) {
      // Strip trailing comma if followed by another constraint keyword
      const value = defaultMatch[1].replace(/,\s*$/, "");
      constraints.push({ type: "DEFAULT", value });
    }

    // CHECK IN (...)
    const checkMatch = comment.match(/\bCHECK\s+IN\s*\(([^)]+)\)/i);
    if (checkMatch) {
      constraints.push({ type: "CHECK", expression: checkMatch[1].trim() });
    }

    return constraints;
  }
}
