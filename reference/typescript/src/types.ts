/** Structured constraint extracted from an inline comment. */
export type Constraint =
  | { readonly type: 'PRIMARY_KEY' }
  | { readonly type: 'UNIQUE' }
  | { readonly type: 'INDEX' }
  | { readonly type: 'AUTO_INCREMENT' }
  | { readonly type: 'FOREIGN_KEY'; readonly referenceTable: string; readonly referenceColumn: string; readonly referenceSchema?: string }
  | { readonly type: 'DEFAULT'; readonly value: string };

/** A `@name: value` annotation extracted from a comment. */
export interface Annotation {
  readonly name: string;
  readonly value: string;
}

/** A single column definition inside an interface. */
export interface Column {
  readonly name: string;
  /** Base type name, or `'union'` for literal union types. */
  readonly type: string;
  readonly length?: number;
  readonly nullable: boolean;
  readonly isArray: boolean;
  /** Populated when `type === 'union'`. Always an array (empty for non-unions). */
  readonly unionValues: ReadonlyArray<string | number>;
  readonly constraints: readonly Constraint[];
  readonly comment?: string;
  readonly annotations: readonly Annotation[];
}

/** A parsed interface declaration representing a database table. */
export interface Table {
  readonly name: string;
  readonly columns: readonly Column[];
  /** Comments preceding the interface (e.g. multi-column constraints). */
  readonly metadata: readonly string[];
  /** Standalone comments inside the interface body. */
  readonly constraintComments: readonly string[];
  readonly annotations: readonly Annotation[];
  /** Resolved from `@schema` annotation in metadata, if present. */
  readonly schema?: string;
}

/** Top-level parse result containing all tables. */
export interface Schema {
  readonly tables: readonly Table[];
  /** Comments not attached to any interface. */
  readonly metadata: readonly string[];
  readonly annotations: readonly Annotation[];
}

/** Options to control parsing behaviour. */
export interface ParseOptions {
  /** Skip constraint extraction from comments. */
  readonly skipConstraints?: boolean;
  /** Skip annotation extraction from comments. */
  readonly skipAnnotations?: boolean;
}
