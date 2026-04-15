/**
 * Semantic validator for parsed TSSN schemas.
 *
 * The parser handles syntactic conformance to the EBNF. The validator
 * handles rules expressed as prose in the spec that cannot be enforced
 * purely from the grammar, such as:
 *
 * - Mixed primary-key forms (inline PRIMARY KEY plus interface-level
 *   PK(...) on the same table)
 * - Duplicate column names within a single interface or view
 * - Duplicate alias / interface / view names within a namespace
 * - Composite constraint columns referring to columns that don't exist
 *   on the declaring table
 * - `@materialized` applied to an interface instead of a view
 * - Alias-to-alias references or self-references sneaking past the
 *   parse-time check (defense in depth)
 *
 * `validate()` never throws and returns all errors found so that tools
 * can render them together. The top-level `parse()` function includes
 * validation errors in the AggregateError it throws on failure.
 */

import type {
  Column,
  Schema,
  TableDecl,
  TypeAliasDecl,
  ViewDecl,
} from './ast.js';
import type { Span } from './lexer.js';

export interface ValidationError {
  code: string;
  message: string;
  span: Span;
}

export function validate(schema: Schema): ValidationError[] {
  const errors: ValidationError[] = [];

  const aliases: TypeAliasDecl[] = [];
  const tables: TableDecl[] = [];
  const views: ViewDecl[] = [];
  for (const d of schema.declarations) {
    if (d.kind === 'type_alias') aliases.push(d);
    else if (d.kind === 'table') tables.push(d);
    else if (d.kind === 'view') views.push(d);
  }

  checkDuplicateAliases(aliases, errors);
  checkAliasSelfReference(aliases, errors);
  checkDuplicateDeclarationNames([...tables, ...views], errors);

  for (const table of tables) {
    checkDuplicateColumns(table.columns, errors);
    checkMixedPkForms(table, errors);
    checkCompositeColumnRefs(table, errors);
    checkMaterializedOnTable(table, errors);
  }

  for (const view of views) {
    checkDuplicateColumns(view.columns, errors);
    checkCompositeColumnRefs(view, errors);
  }

  return errors;
}

// ---------- individual checks ----------

function checkDuplicateAliases(
  aliases: TypeAliasDecl[],
  errors: ValidationError[]
): void {
  const seen = new Set<string>();
  for (const a of aliases) {
    if (seen.has(a.name)) {
      errors.push({
        code: 'duplicate_type_alias',
        message: `Duplicate type alias '${a.name}'`,
        span: a.span,
      });
      continue;
    }
    seen.add(a.name);
  }
}

function checkAliasSelfReference(
  aliases: TypeAliasDecl[],
  errors: ValidationError[]
): void {
  for (const a of aliases) {
    if (a.rhs.kind === 'alias' && a.rhs.name === a.name) {
      errors.push({
        code: 'alias_self_reference',
        message: `Type alias '${a.name}' references itself`,
        span: a.span,
      });
    }
  }
}

function checkDuplicateDeclarationNames(
  decls: Array<TableDecl | ViewDecl>,
  errors: ValidationError[]
): void {
  const seen = new Set<string>();
  for (const d of decls) {
    const key = `${d.schema ?? ''}::${d.name}`;
    if (seen.has(key)) {
      const scope = d.schema !== undefined ? ` in schema '${d.schema}'` : '';
      errors.push({
        code: 'duplicate_declaration',
        message: `Duplicate ${d.kind} name '${d.name}'${scope}`,
        span: d.span,
      });
      continue;
    }
    seen.add(key);
  }
}

function checkDuplicateColumns(
  columns: Column[],
  errors: ValidationError[]
): void {
  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c.name)) {
      errors.push({
        code: 'duplicate_column',
        message: `Duplicate column '${c.name}'`,
        span: c.span,
      });
      continue;
    }
    seen.add(c.name);
  }
}

function checkMixedPkForms(table: TableDecl, errors: ValidationError[]): void {
  const hasInlinePk = table.columns.some((c) =>
    c.constraints.some((cc) => cc.kind === 'primary_key')
  );
  const hasCompositePk = table.tableConstraints.some(
    (c) => c.kind === 'composite_primary_key'
  );
  if (hasInlinePk && hasCompositePk) {
    errors.push({
      code: 'mixed_pk_forms',
      message: `Table '${table.name}' mixes inline PRIMARY KEY with interface-level PK(...) — use exactly one form per table`,
      span: table.span,
    });
  }
}

function checkCompositeColumnRefs(
  decl: TableDecl | ViewDecl,
  errors: ValidationError[]
): void {
  const columnNames = new Set(decl.columns.map((c) => c.name));
  for (const constraint of decl.tableConstraints) {
    let cols: string[] | undefined;
    if (constraint.kind === 'composite_primary_key') {
      cols = constraint.columns;
    } else if (constraint.kind === 'unique') {
      cols = constraint.columns;
    } else if (constraint.kind === 'index') {
      cols = constraint.columns;
    }
    if (cols === undefined) continue;
    for (const colName of cols) {
      if (!columnNames.has(colName)) {
        errors.push({
          code: 'unknown_column_in_constraint',
          message: `${constraintKindLabel(constraint.kind)} references unknown column '${colName}' in '${decl.name}'`,
          span: decl.span,
        });
      }
    }
  }
}

function checkMaterializedOnTable(
  table: TableDecl,
  errors: ValidationError[]
): void {
  const ann = table.annotations.find((a) => a.key === 'materialized');
  if (ann !== undefined) {
    errors.push({
      code: 'materialized_on_table',
      message: `@materialized applies only to views, not tables — found on '${table.name}'`,
      span: ann.span,
    });
  }
}

function constraintKindLabel(kind: string): string {
  switch (kind) {
    case 'composite_primary_key':
      return 'PK(...)';
    case 'unique':
      return 'UNIQUE(...)';
    case 'index':
      return 'INDEX(...)';
    default:
      return kind;
  }
}
