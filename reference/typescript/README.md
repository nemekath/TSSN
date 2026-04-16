# TSSN TypeScript Reference Parser

**Conformance level:** Level 3 (Extended) per
[TSSN-SPEC Section 5.1.3](../../TSSN-SPEC.md#513-level-3--extended)

This package is the reference TypeScript implementation of the TSSN
v0.8 specification. It is the authoritative source for what a
conformant parser does in every ambiguous edge case that the spec
prose does not settle unilaterally.

It is **not** a production-ready npm package. It is not published to
the registry, it has no type mapper or DDL generator, and it ships
intentionally as a small, auditable recursive-descent parser plus a
semantic validator. Its mandate is to be correct against the spec
and easy to read, not to be batteries-included.

## What this package is

- A parser that turns TSSN source text into a `Schema` AST
- A validator that checks semantic rules the grammar alone cannot
  enforce
- A conformance harness under `tests/conformance.test.ts` that runs
  the repo-level test suite in `tests/conformance/` (15 L1 + 25 L2
  + 26 L3 fixtures as of v0.8)

## What it is not

- Not a type mapper from database-specific types to TSSN (that's a
  separate layer)
- Not a DDL generator (parser/AST only)
- Not a database introspector (no `information_schema` queries)
- Not a serializer (parse-only; round-trip regeneration is a
  follow-up)
- Not published to npm (`"private": true` in package.json)
- Not stable — TSSN v0.8 is a draft standard; this implementation
  tracks the draft

## Installation

```bash
cd reference/typescript
npm install
```

Requires Node ≥ 20. No runtime dependencies; Vitest and TypeScript
are devDependencies only.

## Running the tests

```bash
npm test          # full suite: unit tests + canonical example + conformance
npm run typecheck # strict TypeScript, no emit
```

The suite runs in under a second. Every commit on the v0.8 branch
keeps the suite green.

## Quick start

```ts
import { parse, parseRaw, tables, views, typeAliases } from './src/index.js';

// Throws AggregateError on any parse or validation failure
const schema = parse(`
  type OrderStatus = 'pending' | 'shipped' | 'delivered';

  interface Orders {
    id: int;                    // PRIMARY KEY, AUTO_INCREMENT
    user_id: int;               // FK -> Users(id)
    status: OrderStatus;
    created_at: datetime;       // DEFAULT CURRENT_TIMESTAMP
  }
`);

console.log(tables(schema)[0].name);           // "Orders"
console.log(tables(schema)[0].columns.length); // 4
console.log(typeAliases(schema)[0].name);      // "OrderStatus"
```

## Public API

All exports are in `src/index.ts`.

### `parse(source, opts?) => Schema`

Parses and validates. Throws `AggregateError` containing all collected
parse and validation errors on failure.

```ts
function parse(source: string, opts?: { filename?: string }): Schema;
```

### `parseRaw(source, opts?) => { schema, errors }`

Parses without throwing. Returns both the parsed `Schema` and any
collected `ParseError[]`. Useful when you want multiple errors from
one input or when you want to inspect a partial parse.

```ts
function parseRaw(source: string, opts?: { filename?: string }): {
  schema: Schema;
  errors: ParseError[];
};
```

Note: `parseRaw` only runs the parser, not the validator. Call
`validate(schema)` separately to collect semantic errors.

### `validate(schema) => ValidationError[]`

Runs the semantic checks (composite PK mixing, duplicate names,
unknown base types, heterogeneous unions, view annotation
combinations, etc.). Never throws. See
`src/validate.ts` for the full list of checks and error codes.

### `tokenize(source) => Token[]`

Runs just the lexer. Useful for testing or for tools that want
token-level introspection.

### Helpers

```ts
tables(schema): TableDecl[]        // declarations where kind === 'table'
views(schema): ViewDecl[]          // declarations where kind === 'view'
typeAliases(schema): TypeAliasDecl[] // declarations where kind === 'type_alias'
```

Declaration order is preserved by `schema.declarations`; the helpers
filter by kind without losing order.

### AST types

Every AST node is a discriminated union keyed on `kind`. See
`src/ast.ts` for the full set:

- `TopLevel = TableDecl | ViewDecl | TypeAliasDecl`
- `TypeExpr = BaseType | ArrayType | UnionType | AliasType`
- `Literal = StringLiteral | NumberLiteral`
- `Constraint = PrimaryKeyConstraint | CompositePrimaryKeyConstraint | ForeignKeyConstraint | UniqueConstraint | IndexConstraint | AutoIncrementConstraint | DefaultConstraint | ComputedConstraint`
- `Annotation = { key, value?, raw, span }`

Every node carries a `span: Span` with start and end positions for
error reporting and tool integration.

## Error codes

Validator errors carry a machine-readable `code` field that the
conformance suite consumes directly. The current vocabulary is:

| Code | Meaning |
|---|---|
| `unknown_base_type` | A BaseType whose `base` is not in the 14-entry canonical set |
| `heterogeneous_union` | A literal union mixing string and numeric literals |
| `alias_shadows_base_type` | A type alias name that collides with a base type |
| `duplicate_type_alias` | Two `type` declarations with the same name |
| `alias_self_reference` | `type A = A;` |
| `duplicate_column` | Two columns with the same name in one declaration |
| `duplicate_declaration` | Two interfaces/views with the same qualified name |
| `mixed_pk_forms` | Inline PRIMARY KEY and interface-level PK(...) on one table |
| `unknown_column_in_constraint` | PK(...) / UNIQUE(...) / INDEX(...) names a column that doesn't exist |
| `materialized_on_table` | `@materialized` applied to an interface instead of a view |
| `contradictory_view_annotations` | `@readonly` + `@updatable` or `@materialized` + `@updatable` |

Parse errors do not currently carry codes — they are matched by
substring in the conformance suite via the `errorMessage` sidecar
field. Assigning stable codes to parser errors is a follow-up item.

## Spec ambiguities resolved in this implementation

v0.8 leaves a small number of questions open in [CHARTER.md Section
10](../../CHARTER.md#10-open-questions-for-the-editor). This
implementation takes the following pragmatic positions on the
resolved questions; for the still-open ones, the default is
documented inline in the code and noted here.

**Resolved (enforced by this implementation):**

- `type X = int;` that collides with a base type is a validator
  error (`alias_shadows_base_type`)
- Mixed-literal unions (`'yes' | 1`) are a validator error
  (`heterogeneous_union`)
- Unknown base-type identifiers are a validator error
  (`unknown_base_type`)
- `@materialized` + `@updatable` and `@readonly` + `@updatable` are
  validator errors (`contradictory_view_annotations`)
- File-level `@schema` propagation: a top-of-file `@schema` annotation
  that is separated from the first table/view by an intervening type
  alias becomes the parse-unit default and propagates to subsequent
  declarations
- Composite PK column order is significant (generators MUST preserve
  it)
- Type aliases must be declared before any interface or view (parser
  rejects placement violations)
- Alias-to-alias references rejected at parse time
- Underscore-leading identifiers (`_internal`, `_created_at`) are
  accepted by both lexer and spec (EBNF was broadened in v0.8)
- Contextual keywords (`interface`, `view`, `type`) remain valid as
  column names

**Still open (tracked in Charter 10.1):**

- Unicode in simple_id: this implementation accepts ASCII only per
  the current EBNF; Unicode is supported through quoted identifiers
- DEFAULT values containing quoted commas: the current constraint
  parser truncates at the first comma; a quote-aware tokenizer is
  pending
- Canonical `.ast.json` field order and numeric formatting for
  cross-implementation conformance: will be specified when a second
  implementation exists

## Running the conformance suite manually

The harness runs automatically with `npm test`, but you can run it
in isolation:

```bash
npm test -- tests/conformance.test.ts
```

To add a new fixture, drop a pair of files into the right level
directory at `../../tests/conformance/levelN/`:

```
../../tests/conformance/level2/042-your-feature.tssn
../../tests/conformance/level2/042-your-feature.expected.json
```

The harness discovers new fixtures automatically at test collection
time — no code change needed unless you add fields to the sidecar
format (in which case extend `runPositive` or `runNegative` in
`tests/conformance.test.ts`).

## Directory layout

```
reference/typescript/
├── README.md                      (this file)
├── package.json                   devDeps only, "private": true
├── tsconfig.json                  strict + noUncheckedIndexedAccess
├── src/
│   ├── index.ts                   Public API re-exports
│   ├── ast.ts                     Discriminated union AST types
│   ├── lexer.ts                   Character-level tokenizer
│   ├── parser.ts                  Recursive descent
│   ├── constraints.ts             Comment-embedded constraint extraction
│   ├── annotations.ts             @key[: value] annotation extraction
│   ├── validate.ts                Semantic validator
│   └── errors.ts                  ParseError class
└── tests/
    ├── lexer.test.ts              Token-level correctness
    ├── parser-interfaces.test.ts  Interface declarations
    ├── parser-types.test.ts       Base types + nullability
    ├── parser-arrays.test.ts      Array types
    ├── parser-unions.test.ts      Literal unions
    ├── parser-aliases.test.ts     Type aliases
    ├── parser-views.test.ts       view keyword
    ├── parser-identifiers.test.ts Quoted identifiers
    ├── parser-constraints.test.ts Inline constraints
    ├── parser-annotations.test.ts @... annotations
    ├── parser-errors.test.ts      Error reporting
    ├── validator.test.ts          Semantic checks
    ├── examples-canonical.test.ts EXAMPLES.md Section 16 smoke test
    └── conformance.test.ts        Data-driven harness (repo-level fixtures)
```

## License

MIT. See [../../LICENSE](../../LICENSE).
