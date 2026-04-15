/**
 * AST types for TSSN v0.8, targeting Level 3 conformance.
 *
 * Every node carries a Span so downstream tools (linters, LSP servers,
 * DDL generators) can report exact positions. Discriminated unions on
 * the `kind` field make exhaustive pattern matching safe under strict
 * TypeScript.
 *
 * Declaration order at the top level is preserved via a single
 * `declarations: TopLevel[]` array rather than split tables/views/aliases
 * collections. Consumers that want just one kind call the helper
 * functions at the bottom of this file.
 */

import type { Span } from './lexer.js';

export type { Position, Span } from './lexer.js';

// ---------- type expressions ----------

export type TypeExpr =
  | BaseType
  | ArrayType
  | UnionType
  | AliasType;

export interface BaseType {
  kind: 'base';
  /** The base type name, lowercased by convention (e.g., 'int', 'string'). */
  base: string;
  /** Optional length parameter for sized types like `string(255)` or `char(3)`. */
  length?: number;
  span: Span;
}

export interface ArrayType {
  kind: 'array';
  element: TypeExpr;
  span: Span;
}

export interface UnionType {
  kind: 'union';
  literals: Literal[];
  span: Span;
}

/** An alias reference. `name` is the alias identifier as written at the use
 *  site; `resolved` is the concrete type expression the alias expands to. */
export interface AliasType {
  kind: 'alias';
  name: string;
  resolved: TypeExpr;
  span: Span;
}

export type Literal = StringLiteral | NumberLiteral;

export interface StringLiteral {
  kind: 'string';
  value: string;
}

export interface NumberLiteral {
  kind: 'number';
  value: number;
}

// ---------- columns ----------

export interface Column {
  /** Column name as written (unescaped for quoted identifiers). */
  name: string;
  /** True if the source used backtick-quoted form. */
  quoted: boolean;
  /** True if the column has a `?` nullable marker. */
  nullable: boolean;
  type: TypeExpr;
  /** The raw text after `//` on this column's line, verbatim, or null if
   *  no trailing comment was present. Preserved for L1 opaque capture. */
  rawComment: string | null;
  /** Structured constraints extracted from the raw comment at L2+. */
  constraints: Constraint[];
  /** `@...` annotations extracted from the raw comment at L3. */
  annotations: Annotation[];
  span: Span;
}

// ---------- constraints ----------

export type Constraint =
  | PrimaryKeyConstraint
  | CompositePrimaryKeyConstraint
  | ForeignKeyConstraint
  | UniqueConstraint
  | IndexConstraint
  | AutoIncrementConstraint
  | DefaultConstraint
  | ComputedConstraint;

export interface PrimaryKeyConstraint {
  kind: 'primary_key';
  raw: string;
}

export interface CompositePrimaryKeyConstraint {
  kind: 'composite_primary_key';
  columns: string[];
  raw: string;
}

export interface ForeignKeyConstraint {
  kind: 'foreign_key';
  /** Optional schema namespace for cross-schema references. */
  schema?: string;
  table: string;
  column: string;
  /** Trailing text after the reference, e.g. "ON DELETE CASCADE". Opaque. */
  tail?: string;
  raw: string;
}

export interface UniqueConstraint {
  kind: 'unique';
  /** Populated for interface-level `UNIQUE(a, b)`; omitted for inline. */
  columns?: string[];
  raw: string;
}

export interface IndexConstraint {
  kind: 'index';
  /** Populated for interface-level `INDEX(a, b)`; omitted for inline. */
  columns?: string[];
  raw: string;
}

export interface AutoIncrementConstraint {
  kind: 'auto_increment';
  raw: string;
}

export interface DefaultConstraint {
  kind: 'default';
  value: string;
  raw: string;
}

export interface ComputedConstraint {
  kind: 'computed';
  /** Optional expression text after `@computed:`. May be omitted. */
  expression?: string;
  raw: string;
}

// ---------- annotations ----------

/** A parsed `@key: value` annotation. Both key and value are trimmed.
 *  `value` is undefined for boolean-style annotations like `@materialized`. */
export interface Annotation {
  key: string;
  value?: string;
  raw: string;
  span: Span;
}

// ---------- top-level declarations ----------

export type TopLevel = TableDecl | ViewDecl | TypeAliasDecl;

export interface TableDecl {
  kind: 'table';
  name: string;
  quoted: boolean;
  /** @schema annotation value if present on a leading comment. */
  schema?: string;
  columns: Column[];
  /** Interface-level constraints parsed from standalone comments inside
   *  the body (e.g., PK(a, b), UNIQUE(a, b), INDEX(a, b)). */
  tableConstraints: Constraint[];
  /** All @... annotations from leading or interior comments. */
  annotations: Annotation[];
  /** Raw text of preceding non-annotation comments, preserved verbatim. */
  leadingComments: string[];
  span: Span;
}

export interface ViewDecl {
  kind: 'view';
  name: string;
  quoted: boolean;
  schema?: string;
  columns: Column[];
  tableConstraints: Constraint[];
  /** True if `@materialized` was present. */
  materialized: boolean;
  /** Effective read-only semantic of the view. True when `@updatable` is
   *  absent OR when `@readonly` is explicitly present. A plain view with
   *  no annotations is read-only by default, per Spec Section 2.9.2. */
  readonly: boolean;
  /** True only when `@readonly` was written explicitly in the source.
   *  Distinguishes `view X {}` (readonlyAnnotated=false, readonly=true)
   *  from `// @readonly\nview X {}` (both true) for round-trip
   *  regeneration. */
  readonlyAnnotated: boolean;
  /** True if `@updatable` was present (overrides the default). */
  updatable: boolean;
  annotations: Annotation[];
  leadingComments: string[];
  span: Span;
}

export interface TypeAliasDecl {
  kind: 'type_alias';
  name: string;
  rhs: TypeExpr;
  span: Span;
}

// ---------- schema ----------

export interface Schema {
  /** The full source text that was parsed, after BOM stripping and line
   *  ending normalization. */
  source: string;
  /** Optional filename or input identifier, echoed in error messages. */
  filename?: string;
  /** Top-level declarations in source order. */
  declarations: TopLevel[];
}

// ---------- helpers ----------

export function tables(schema: Schema): TableDecl[] {
  return schema.declarations.filter((d): d is TableDecl => d.kind === 'table');
}

export function views(schema: Schema): ViewDecl[] {
  return schema.declarations.filter((d): d is ViewDecl => d.kind === 'view');
}

export function typeAliases(schema: Schema): TypeAliasDecl[] {
  return schema.declarations.filter((d): d is TypeAliasDecl => d.kind === 'type_alias');
}
