/**
 * TSSN Core Data Structures
 * Based on TSSN Specification v0.7.0
 */

/** Supported TSSN base types (Section 2.2) */
export type TSSNBaseType =
  | "int"
  | "decimal"
  | "float"
  | "number"
  | "string"
  | "char"
  | "text"
  | "datetime"
  | "date"
  | "time"
  | "boolean"
  | "blob"
  | "uuid"
  | "json";

/** Constraint types supported by TSSN (Section 2.4) */
export type ConstraintType =
  | "PRIMARY_KEY"
  | "FOREIGN_KEY"
  | "UNIQUE"
  | "INDEX"
  | "AUTO_INCREMENT"
  | "DEFAULT"
  | "CHECK";

/** A single constraint on a column */
export interface Constraint {
  type: ConstraintType;
  /** For FOREIGN_KEY: referenced table */
  referenceTable?: string;
  /** For FOREIGN_KEY: referenced column */
  referenceColumn?: string;
  /** For FOREIGN_KEY: referential action (e.g. "ON DELETE CASCADE") */
  referenceAction?: string;
  /** For DEFAULT: the default value */
  value?: string;
  /** For CHECK: the check expression */
  expression?: string;
}

/** A multi-column constraint at the interface level (Section 2.5) */
export interface TableConstraint {
  type: "UNIQUE" | "INDEX";
  columns: string[];
}

/**
 * Column type definition.
 * Either a simple type (base + optional length + optional array)
 * or a literal union type (v0.7.0).
 */
export interface SimpleType {
  kind: "simple";
  base: string;
  length?: number;
  isArray: boolean;
}

export interface UnionType {
  kind: "union";
  values: (string | number)[];
}

export type ColumnType = SimpleType | UnionType;

/** A column within a table (Section 2.1 - 2.2.6) */
export interface Column {
  name: string;
  type: ColumnType;
  nullable: boolean;
  constraints: Constraint[];
  /** Raw comment text (everything after //) */
  comment?: string;
}

/** A table/interface definition */
export interface Table {
  name: string;
  columns: Column[];
  /** Table-level constraints (UNIQUE, INDEX on multiple columns) */
  tableConstraints: TableConstraint[];
  /** Annotations like @schema, @description, etc. */
  annotations: Record<string, string>;
  /** Raw comment lines preceding the interface */
  comments: string[];
}

/** A complete TSSN schema (one or more tables) */
export interface Schema {
  tables: Table[];
  /** Schema-level annotations */
  annotations: Record<string, string>;
}
