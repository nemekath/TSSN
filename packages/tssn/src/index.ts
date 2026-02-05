/**
 * @tssn/parser — TypeScript-Style Schema Notation
 *
 * Reference implementation for parsing and generating TSSN (v0.7.0).
 *
 * @example
 * ```ts
 * import { parse, generate } from "@tssn/parser";
 *
 * const schema = parse(`
 * interface Users {
 *   id: int;              // PRIMARY KEY
 *   email: string(255);   // UNIQUE
 * }
 * `);
 *
 * console.log(schema.tables[0].name); // "Users"
 * console.log(generate(schema));
 * ```
 */

export { parse, TSSNParseError } from "./parser.js";
export { generate, generateTable } from "./generator.js";
export type {
  Schema,
  Table,
  Column,
  ColumnType,
  SimpleType,
  UnionType,
  Constraint,
  ConstraintType,
  TableConstraint,
  TSSNBaseType,
} from "./types.js";
export type { GeneratorOptions } from "./generator.js";
