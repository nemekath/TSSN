# TypeScript-Style Schema Notation (TSSN)

**Version:** 0.8.0
**Status:** Draft Specification
**Date:** 2026-04-14
**Authors:** Benjamin Zimmer
**License:** MIT

## Abstract

TypeScript-Style Schema Notation (TSSN) is a human-readable, token-efficient format for representing database table structures with their columns, types, and constraints. It uses semantic compression - similar to how JPEG preserves visual appearance while discarding pixel-perfect detail, TSSN preserves schema structure while discarding database-specific implementation details. This approach reduces token consumption by 40-60% compared to standard JSON representations while maintaining clarity and expressiveness. TSSN is optimized for AI language model consumption and developer readability.

## 1. Introduction

### 1.1 Motivation

Traditional schema representations (JSON, XML, verbose DDL) suffer from high token costs when used in AI-assisted development workflows. A typical 50-column table schema can consume 2000+ tokens in standard JSON format. TSSN addresses this by leveraging the fact that language models are highly efficient at parsing code-like structures.

### 1.2 Design Goals

1. **Token Efficiency**: Reduce token consumption by 40-60% compared to JSON
2. **Human Readability**: Maintain clarity for developers
3. **LLM Native**: Use syntax patterns familiar to language models
4. **Semantic Preservation**: Preserve essential schema structure and relationships through lossy compression
5. **Extensible**: Support domain-specific annotations

### 1.3 Scope

TSSN is designed for schema *representation* and *communication*, not schema *definition* or *execution*.

Unlike lossless data serialization formats (JSON for data interchange, Protocol Buffers for structured data), TSSN uses semantic compression similar to JPEG - it preserves essential structure while discarding implementation details. This makes it ideal for:
- Documentation and human understanding
- LLM context windows and code generation
- Schema discussion and collaboration

TSSN does not replace SQL DDL or migration tools, but complements them as a token-efficient communication layer.

#### 1.3.1 Primary Use Case: Read Query Generation

TSSN is optimized for enabling LLMs to write **read queries** (SELECT statements). The schema information preserved by TSSN is specifically chosen to support:

- Correct table and column references
- Proper JOIN construction via foreign key relationships
- Appropriate WHERE clause syntax based on column types
- Understanding of nullability for IS NULL / IS NOT NULL conditions

TSSN intentionally discards information irrelevant to read queries (storage engines, precise decimal scales, index implementations) to maximize token efficiency.

#### 1.3.2 Positioning: When to Use TSSN

TSSN fills a specific niche in the schema representation landscape:

| Environment | Recommended Approach |
|-------------|---------------------|
| GraphQL API available | Use GraphQL SDL — already optimized for typed queries |
| Modern ORM (Prisma, etc.) | Use native schema format — tooling already exists |
| Legacy SQL without API layer | **Use TSSN** — lightweight, no infrastructure changes |
| Token-constrained LLM context | **Use TSSN** — maximum information density |
| DDL generation / migrations | Use SQL DDL — TSSN is lossy by design |

TSSN is particularly valuable for:
- Enterprise systems with large legacy databases
- Environments where adding GraphQL infrastructure is impractical
- MCP (Model Context Protocol) servers providing database access to LLMs

## 2. Syntax Specification

### 2.1 Core Structure

TSSN uses TypeScript interface-like syntax:

```typescript
interface TableName {
  column_name: int;
  nullable_column?: string(255);
  // Comments for metadata
}
```

In the example above, `int` and `string(255)` are drawn from the
base type set defined in Section 2.2.1–2.2.4. The placeholder
pseudo-name `DataType` used in earlier drafts of this section is
not a real TSSN type — every column declaration MUST use a concrete
base type, a literal union, an array of either, or a previously
declared type alias.

### 2.2 Data Type Mapping

TSSN uses abstract type categories rather than database-specific types. These categories represent broad type families that map to concrete SQL types:

#### 2.2.1 Numeric Types

| Type Category | Description | SQL Examples |
|---------------|-------------|--------------|
| `int` | Integer values | INT, BIGINT, SMALLINT, TINYINT |
| `decimal` | Fixed-point decimal | DECIMAL, NUMERIC, MONEY |
| `float` | Floating-point | FLOAT, REAL, DOUBLE |
| `number` | Generic numeric | Any numeric type |

#### 2.2.2 String Types

| Type Category | Description | SQL Examples |
|---------------|-------------|--------------|
| `string` | Variable-length text without specified maximum | VARCHAR, TEXT, NVARCHAR |
| `string(n)` | Variable-length text with maximum length n | VARCHAR(n), NVARCHAR(n) |
| `char(n)` | Fixed-length text (always n characters) | CHAR(n), NCHAR(n) |
| `text` | Large variable-length text | TEXT, CLOB, NTEXT, LONGTEXT |

#### 2.2.3 Temporal Types

| Type Category | Description | SQL Examples |
|---------------|-------------|--------------|
| `datetime` | Date and time | DATETIME, TIMESTAMP |
| `date` | Date only | DATE |
| `time` | Time only | TIME |

#### 2.2.4 Other Types

| Type Category | Description | SQL Examples |
|---------------|-------------|--------------|
| `boolean` | Boolean values | BIT, BOOLEAN, TINYINT(1) |
| `blob` | Binary data | VARBINARY, BLOB, IMAGE |
| `uuid` | Universally unique identifier | UUID, UNIQUEIDENTIFIER |
| `json` | JSON data | JSON, JSONB |

#### 2.2.5 Array Types

The `[]` suffix indicates array/list columns. This semantic hint helps LLMs generate appropriate array operations (ANY, UNNEST, array containment operators) instead of scalar comparisons:

```typescript
interface Articles {
  id: int;                    // PRIMARY KEY
  title: string(200);
  tags: string[];             // PostgreSQL text[], use ANY() or @> operators
  scores: int[];              // PostgreSQL integer[]
  metadata?: json[];          // Array of JSON objects
}
```

**LLM Query Generation Impact:**

Without array hint, an LLM might generate:
```sql
WHERE tags = 'javascript'           -- Incorrect for arrays
```

With array hint, the LLM generates:
```sql
WHERE 'javascript' = ANY(tags)      -- Correct array operation
```

**Database Mapping:**

| TSSN | PostgreSQL | SQL Server | MySQL |
|------|------------|------------|-------|
| `string[]` | `TEXT[]` | — | — |
| `int[]` | `INTEGER[]` | — | — |
| `json[]` | `JSONB[]` | — | — |

**Note**: Arrays are primarily a PostgreSQL feature. For databases without native array support, this notation indicates the column stores serialized array data (typically as JSON).

#### 2.2.6 Literal Union Types

For columns with a fixed set of allowed values (enums), TSSN supports TypeScript-style literal union types. This provides LLMs with exact valid values, reducing hallucination in WHERE clauses:

```typescript
interface Orders {
  id: int;                              // PRIMARY KEY
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  priority: 1 | 2 | 3;                  // Numeric unions also supported
  payment_method?: 'card' | 'bank' | 'crypto';  // Nullable union
}
```

**LLM Query Generation Impact:**

Without literal unions, an LLM might hallucinate invalid values:
```sql
WHERE status = 'active'              -- Invalid! Not in allowed values
```

With literal unions, the LLM knows exact options:
```sql
WHERE status = 'pending'             -- Valid, from union type
WHERE status IN ('shipped', 'delivered')  -- Valid combination
```

**When to Use Literal Unions:**

| Scenario | Recommendation |
|----------|----------------|
| ≤10 distinct values | Use literal union |
| >10 values | Use `string` + `@enum` annotation |
| Dynamic/external values | Use base type with comment |

**Examples:**

```typescript
// Good: Small, fixed set
status: 'draft' | 'published' | 'archived';

// Good: Numeric enum
priority: 1 | 2 | 3;

// Fallback: Large enum (too many values for inline)
country_code: string(2);    // @enum: ISO 3166-1 alpha-2

// Fallback: Dynamic values
category_id: int;           // FK -> Categories(id)
```

**Database Mapping:**

Literal unions map to the underlying base type with a CHECK constraint:

| TSSN | SQL Equivalent |
|------|----------------|
| `'a' \| 'b' \| 'c'` | `VARCHAR CHECK (col IN ('a','b','c'))` |
| `1 \| 2 \| 3` | `INT CHECK (col IN (1,2,3))` |

**Note**: The primary purpose of literal unions is semantic precision for LLMs, not DDL generation. Implementations may choose how to represent these in generated SQL.

**Constraints on Literal Unions:**

The following rules are normative:

1. **Integer-only numbers.** Numeric literals in unions MUST be integers.
   Floating-point literals such as `1.5 | 2.5` are not permitted. The
   EBNF's `number_lit = "-"? digits` is deliberately integer-only;
   implementations MUST reject floats with a clear parse error.
2. **Homogeneous literals.** A single union MUST contain either
   exclusively string literals or exclusively numeric literals. Mixed
   unions such as `'yes' | 1` are not permitted. Validators MUST reject
   such unions at semantic-check time even though the grammar permits
   the token sequence.
3. **Minimum cardinality.** A union MUST contain at least two distinct
   literals. A "union" of one literal is not a meaningful type and
   implementations MUST reject it.

**Negative examples (invalid):**

```typescript
// Float literal in a union — not permitted
priority: 1.0 | 2.0 | 3.0;     // INVALID: floats

// Mixed-literal union — not permitted
answer: 'yes' | 1;              // INVALID: mixed

// Single-literal "union" — not permitted
flag: 'on';                     // INVALID: not a union; use 'on' | 'off' or a base type
```

#### 2.2.7 Type Aliases

A *type expression* is any RHS that may appear in a column declaration:
a base type with optional length, an array suffix applied to a base
type, or a literal union. The formal grammar is given in Appendix A as
the `type_expr` production.

Literal unions that repeat across multiple tables waste tokens — precisely
the cost TSSN exists to eliminate. Type aliases allow a literal union (or any
other type expression) to be named once and reused:

```typescript
type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';
type Priority = 1 | 2 | 3;

interface Orders {
  id: int;                    // PRIMARY KEY
  status: OrderStatus;
  priority: Priority;
}

interface Shipments {
  id: int;                    // PRIMARY KEY
  order_id: int;              // FK -> Orders(id)
  status: OrderStatus;        // Reuses the same allowed values
}
```

**Token Efficiency Impact:**

Without aliases, a 10-table schema repeating a 4-value status union pays the
token cost 10 times. With aliases, it is paid once. For LLM context windows
this is the highest-leverage feature in v0.8 — pure information reuse.

**Syntax:**

```
type Identifier = type_expression;
```

| Rule | Detail |
|------|--------|
| Placement | At the top of the schema, before any `interface` or `view` |
| Identifier | PascalCase recommended (`OrderStatus`, not `order_status`) |
| Allowed RHS | Literal unions, base types with length, arrays of either |
| Forward references | Not allowed — aliases MUST be declared before first use |
| Nesting | Aliases MAY NOT reference other aliases (no transitive resolution) |
| Name collisions | An alias identifier MUST NOT match the name of a base type from Sections 2.2.1–2.2.4 (e.g., `type int = ...;` is invalid). Validators MUST reject such declarations. |
| Scope | Parse-unit-level — aliases declared in a single `parse()` invocation are visible to declarations in that same invocation and nowhere else. TSSN has no module or file system, so there is no cross-unit export or import. |

**Allowed Right-Hand Sides:**

```typescript
type OrderStatus = 'pending' | 'shipped' | 'delivered';  // Literal union
type Rating      = 1 | 2 | 3 | 4 | 5;                    // Numeric union
type ShortCode   = string(10);                           // Sized string
type Tags        = string[];                             // Array type
type Scores      = int[];                                // Array of numbers
```

**Not Allowed:**

```typescript
type Alias1 = OrderStatus;         // INVALID: references another alias
type Alias2 = interface Users;     // INVALID: references a table
type Alias3 = string | int;        // INVALID: mixed base type union
```

**Nullability:**

Aliases themselves do not declare nullability. A column using an alias
applies `?` at the column site as usual:

```typescript
type OrderStatus = 'pending' | 'shipped' | 'delivered';

interface Orders {
  status: OrderStatus;          // NOT NULL
  prev_status?: OrderStatus;    // NULL allowed, reuses the same alias
}
```

**Database Mapping:**

Type aliases do not map to SQL `CREATE DOMAIN` or `CREATE TYPE` — they are
strictly a TSSN-level compression mechanism. Generators MUST inline the
alias definition when producing DDL:

| TSSN | Generated DDL (PostgreSQL) |
|------|---------------------------|
| `type OrderStatus = 'pending' \| 'shipped';` + `status: OrderStatus;` | `status VARCHAR CHECK (status IN ('pending','shipped'))` |

**Parser Requirements:**

1. Collect all `type` declarations in a first pass
2. Resolve aliases to their concrete type when emitting the parsed AST
3. Preserve the alias name in the AST for round-trip fidelity
4. Reject forward references and alias-to-alias references with a clear error

**Backward Compatibility:**

Type aliases are purely additive. Any schema valid under v0.7 or earlier
remains valid under v0.8 because pre-v0.8 schemas contain no `type`
declarations. The new `type` identifier becomes a reserved top-level
keyword in v0.8; implementations MUST NOT reject v0.7 schemas that use
`type` as a **column** name, since column-name position is unaffected by
the top-level keyword rule.

### 2.3 Nullability

The `?` suffix indicates nullable columns:

```typescript
interface Users {
  id: int;              // NOT NULL
  email?: string;       // NULL allowed
}
```

### 2.4 Constraints and Metadata

Constraints are documented using inline comments:

```typescript
interface Users {
  id: int;                    // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);         // UNIQUE
  organization_id: int;       // FOREIGN KEY -> Organizations(id)
  created_at: datetime;       // DEFAULT CURRENT_TIMESTAMP
}
```

#### 2.4.1 Standard Comment Patterns

- `// PRIMARY KEY` or `// PK` - Primary key constraint
- `// FOREIGN KEY -> Table(column)` or `// FK -> Table(column)` - Foreign key reference
- `// UNIQUE` - Unique constraint
- `// INDEX` - Indexed column
- `// AUTO_INCREMENT` or `// IDENTITY` - Auto-incrementing values
- `// DEFAULT value` - Default value specification

### 2.5 Complex Constraints

Multi-column constraints are documented at the interface level:

```typescript
// UNIQUE(user_id, organization_id)
// INDEX(created_at, status)
interface Memberships {
  id: int;                    // PRIMARY KEY
  user_id: int;               // FK -> Users(id)
  organization_id: int;       // FK -> Organizations(id)
  created_at: datetime;
  status: string(20);
}
```

#### 2.5.1 Composite Primary Keys

Tables without a single surrogate key use a `PK(...)` comment at the interface
level to declare a composite primary key. No column carries an inline
`PRIMARY KEY` marker in this case:

```typescript
// PK(post_id, tag_id)
interface PostTags {
  post_id: int;               // FK -> Posts(id)
  tag_id: int;                // FK -> Tags(id)
  tagged_at: datetime;        // DEFAULT CURRENT_TIMESTAMP
}
```

Column order inside `PK(...)` is **significant**. Databases use the
declared order to build the index that enforces the primary key, and
that order determines which query predicates can use the index
efficiently. `PK(a, b)` and `PK(b, a)` are therefore **not
equivalent** — they describe different physical shapes even when the
logical uniqueness constraint is the same. Generators MUST preserve
the declared order when emitting DDL, and consumers MUST treat the
order as informative about index-friendly predicates.

Mixing an inline `PRIMARY KEY` marker with an interface-level `PK(...)` comment
is invalid — use exactly one form per table.

**Backward Compatibility:**

The inline `// PRIMARY KEY` form for single-column primary keys is
unchanged from v0.7. Only the new multi-column case uses interface-level
`PK(...)`. Schemas written against earlier versions remain valid.

#### 2.5.2 Supported Multi-Column Constraint Patterns

| Pattern | Example | Meaning |
|---------|---------|---------|
| `PK(a, b, ...)` | `// PK(post_id, tag_id)` | Composite primary key |
| `UNIQUE(a, b, ...)` | `// UNIQUE(user_id, org_id)` | Composite unique constraint |
| `INDEX(a, b, ...)` | `// INDEX(created_at, status)` | Composite (multi-column) index |

### 2.6 Vendor-Specific Type Handling

TSSN maintains database-agnosticism by mapping vendor-specific types to semantic equivalents from the core type system. This ensures parsers remain lightweight and implementations stay interoperable across different database systems.

#### 2.6.1 Mapping Principle

When a database-specific type has no direct TSSN equivalent, map it to the closest semantic base type. Use `@format` annotations to preserve additional context when needed.

#### 2.6.2 Common Vendor Type Mappings

| Vendor Type | Database | TSSN Type | Annotation | Rationale |
|-------------|----------|-----------|------------|-----------|
| `XML` | SQL Server, PostgreSQL | `text` | `@format: xml` | Structured text, potentially large |
| `GEOGRAPHY` | SQL Server | `string` | `@format: wkt` | WKT representation is token-efficient |
| `GEOMETRY` | SQL Server, PostGIS | `string` | `@format: wkt` | WKT representation is universal |
| `HSTORE` | PostgreSQL | `json` | — | Key-value maps naturally to JSON |
| `JSONB` | PostgreSQL | `json` | — | Binary JSON is semantically JSON |
| `INTERVAL` | PostgreSQL | `string` | `@format: interval` | ISO 8601 duration format |
| `CIDR`, `INET` | PostgreSQL | `string` | `@format: cidr` | Network addresses as strings |
| `MONEY` | SQL Server | `decimal` | — | Currency is a decimal value |
| `HIERARCHYID` | SQL Server | `string` | `@format: hierarchyid` | Path representation |
| `ROWVERSION` | SQL Server | `blob` | — | Binary timestamp |

#### 2.6.3 Format Annotation Patterns

When mapping to a base type loses semantic information, the `@format` annotation preserves intent:

```typescript
interface GeoData {
  id: int;                    // PRIMARY KEY
  location: string;           // @format: wkt, POINT/POLYGON data
  boundary: string;           // @format: wkt
  metadata: text;             // @format: xml
  ip_range: string;           // @format: cidr
}
```

#### 2.6.4 Implementation Guidance

1. **Generators** SHOULD map vendor types to TSSN base types according to this table
2. **Generators** MAY include `@format` annotations for round-trip fidelity
3. **Parsers** MUST accept any base type regardless of `@format` annotation
4. **Parsers** MAY use `@format` hints for validation or transformation

**Note**: The `@format` annotation is informational. TSSN parsers are not required to validate format compliance—this responsibility lies with the consuming application.

### 2.7 Schema Namespaces

For databases with multiple schemas, use the `@schema` annotation to specify the schema context:

```typescript
// @schema: auth
interface Users {
  id: int;              // PRIMARY KEY
  email: string(255);   // UNIQUE
}

// @schema: billing
interface Invoices {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> auth.Users(id)
  amount: decimal;
}
```

#### 2.7.1 Default Schema Behavior

Tables without an `@schema` annotation are assumed to be in the database's default schema:
- SQL Server: `dbo`
- PostgreSQL: `public`
- MySQL: database name (no separate schema concept)

#### 2.7.2 File-Level Schema Propagation

When `@schema` appears at the top of the input (before any
`interface`, `view`, or `type` declaration) and is not immediately
followed by one of those declarations — for example, when it sits
above intervening type aliases — the annotation becomes the **parse-
unit default schema** and applies to every declaration in the same
parse invocation that does not carry its own `@schema`.

```typescript
// @schema: app

type UserRole = 'admin' | 'member' | 'guest';

interface Users {          // inherits @schema: app
  id: int;
  role: UserRole;
}

// @schema: audit
interface Changes {        // overrides to @schema: audit
  id: int;
  user_id: int;            // FK -> app.Users(id)
}

interface Sessions {       // inherits @schema: app again
  id: int;
  user_id: int;            // FK -> app.Users(id)
}
```

**Rules:**

1. A `@schema` annotation that is NOT immediately adjacent to a
   declaration (i.e., a type alias, interface, or view intervenes)
   becomes the parse-unit default.
2. A `@schema` annotation immediately adjacent to a declaration
   attaches only to that declaration, overriding the parse-unit
   default for that one case.
3. There is exactly one parse-unit default at a time. A later
   top-level `@schema` that is also non-adjacent replaces the
   default; adjacent annotations do not.
4. Schemas without any `@schema` at all fall through to the database's
   default schema per Section 2.7.1.

**Rationale:** Schemas frequently belong to a single namespace and
repeating `// @schema: X` on every interface is wasteful and
error-prone. File-level propagation preserves the token-efficiency
goal of TSSN while keeping the override semantic available when a
declaration genuinely needs a different namespace.

#### 2.7.3 Cross-Schema References

Foreign key references to tables in other schemas use the full path `schema.Table(column)`:

```typescript
// @schema: public
interface Orders {
  id: int;                    // PRIMARY KEY
  user_id: int;               // FK -> auth.Users(id)
  billing_address_id: int;    // FK -> billing.Addresses(id)
}
```

This enables LLMs to generate correct cross-schema JOINs:

```sql
SELECT o.*, u.email
FROM public.orders o
JOIN auth.users u ON o.user_id = u.id
```

### 2.8 Quoted Identifiers

Legacy databases often contain identifiers with spaces, reserved words, or special characters. TSSN uses backtick quoting to represent these "dirty" identifiers, enabling LLMs to generate correctly escaped queries:

```typescript
interface `Order Details` {
  `Order ID`: int;            // PRIMARY KEY
  `Product Name`: string(100);
  `Unit Price`: decimal;
  `Qty Ordered`: int;
}
```

**LLM Query Generation Impact:**

The quoted identifiers signal to the LLM that escaping is required:

```sql
-- SQL Server
SELECT [Order ID], [Product Name] FROM [Order Details]

-- MySQL
SELECT `Order ID`, `Product Name` FROM `Order Details`

-- PostgreSQL
SELECT "Order ID", "Product Name" FROM "Order Details"
```

#### 2.8.1 Escaping Rules

- Backticks wrap identifiers containing spaces, reserved words, or special characters
- Literal backticks within identifiers are escaped by doubling: ``` `` ```
- Standard identifiers (letters, digits, underscores) do not require quoting

#### 2.8.2 When to Use Quoted Identifiers

| Identifier | Requires Quoting | Reason |
|------------|------------------|--------|
| `OrderDetails` | No | Valid identifier |
| `order_details` | No | Valid identifier |
| `Order Details` | Yes | Contains space |
| `Order-Details` | Yes | Contains hyphen |
| `Order` | Maybe | Reserved word (context-dependent) |
| `123Orders` | Yes | Starts with digit |

**Note**: Quoted identifiers indicate a schema design that predates modern naming conventions. While TSSN supports them for compatibility, new schemas should prefer snake_case or PascalCase identifiers.

### 2.9 Views

Views are first-class in TSSN and use the `view` keyword in place of
`interface`. The body syntax is identical — the difference is semantic:

```typescript
view ActiveUsers {
  id: int;                    // PRIMARY KEY
  email: string(255);
  organization_id: int;       // FK -> Organizations(id)
  last_login: datetime;
}
```

**Why Views Need a Dedicated Keyword (informative):**

For an LLM generating read queries, the view/table distinction matters:

1. **Write safety** — views are read-only by default (see 2.9.2); LLMs
   consuming TSSN should not propose `INSERT`/`UPDATE`/`DELETE` against
   them unless the view is explicitly marked `@updatable`
2. **Pre-joined data** — views often already flatten relationships, so
   LLMs should avoid re-JOINing tables the view has already assembled
3. **Performance profile** — regular views re-execute on every query;
   materialized views are cached and may be stale

Without a first-class marker, an LLM sees only an `interface` and cannot
distinguish a base table from a view.

**Backward Compatibility:**

`view` becomes a reserved top-level keyword in v0.8. Schemas written
against earlier versions that used `interface` for what are semantically
views continue to parse without error — the distinction is additive.
Implementations MUST NOT reject v0.7 schemas where `view` appears as a
**column** name (column-name position is unaffected).

#### 2.9.1 Materialized Views

Materialized views are marked with the `@materialized` annotation:

```typescript
// @materialized
view UserStats {
  user_id: int;               // PRIMARY KEY
  total_orders: int;
  lifetime_value: decimal;
  last_order_at?: datetime;
}
```

The LLM can then reason about staleness — for example, preferring a base
table JOIN over a materialized view when freshness is critical.

#### 2.9.2 View-Specific Annotations

| Annotation | Meaning |
|------------|---------|
| `@materialized` | Cached/precomputed view (PostgreSQL `MATERIALIZED VIEW`, Oracle `MATERIALIZED VIEW`) |
| `@readonly` | Explicit restatement of the default read-only semantic; useful for visual clarity |
| `@updatable` | View supports `INSERT`/`UPDATE`/`DELETE`; overrides the default read-only semantic |

**Default writability:** A `view` declaration without any of
`@readonly` / `@updatable` is read-only by default. Implementations
that generate SQL from TSSN MUST NOT emit `INSERT`, `UPDATE`, or
`DELETE` statements against an unmarked view, and SHOULD reject any
request to do so at the type-checking layer. A view only becomes
updatable when the source schema explicitly carries `@updatable`.

#### 2.9.3 Annotation Interaction

The three view annotations are not fully orthogonal. The matrix below
defines which combinations are legal and how parsers MUST classify
each outcome:

| Combination | Materialized | Read-only | Updatable | Status |
|-------------|:-:|:-:|:-:|--------|
| (no annotations)       | ✗ | ✓ | ✗ | Default — legal |
| `@readonly`            | ✗ | ✓ | ✗ | Legal; explicit restatement of default |
| `@updatable`           | ✗ | ✗ | ✓ | Legal; overrides default |
| `@materialized`        | ✓ | ✓ | ✗ | Legal; materialized views are read-only by default |
| `@materialized @readonly` | ✓ | ✓ | ✗ | Legal; redundant but not contradictory |
| `@readonly @updatable` | — | — | — | **Invalid** — direct contradiction |
| `@materialized @updatable` | — | — | — | **Invalid** — materialized views cannot be written to in the general case; the spec rejects this portably even if a specific database permits it |

Implementations MUST reject invalid combinations with a clear error.
The rejection is a semantic check (validator-level), not a grammar
error — each annotation alone is well-formed.

**Example (invalid):**

```typescript
// @materialized
// @updatable
view Cached { id: int; }
// Error: @materialized and @updatable cannot appear on the same view.
```

#### 2.9.4 AST Invariants

Implementations that expose a programmatic AST representation of a
view MUST treat the `readonly` semantic as **derived** from the more
primitive annotation and explicit-annotation signals. Specifically, a
conforming AST representation satisfies the following invariant:

```
readonly  ⟺  readonlyAnnotated  ∨  ¬updatable
```

(where the right-hand side refers to the explicit `@readonly`
annotation state and the explicit `@updatable` annotation state).

Stated operationally: `readonly` is `true` precisely when the view
either carries an explicit `@readonly` annotation, or carries no
`@updatable` annotation (the default read-only semantic from
Section 2.9.2). It is NOT an independent signal.

**Validator behavior on non-conformant ASTs.** A conforming
implementation MAY encounter AST objects that violate this
invariant — for example, objects constructed programmatically by
callers that set the derived field directly without updating the
primitive signals. The specification does **not** prescribe a single
correct behavior in this case. Implementations:

- MAY reject non-conformant ASTs with a diagnostic error
- MAY silently normalize derived fields from primitive signals and
  continue
- MAY emit a warning and continue

Each implementation MUST document which of these it does in its
public documentation (e.g., its README). Consumers that need
cross-implementation interoperability MUST construct ASTs that
already satisfy the invariant — either by using the parser (which
produces conformant ASTs by construction) or by going through an
implementation-provided builder/factory that establishes the
invariant.

**Rationale.** Without this rule, two conforming implementations can
disagree on whether a denormalized AST is "valid": one treats stale
derived fields as contradictions, the other silently normalizes. The
implementation-defined language here intentionally permits both
readings, while requiring that the invariant itself be defined
normatively and that every implementation's choice be documented.
This is the same pattern used by RFC 2119 / RFC 8174 standards when
a trade-off is genuinely irreducible.

#### 2.9.5 Foreign Keys and Views

Views MAY appear as targets in foreign-key-style comments for documentation
purposes, but parsers MUST NOT treat them as enforced foreign keys — the
underlying database has no view-level FK concept:

```typescript
interface Orders {
  id: int;                    // PRIMARY KEY
  user_id: int;               // FK -> ActiveUsers(id)  (view reference, informational)
}
```

### 2.10 Reserved Keywords

TSSN has three **contextual keywords**. They are reserved only at the
top level of a schema, where they introduce a declaration:

| Keyword | Introduces | Section |
|---------|-----------|---------|
| `interface` | A table declaration | 2.1 |
| `view` | A view declaration | 2.9 |
| `type` | A type alias declaration | 2.2.7 |

Because these are **contextual**, they remain valid inside a column
position. The following is a legal v0.8 schema:

```typescript
interface Document {
  id: int;              // PRIMARY KEY
  type: string(50);     // column named "type"
  view: int;            // column named "view"
  interface: boolean;   // column named "interface"
}
```

Parsers MUST classify `interface` / `view` / `type` as a top-level
keyword only when they appear as the first token of a declaration at
file scope, and as a simple identifier in all other positions. Column
names that coincide with contextual keywords require no quoting.

Identifiers that collide with SQL reserved words from a specific
database (`SELECT`, `FROM`, `ORDER`, etc.) are NOT TSSN-reserved.
TSSN parsers accept them as unquoted simple identifiers wherever the
grammar allows. Schema authors who need to generate SQL from TSSN
SHOULD quote such identifiers via the backtick form from Section 2.8
to avoid downstream escaping errors.

## 3. Extended Annotations

### 3.1 Domain-Specific Metadata

TSSN supports domain-specific annotations through structured comments:

```typescript
// @table: users
// @schema: public
// @engine: InnoDB
// @description: User account information
interface Users {
  id: int;              // @generated: auto
  email: string(255);   // @validation: email
  role: string(20);     // @enum: [admin, user, guest]
}
```

### 3.2 Deprecation and Versioning

```typescript
interface LegacyOrders {
  id: int;
  customer_name: string;        // @deprecated: use customer_id
  customer_id?: int;            // FK -> Customers(id), @since: v2.0
}
```

### 3.3 Computed Columns

The `@computed` annotation marks a column as derived (generated, computed, or
virtual) rather than directly stored. An optional expression follows a colon:

```typescript
interface Users {
  id: int;                      // PRIMARY KEY
  first_name: string(50);
  last_name: string(50);
  full_name: string(101);       // @computed: first_name || ' ' || last_name
  email_domain: string(255);    // @computed
  middle_initial?: char(1);
  display_name?: string(101);   // @computed: full name if middle_initial is null
}
```

Nullable computed columns are permitted — the `?` marker applies to
the computed result, typically because the expression can evaluate to
`NULL` when one of its inputs is null. Implementations MUST accept
the combination of `?` and `@computed` on the same column.

**Why This Matters for LLM Query Generation:**

Computed columns have different query characteristics than stored columns:

- They are not guaranteed to be indexed, and many databases leave
  computed columns unindexed by default
- They cannot appear in `INSERT` / `UPDATE` statements
- Referencing them in `WHERE` clauses can force expression
  re-evaluation, bypassing the query planner's index choices

By marking such columns explicitly, LLMs can prefer stored columns in hot
predicates and avoid writing ineffective queries:

```sql
-- LLM sees @computed on email_domain, prefers indexed email column
SELECT * FROM users WHERE email LIKE '%@example.com';
```

**Expression Field:**

The expression after `@computed:` is informational — parsers MUST NOT attempt
to evaluate it as SQL. It exists solely to communicate intent to the LLM.
When the expression is omitted, the column is still flagged as computed but
its derivation is unspecified.

**Database Mapping:**

| Database | Feature |
|----------|---------|
| PostgreSQL | `GENERATED ALWAYS AS (...) STORED` |
| SQL Server | `AS (expression)` (persisted or virtual) |
| MySQL | `GENERATED ALWAYS AS (expression) [VIRTUAL\|STORED]` |
| Oracle | `GENERATED ALWAYS AS (expression) VIRTUAL` |

## 4. Complete Examples

### 4.1 Simple Table

**SQL DDL:**
```sql
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**TSSN:**
```typescript
interface Products {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(200);
  price: decimal;
  description?: text;
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}
```

### 4.2 Complex Schema with Relations

**TSSN:**
```typescript
interface Organizations {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(255);    // UNIQUE
  created_at: datetime;
}

// INDEX(organization_id, role)
interface Users {
  id: int;                    // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);         // UNIQUE
  organization_id: int;       // FK -> Organizations(id)
  role: string(20);           // CHECK IN ('admin', 'member', 'guest')
  last_login?: datetime;
  created_at: datetime;       // DEFAULT CURRENT_TIMESTAMP
}

// UNIQUE(user_id, project_id)
interface ProjectMemberships {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  project_id: int;      // FK -> Projects(id), ON DELETE CASCADE
  permission: string(50);
}
```

## 5. Implementation Guidelines

### 5.1 Conformance Levels

TSSN defines three conformance levels so that implementations can declare
which subset of the specification they support. Every implementation MUST
document its target level in its README or equivalent documentation.

Levels are strictly cumulative: Level 2 implementations MUST support
everything in Level 1, and Level 3 implementations MUST support everything
in Level 2.

#### 5.1.1 Level 1 — Core

The minimum required to claim TSSN support. A Level 1 parser is sufficient
for consuming hand-written schemas in simple environments.

**Required features:**

- `interface` declarations with simple identifiers
- Base types: `int`, `string`, `decimal`, `float`, `number`, `boolean`,
  `datetime`, `date`, `time`, `text`, `char`, `blob`, `uuid`, `json`
- Type length parameters: `string(n)`, `char(n)`
- Nullable columns via `?` suffix
- Inline comments (everything after `//` on a column line, captured as an
  opaque string)
- Standalone comment lines (captured as opaque strings, not parsed)

**Not required:**

- Any structured interpretation of comments (constraints remain raw strings)
- Multi-column constraints
- Any Section 2.5+ feature

#### 5.1.2 Level 2 — Standard

The recommended level for most implementations. A Level 2 parser can drive
LLM query generation for real-world schemas.

**Required features (in addition to Level 1):**

- Structured constraint parsing from inline comments:
  `PRIMARY KEY` / `PK`, `FOREIGN KEY` / `FK -> Table(column)`, `UNIQUE`,
  `INDEX`, `AUTO_INCREMENT` / `IDENTITY`, `DEFAULT value`
- Interface-level multi-column constraints: `PK(...)`, `UNIQUE(...)`,
  `INDEX(...)` (Sections 2.5, 2.5.1, 2.5.2)
- Array type suffix `[]` (Section 2.2.5)
- Literal union types (Section 2.2.6)
- Quoted identifiers using backticks (Section 2.8)
- Cross-schema FK references in the form `schema.Table(column)`
  (Section 2.7.3), parsed as a `(schema, table, column)` triple

#### 5.1.3 Level 3 — Extended

The full specification. Level 3 parsers support the complete v0.8 feature
set and may serve as reference implementations.

**Required features (in addition to Level 2):**

- Type aliases via `type Name = ...` (Section 2.2.7), with alias resolution
  and round-trip preservation of the alias name
- First-class `view` keyword (Section 2.9), distinguished from `interface`
  in the parsed AST
- `@materialized`, `@readonly`, `@updatable` annotations on views
  (Section 2.9.2)
- Domain annotations from Section 3: `@schema`, `@format`, `@enum`,
  `@deprecated`, `@since`, `@description`, `@computed`, `@generated`,
  `@validation`, `@table`, `@engine`

Implementations at Level 3 SHOULD also pass the official conformance test
suite in `tests/conformance/` (see Section 5.4).

#### 5.1.4 Conformance Matrix

| Feature | Section | L1 | L2 | L3 |
|---------|---------|----|----|----|
| `interface` declarations | 2.1 | MUST | MUST | MUST |
| Base types + length | 2.2.1–2.2.4 | MUST | MUST | MUST |
| Nullable `?` | 2.3 | MUST | MUST | MUST |
| Opaque comment capture | 2.4 | MUST | MUST | MUST |
| Structured constraint parsing (PK, FK, UNIQUE, INDEX, AUTO_INCREMENT, DEFAULT) | 2.4.1 | — | MUST | MUST |
| Composite primary keys via `PK(a, b, ...)` | 2.5.1 | — | MUST | MUST |
| Interface-level `UNIQUE(...)` / `INDEX(...)` | 2.5, 2.5.2 | — | MUST | MUST |
| Array types `[]` | 2.2.5 | — | MUST | MUST |
| Literal union types | 2.2.6 | — | MUST | MUST |
| Quoted identifiers (backticks, `` `` `` escape) | 2.8 | — | MUST | MUST |
| Cross-schema FK triples (`schema.Table(col)`) | 2.7.3 | — | MUST | MUST |
| Type aliases (`type X = ...;`) | 2.2.7 | — | — | MUST |
| `view` keyword (distinct from `interface`) | 2.9 | — | — | MUST |
| View annotations (`@materialized`, `@readonly`, `@updatable`) | 2.9.2–2.9.3 | — | — | MUST |
| `@computed` annotation with optional expression | 3.3 | — | — | MUST |
| `@schema` namespace annotation | 2.7, 3.1 | — | — | MUST |
| Other domain annotations (`@format`, `@since`, `@deprecated`, `@description`, `@enum`) | 3.1, 3.2 | — | — | MUST |

### 5.2 Parser Requirements

A compliant TSSN parser at any level MUST:

1. Parse interface declarations with valid TypeScript-style identifiers
2. Recognize the `?` suffix for nullable columns
3. Parse type annotations with optional length parameters
4. Extract inline comments as metadata (opaque at Level 1, structured at
   Level 2+)
5. Handle standalone comment lines inside interfaces as interface-level
   constraints
6. Report errors with line numbers for malformed input
7. Declare its supported conformance level in documentation

### 5.3 Generator Requirements

A compliant TSSN generator SHOULD:

1. Map database-specific types to abstract type categories according to
   Section 2.2
2. Preserve constraint information in comments
3. Order columns by role: primary keys first, followed by data columns,
   then timestamp columns (`created_at`, `updated_at`, `deleted_at`)
4. Include foreign key relationships
5. Omit internal/system columns unless explicitly requested
6. Factor out repeated literal unions as type aliases when targeting
   Level 3 output

### 5.4 Conformance Test Suite

A reference conformance test suite lives in `tests/conformance/` in the
TSSN repository. Each test case consists of:

- A `.tssn` input file
- A `.expected.json` expected output file representing the parsed AST

Tests are grouped by level (`level1/`, `level2/`, `level3/`). An
implementation claims a conformance level by passing every test in that
level's directory and every level below it.

### 5.5 Formatting Conventions

- **Indentation**: 2 spaces
- **Column Alignment**: Align types at column 25 (recommended, not required)
- **Comment Alignment**: Align comments at column 45 (recommended, not required)
- **Blank Lines**: One blank line between interfaces
- **Column Ordering**: Primary keys first, data columns in the middle, timestamp columns (created_at, updated_at) last

Example:
```typescript
interface Users {
  id: int;                    // PRIMARY KEY
  email: string(255);         // UNIQUE
  organization_id: int;       // FK -> Organizations(id)
  created_at: datetime;
  updated_at?: datetime;
}
```

## 6. Performance Characteristics

### 6.1 Token Efficiency Benchmark

Test scenario: 20-column table with typical constraints*

| Format | Approximate Tokens | Reduction |
|--------|-------------------|-----------|
| Verbose JSON | 450 | 0% (baseline) |
| Minified JSON | 300 | 33% |
| **TSSN** | **180** | **60%** |

*Token counts measured using the GPT-4 tokenizer (cl100k_base). Actual reduction varies based on schema complexity, constraint density, and specific tokenizer used.

### 6.2 Readability Metrics

- **Human Comprehension**: Developers familiar with TypeScript can quickly understand TSSN syntax
- **LLM Efficiency**: Language models trained on code efficiently parse interface-style syntax
- **Maintainability**: Changes to schema are clearly visible in diff tools

## 7. Interoperability

### 7.1 JSON Schema Mapping

TSSN can be converted **to** JSON Schema (one-way conversion):

**TSSN:**
```typescript
interface User {
  id: int;              // PRIMARY KEY
  email: string(255);
}
```

**JSON Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": {"type": "integer"},
    "email": {"type": "string", "maxLength": 255}
  },
  "required": ["id", "email"]
}
```

**Note**: Conversion from JSON Schema to TSSN requires additional database-specific metadata (primary keys, foreign keys, indexes) that JSON Schema does not capture.

### 7.2 SQL DDL Generation

TSSN representations can generate SQL DDL with database-specific
adapters. The following TSSN input:

```typescript
// Target: PostgreSQL
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);   // UNIQUE
}
```

…can be mapped by a PostgreSQL adapter to:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL
);
```

The spec does not define the mapping rules — those are an
implementation concern of each adapter — but every valid TSSN
schema has enough information to drive one.

## 8. Use Cases

### 8.1 AI-Assisted Development

- **Context Windows**: Fit more schema information in limited context
- **Code Generation**: LLMs generate more accurate queries with compact schemas
- **Documentation**: Schemas embedded in conversations remain readable

### 8.2 Developer Tools

- **Schema Diffs**: Git-friendly, human-readable schema evolution
- **API Documentation**: Inline schema documentation for REST/GraphQL APIs
- **Migration Planning**: Quick schema overview for database migrations

### 8.3 Data Catalog

- **Schema Registry**: Lightweight schema storage for data catalogs
- **Metadata Management**: Combine schema with business logic annotations
- **Lineage Tracking**: Track schema changes across system boundaries

## 9. Limitations and Considerations

### 9.1 Lossy Compression Model

TSSN employs **semantic compression** - similar to how JPEG preserves visual appearance while discarding pixel-perfect detail, TSSN preserves schema structure while discarding database-specific implementation details.

**What TSSN Preserves:**
- Table and column names
- Data types (semantic level)
- Nullability
- Primary and foreign key relationships
- Unique constraints and indexes
- Basic default values

**What TSSN Discards:**
- Database-specific type parameters (e.g., `DECIMAL(10,2)` becomes `decimal`)
- Storage engines (e.g., `InnoDB`, `MyISAM`)
- Collations and character sets
- Partitioning strategies
- Trigger definitions
- Stored procedure references
- Index types (BTREE, HASH, etc.)
- Exact constraint enforcement mechanisms

This lossy approach is intentional - TSSN prioritizes token efficiency and human readability over bit-perfect database reconstruction.

### 9.2 Not a DDL Replacement

TSSN is a **representation** format, not a **definition** language. It cannot:
- Execute schema changes
- Enforce constraints
- Generate indexes automatically
- Recreate exact DDL statements

### 9.3 Use Case Fit

**TSSN is ideal for:**
- Schema documentation and communication
- LLM context windows
- Understanding database structure
- Code generation guidance
- API documentation

**TSSN is NOT suitable for:**
- Database migration scripts (use proper DDL)
- Exact schema replication
- Production deployment automation
- Compliance documentation requiring exact specifications

### 9.4 Ambiguity Resolution

When mapping from TSSN back to SQL:
- Type length parameters may need database-specific interpretation
- Constraint enforcement depends on target database
- Default values may need translation
- Missing implementation details must be assumed or configured

## 10. Future Extensions

### 10.1 Proposed Features

- **Temporal Tables**: Native syntax for history/versioning
- **Graph Relationships**: First-class support for graph database concepts
- **Soft-delete Semantics**: Standardized `@softdelete` annotation so LLMs
  automatically filter `WHERE deleted_at IS NULL`
- **Row-level Security Hints**: Tenant-scoping and RLS annotations

*Delivered in earlier versions:* multi-schema support (v0.6),
literal unions (v0.7), type aliases and views (v0.8).

### 10.2 Community Contributions

TSSN is designed to be extended by the community. Proposed extensions should maintain:
- Token efficiency
- Backward compatibility
- Clear semantics

## 11. Security Considerations

### 11.1 Threat Model

TSSN is a schema notation, not a programming language. It does not
define an execution model, and a conforming parser does not evaluate
any value embedded in a schema. The realistic threat surface is
therefore concentrated in (a) resource consumption by the parser
itself and (b) the hazard of downstream tools that consume parser
output and emit SQL, documentation, or code.

This section distinguishes three consumption scenarios.
Implementations SHOULD declare which scenarios they support and add
defenses accordingly.

1. **Trusted author.** A developer writes a `.tssn` file describing
   their own database. The author is trusted; the only realistic
   threats are accidental denial-of-service from genuinely large
   schemas and parser crashes that interrupt a build. A reference
   implementation with reasonable default limits is sufficient for
   this scenario.

2. **Semi-trusted generator (e.g. LLM output).** A language model or
   other code generator emits TSSN, which a downstream tool parses
   and uses to generate SQL or documentation. The generator is
   partially trusted: it may hallucinate malformed input or, under
   adversarial prompting, emit deliberately hostile output. Parsers
   used in this scenario MUST impose resource limits (see Section
   11.3) and downstream consumers MUST treat every string field
   sourced from comment text as untrusted input (see Section 11.4).

3. **Anonymous user input.** A web service accepts TSSN from
   unauthenticated users. This is a fully hostile threat model. The
   reference parser is **not designed for this scenario out of the
   box**. Implementations supporting Scenario 3 MUST layer additional
   defenses on top of what this specification requires: hard
   input-size caps enforced before invoking the parser, total-parse-
   time budgets, per-request memory accounting, and output escaping
   for every downstream emitter.

### 11.2 Non-Goals

This specification does NOT:

- Provide a sandbox or isolation boundary. Parsers run in the process
  that calls them.
- Define escaping rules for downstream SQL generation. Escaping is
  the downstream emitter's responsibility.
- Specify a maximum schema size. Section 11.3 gives RECOMMENDED
  defaults; implementations MAY raise or lower them.
- Evaluate, execute, or interpret any expression embedded in a
  comment. `@computed` expressions and `DEFAULT` values are captured
  as opaque strings and MUST NOT be evaluated by a conforming parser
  (see Section 3.3).

### 11.3 Recommended Parser Resource Limits

A conforming parser SHOULD enforce the following limits.
Implementations MAY expose them as configuration but MUST default to
finite values. A parser that accepts arbitrarily large input without
a cap is conforming but unsafe for Scenarios 2 and 3.

| Resource | RECOMMENDED default | Rationale |
|---|---|---|
| Input source length | 1 MiB | A typical real-world schema is <100 KiB. 1 MiB accommodates monorepos. |
| Total tokens | 1,000,000 | Defeats billion-token empty-interface attacks. |
| Total top-level declarations | 10,000 | Sanity ceiling; reachable only by generated input. |
| Identifier length (unquoted) | 1,024 chars | Real identifiers are <64 chars. |
| Identifier length (backtick-quoted) | 4,096 chars | Accommodates legitimate long quoted names. |
| String literal length | 64 KiB | Defeats multi-MB literal unions. |
| Literals per union | 1,024 | Real enums are <100 items. |
| Line comment length | 8 KiB | Prevents comment-based memory amplification. |
| Columns per declaration | 4,096 | SQL databases typically cap below this. |

Parsers that exceed any limit MUST report a parse error and stop.
Parsers MUST NOT truncate silently, because truncation produces an
AST that does not match the input source and can confuse downstream
consumers.

### 11.4 Downstream Forwarding Hazards

The TSSN AST preserves several string fields verbatim from source
comment text so that downstream tools can implement vendor-specific
behavior. These fields are **untrusted input** from the parser's
perspective: they contain whatever the schema author wrote, with no
validation beyond what the parser's regexes enforce. Any downstream
consumer that interpolates these fields into SQL, shell commands,
URLs, HTML, or any other target language MUST apply appropriate
escaping or quoting.

Fields carrying untrusted string content:

- `Column.rawComment` — the entire column trailing comment, verbatim.
- `Constraint.raw` (all constraint kinds) — the matched constraint
  substring.
- `DefaultConstraint.value` — captured up to the next comma or end of
  comment.
- `ComputedConstraint.expression` — captured to end of comment;
  frequently free-form SQL.
- `ForeignKeyConstraint.table` / `.column` / `.schema` — captured as
  ASCII word characters only, so these three fields cannot themselves
  contain quotes or semicolons, but downstream consumers MUST still
  quote them as SQL identifiers.
- `ForeignKeyConstraint.tail` — the `ON DELETE` / `ON UPDATE` clause,
  verbatim.
- `Annotation.raw` / `Annotation.value` — the annotation key's
  right-hand side, verbatim.
- `TableDecl.leadingComments` / `ViewDecl.leadingComments` — arbitrary
  free-text comments.

Downstream implementers MUST:

1. Never interpolate these fields directly into SQL. Use parameterized
   queries where values are involved; use the database driver's
   identifier-quoting function for `table` / `column` / `schema`.
2. Never `eval`, compile, or otherwise execute
   `ComputedConstraint.expression`. The spec forbids parsers from
   doing so (Section 3.3); this prohibition extends to downstream
   consumers that receive it from the AST.
3. Treat annotation values as opaque labels. Do not route annotation
   values into filesystem paths, URLs, or any other context where
   special characters are consequential without escaping.

### 11.5 Parser Implementation Hazards

Implementers of alternative parsers SHOULD verify the following
properties in their own implementation:

- **Linear lex time.** The reference lexer is character-at-a-time
  with no backtracking and is O(n) in source length. Alternative
  implementations using regex engines MUST audit each pattern for
  catastrophic backtracking (nested quantifiers, alternation with
  shared prefixes, ambiguous repetition). The reference parser's
  constraint and annotation regexes have been reviewed and are linear
  on all inputs.
- **Linear union parsing.** Union types parse via a simple loop over
  pipe separators. Implementations MUST NOT use a recursive
  `union -> literal | literal '|' union` production without tail-call
  elimination.
- **No recursive type expressions.** The grammar forbids nested
  arrays (`T[][]`), and type aliases MUST NOT reference other aliases.
  These restrictions ensure type-expression walking is bounded in
  depth by input width, not by a separate nesting budget.
  Implementations MUST enforce both restrictions at parse time.
- **Defensive cycle protection in validators.** Validators that walk
  type expressions MUST either (a) not descend into
  `AliasType.resolved`, since the referent was already validated at
  its declaration site, or (b) carry a visited set. Naive recursion
  into `resolved` would expose the validator to an infinite loop if
  alias-to-alias references ever slipped past the parser.
- **Recovery must make progress.** Error-recovery routines that scan
  forward to a resynchronization token MUST consume at least one
  token unconditionally before scanning, or they risk infinite loops
  when the current token is itself the resync target.
- **Control characters and non-UTF-8 input.** Parsers MUST reject
  unrecognized bytes (including NUL, DEL, most C0 control codes) as
  lex errors. Implementations that consume raw bytes rather than
  decoded strings MUST either validate UTF-8 up front or reject
  non-ASCII bytes in the lexer.

### 11.6 Error Message Content

Parser error messages produced by a conforming implementation SHOULD:

- Include source line and column numbers.
- Include the offending token's value where helpful for diagnosis,
  subject to log-hygiene policy in the deployment.
- NOT include internal file paths, stack traces, or language-runtime
  diagnostics. Error messages are user-facing text, not debugging
  output.

Implementations used in multi-tenant settings SHOULD be aware that
error messages may echo input content (quoted identifier names,
column names, literal values) into logs. Operators who consider
schema content sensitive SHOULD redact or filter parser errors before
logging.

### 11.7 Dependencies

The reference parser has zero runtime dependencies. Alternative
implementations SHOULD minimize runtime dependency surface. A parser
written against a large dependency graph inherits the security
posture of that graph; a zero-dependency parser can be audited in
its entirety.

### 11.8 Pre-1.0 Open Items

The following items MUST be addressed before TSSN leaves draft
status:

- **Fuzzing campaign.** Run a structure-aware fuzzer against the
  reference parser for a minimum of 24 CPU-hours with no crash,
  hang, or OOM outside the declared limits.
- **Resource-limit conformance tests.** The conformance suite MUST
  include inputs at each limit boundary (one below, one at, one
  above) verifying the parser behaves as specified.
- **Downstream escaping examples.** The spec MUST include at least
  one worked example showing a downstream SQL generator correctly
  escaping each hazardous field from Section 11.4.
- **Security-disclosure process.** The TSSN project SHOULD publish a
  SECURITY.md with a disclosure contact before 1.0.

## 12. References

- TypeScript Interface Syntax: [https://www.typescriptlang.org/](https://www.typescriptlang.org/)
- JSON Schema Specification: [https://json-schema.org/](https://json-schema.org/)
- SQL:2016 Standard (ISO/IEC 9075)
- RFC 2119 — Key words for use in RFCs: [https://www.rfc-editor.org/rfc/rfc2119](https://www.rfc-editor.org/rfc/rfc2119)
- RFC 8174 — Ambiguity of uppercase vs lowercase in RFC 2119 key words: [https://www.rfc-editor.org/rfc/rfc8174](https://www.rfc-editor.org/rfc/rfc8174)

## Appendix A: Grammar (EBNF-style)

```ebnf
schema          = ws ( type_alias | interface_decl | view_decl | comment )*
type_alias      = ws "type" ws simple_id ws "=" ws type_expr ws ";" ws
interface_decl  = ws comment* "interface" ws identifier ws "{" ws body "}"
view_decl       = ws comment* "view" ws identifier ws "{" ws body "}"
body            = ( column | comment | ws )*
column          = ws identifier nullable? ws ":" ws type_expr ws ";" comment? newline
nullable        = "?"
type_expr       = union_type | simple_type | alias_ref
union_type      = literal ( ws "|" ws literal )+
literal         = string_lit | number_lit
string_lit      = "'" ( char_no_sq )* "'"
number_lit      = "-"? digits
simple_type     = base_type ( "(" digits ")" )? array?
alias_ref       = simple_id                     (* PascalCase identifier previously declared *)
array           = "[]"
base_type       = identifier
comment         = "//" char* newline
identifier      = simple_id | quoted_id
simple_id       = ( letter | "_" ) ( letter | digit | "_" )*
quoted_id       = "`" ( char_no_bt | "``" )* "`"
char_no_bt      = (* any character except backtick *)
char_no_sq      = (* any character except single quote *)
letter          = "A" | "B" | ... | "Z" | "a" | "b" | ... | "z"
digit           = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
digits          = digit+
char            = (* any character except newline *)
ws              = ( " " | "\t" | newline )*
newline         = "\n" | "\r\n" | "\r"
```

**Resolution rules for `alias_ref`:**
- An `alias_ref` matches a `simple_id` only if a `type_alias` with the same
  name was declared earlier in the schema. Otherwise the identifier is
  interpreted as a `base_type` in `simple_type`.
- `type_alias` declarations MUST appear before any `interface_decl` or
  `view_decl` that references them.
- A `type_alias` RHS MUST NOT itself contain an `alias_ref` (no transitive
  aliasing).

**Key additions in v0.8.0:**
- `type_alias` production: Reusable literal unions and sized types
- `view_decl` production: First-class view declarations (distinct AST node
  from `interface_decl`)
- `alias_ref` production in `type_expr`: References to previously declared
  type aliases
- `schema` now admits top-level aliases, views, and comments in any order
- `simple_id` now permits leading underscore so that identifiers such as
  `_internal` or `_created_at` — common in real database schemas — are
  accepted without requiring backtick quoting

**Key additions in v0.7.0:**
- `union_type` production: Literal unions like `'a' | 'b' | 'c'` or `1 | 2 | 3`
- `literal` production: String literals (single-quoted) or numeric literals
- `type_expr` now branches between union types and simple types

**Key additions in v0.6.0:**
- `array` production: The `[]` suffix for array types
- `quoted_id` production: Backtick-quoted identifiers for legacy schemas with spaces/special characters
- `"``"` escapes a literal backtick within quoted identifiers

**Note**: This grammar is intentionally simplified for clarity. A production parser should handle additional cases like multi-line comments, Unicode identifiers, and edge cases in whitespace handling.

## Appendix B: Type Conversion Table

### SQL Server → TSSN
| SQL Server | TSSN |
|------------|------|
| INT, BIGINT, SMALLINT | int |
| VARCHAR, NVARCHAR | string |
| DATETIME, DATETIME2 | datetime |
| BIT | boolean |
| DECIMAL, MONEY | decimal |
| VARBINARY, IMAGE | blob |

### PostgreSQL → TSSN
| PostgreSQL | TSSN |
|------------|------|
| INTEGER, BIGINT | int |
| VARCHAR, TEXT | string |
| TIMESTAMP | datetime |
| BOOLEAN | boolean |
| NUMERIC | decimal |
| BYTEA | blob |
| UUID | uuid |
| TEXT[] | string[] |
| INTEGER[] | int[] |
| JSONB[] | json[] |

### MySQL → TSSN
| MySQL | TSSN |
|--------|------|
| INT, BIGINT | int |
| VARCHAR, TEXT | string |
| DATETIME | datetime |
| TINYINT(1) | boolean |
| DECIMAL | decimal |
| BLOB | blob |

## Appendix C: License

```
MIT License

Copyright (c) 2025 Benjamin Zimmer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

**For the latest version of this specification, see:**
[https://github.com/nemekath/TSSN](https://github.com/nemekath/TSSN)
