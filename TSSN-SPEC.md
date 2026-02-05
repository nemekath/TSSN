# TypeScript-Style Schema Notation (TSSN)

**Version:** 0.7.0
**Status:** Draft Specification
**Date:** 2025-11-26
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
  column_name: DataType;
  nullable_column?: DataType;
  // Comments for metadata
}
```

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

### 2.6 Vendor-Specific Type Handling

TSSN maintains database-agnosticism by mapping vendor-specific types to semantic equivalents from the core type system. This ensures parsers remain lightweight and implementations stay interoperable across different database systems.

#### 2.6.1 Mapping Principle

When a database-specific type has no direct TSSN equivalent, map it to the closest semantic base type. Use `@format` annotations to preserve additional context when needed.

#### 2.6.2 Common Vendor Type Mappings

| Vendor Type | Database | TSSN Type | Annotation | Rationale |
|-------------|----------|-----------|------------|-----------|
| `XML` | SQL Server, PostgreSQL | `text` | `@format: xml` | Structured text, potentially large |
| `GEOGRAPHY` | SQL Server, MySQL | `string` | `@format: wkt` | WKT representation is token-efficient |
| `GEOMETRY` | SQL Server, PostGIS, MySQL | `string` | `@format: wkt` | WKT representation is universal |
| `HSTORE` | PostgreSQL | `json` | — | Key-value maps naturally to JSON |
| `JSONB` | PostgreSQL | `json` | — | Binary JSON is semantically JSON |
| `INTERVAL` | PostgreSQL, Oracle | `string` | `@format: interval` | ISO 8601 duration format |
| `CIDR`, `INET` | PostgreSQL | `string` | `@format: cidr` | Network addresses as strings |
| `MACADDR` | PostgreSQL | `string` | `@format: mac` | MAC address as string |
| `MONEY` | SQL Server, PostgreSQL | `decimal` | — | Currency is a decimal value |
| `HIERARCHYID` | SQL Server | `string` | `@format: hierarchyid` | Path representation |
| `ROWVERSION` | SQL Server | `blob` | — | Binary timestamp |
| `DATETIMEOFFSET` | SQL Server | `datetime` | `@format: tz` | Datetime with timezone offset |
| `TIMESTAMPTZ` | PostgreSQL | `datetime` | `@format: tz` | Timezone-aware timestamp |
| `TSVECTOR` | PostgreSQL | `string` | `@format: tsvector` | Full-text search lexemes |
| `TSQUERY` | PostgreSQL | `string` | `@format: tsquery` | Full-text search query |
| `SQL_VARIANT` | SQL Server | `string` | — | Polymorphic storage |
| `BIT(n)`, `VARBIT(n)` | PostgreSQL | `string` | `@format: bits` | Bit string representation |

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

#### 2.7.2 Cross-Schema References

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

### 5.1 Parser Requirements

A compliant TSSN parser MUST:

1. Parse interface declarations with valid TypeScript-style identifiers
2. Recognize `?` suffix for nullable columns
3. Parse type annotations with optional length parameters
4. Extract inline comments as metadata
5. Handle multi-line comments for interface-level constraints

### 5.2 Generator Requirements

A compliant TSSN generator SHOULD:

1. Map database-specific types to abstract type categories according to Section 2.2
2. Preserve constraint information in comments
3. Order columns by role: primary keys first, followed by data columns, then timestamp columns (created_at, updated_at)
4. Include foreign key relationships
5. Omit internal/system columns unless explicitly requested

### 5.3 Formatting Conventions

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

TSSN representations can generate SQL DDL with database-specific adapters:

```typescript
// Target: PostgreSQL
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);   // UNIQUE
}

// Generated DDL:
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL
);
```

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

- **Multi-schema Support**: Explicit schema prefixes
- **View Definitions**: Represent views alongside tables
- **Temporal Tables**: Native syntax for history/versioning
- **Graph Relationships**: First-class support for graph database concepts

### 10.2 Community Contributions

TSSN is designed to be extended by the community. Proposed extensions should maintain:
- Token efficiency
- Backward compatibility
- Clear semantics

## 11. References

- TypeScript Interface Syntax: [https://www.typescriptlang.org/](https://www.typescriptlang.org/)
- JSON Schema Specification: [https://json-schema.org/](https://json-schema.org/)
- SQL:2016 Standard (ISO/IEC 9075)

## Appendix A: Grammar (EBNF-style)

```ebnf
schema          = interface+
interface       = ws comment* "interface" ws identifier ws "{" ws column* ws "}"
column          = ws identifier nullable? ws ":" ws type_expr ws ";" comment? newline
nullable        = "?"
type_expr       = union_type | simple_type
union_type      = literal ( ws "|" ws literal )+
literal         = string_lit | number_lit
string_lit      = "'" ( char_no_sq )* "'"
number_lit      = "-"? digits
simple_type     = base_type ( "(" digits ")" )? array?
array           = "[]"
base_type       = identifier
comment         = "//" char* newline
identifier      = simple_id | quoted_id
simple_id       = letter ( letter | digit | "_" )*
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

#### Numeric Types
| SQL Server | TSSN | Notes |
|------------|------|-------|
| `TINYINT` | `int` | 0 to 255 (unsigned) |
| `SMALLINT` | `int` | -32,768 to 32,767 |
| `INT` | `int` | -2^31 to 2^31-1 |
| `BIGINT` | `int` | -2^63 to 2^63-1 |
| `DECIMAL(p,s)`, `NUMERIC(p,s)` | `decimal` | Precision/scale discarded (lossy) |
| `MONEY` | `decimal` | -922 trillion to 922 trillion |
| `SMALLMONEY` | `decimal` | -214,748 to 214,748 |
| `FLOAT` | `float` | Double-precision (8 bytes) |
| `REAL` | `float` | Single-precision (4 bytes) |

#### String Types
| SQL Server | TSSN | Notes |
|------------|------|-------|
| `CHAR(n)` | `char(n)` | Fixed-length, non-Unicode |
| `NCHAR(n)` | `char(n)` | Fixed-length, Unicode |
| `VARCHAR(n)` | `string(n)` | Variable-length, non-Unicode |
| `NVARCHAR(n)` | `string(n)` | Variable-length, Unicode |
| `VARCHAR(MAX)` | `text` | Up to 2 GB |
| `NVARCHAR(MAX)` | `text` | Up to 2 GB, Unicode |
| `TEXT` | `text` | Deprecated, use VARCHAR(MAX) |
| `NTEXT` | `text` | Deprecated, use NVARCHAR(MAX) |

#### Temporal Types
| SQL Server | TSSN | Notes |
|------------|------|-------|
| `DATE` | `date` | Date only |
| `TIME` | `time` | Time only, up to 100ns precision |
| `DATETIME` | `datetime` | 1753-01-01 to 9999-12-31 |
| `DATETIME2` | `datetime` | Higher precision than DATETIME |
| `SMALLDATETIME` | `datetime` | Minute precision |
| `DATETIMEOFFSET` | `datetime` | `@format: tz` — includes timezone offset |

#### Other Types
| SQL Server | TSSN | Notes |
|------------|------|-------|
| `BIT` | `boolean` | 0, 1, or NULL |
| `UNIQUEIDENTIFIER` | `uuid` | 16-byte GUID |
| `VARBINARY(n)` | `blob` | Variable-length binary |
| `VARBINARY(MAX)` | `blob` | Up to 2 GB binary |
| `BINARY(n)` | `blob` | Fixed-length binary |
| `IMAGE` | `blob` | Deprecated, use VARBINARY(MAX) |
| `JSON` | `json` | SQL Server 2025+, native JSON |
| `XML` | `text` | `@format: xml` |
| `SQL_VARIANT` | `string` | Stores various data types |
| `GEOGRAPHY` | `string` | `@format: wkt` |
| `GEOMETRY` | `string` | `@format: wkt` |
| `HIERARCHYID` | `string` | `@format: hierarchyid` |
| `ROWVERSION` / `TIMESTAMP` | `blob` | Auto-generated binary(8) |

### PostgreSQL → TSSN

#### Numeric Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `SMALLINT` / `INT2` | `int` | 2 bytes |
| `INTEGER` / `INT4` | `int` | 4 bytes |
| `BIGINT` / `INT8` | `int` | 8 bytes |
| `SERIAL` | `int` | Auto-incrementing 4-byte; use `// AUTO_INCREMENT` |
| `SMALLSERIAL` | `int` | Auto-incrementing 2-byte |
| `BIGSERIAL` | `int` | Auto-incrementing 8-byte |
| `NUMERIC(p,s)` / `DECIMAL(p,s)` | `decimal` | Precision/scale discarded (lossy) |
| `MONEY` | `decimal` | Locale-formatted currency |
| `REAL` / `FLOAT4` | `float` | Single-precision |
| `DOUBLE PRECISION` / `FLOAT8` | `float` | Double-precision |

#### String Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `CHARACTER(n)` / `CHAR(n)` | `char(n)` | Fixed-length |
| `CHARACTER VARYING(n)` / `VARCHAR(n)` | `string(n)` | Variable-length with limit |
| `VARCHAR` (no length) | `string` | Unlimited variable-length |
| `TEXT` | `text` | Unlimited variable-length |

#### Temporal Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `DATE` | `date` | Date only |
| `TIME` | `time` | Time without timezone |
| `TIME WITH TIME ZONE` / `TIMETZ` | `time` | `@format: tz` |
| `TIMESTAMP` | `datetime` | Timestamp without timezone |
| `TIMESTAMP WITH TIME ZONE` / `TIMESTAMPTZ` | `datetime` | `@format: tz` — most common in production |
| `INTERVAL` | `string` | `@format: interval` — ISO 8601 duration |

#### Other Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `BOOLEAN` | `boolean` | true/false |
| `BYTEA` | `blob` | Binary data |
| `UUID` | `uuid` | 128-bit identifier |
| `JSON` | `json` | Text JSON |
| `JSONB` | `json` | Binary JSON (semantically identical) |
| `XML` | `text` | `@format: xml` |
| `HSTORE` | `json` | Key-value store maps to JSON |

#### Array Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `TEXT[]` | `string[]` | Array of strings |
| `INTEGER[]` | `int[]` | Array of integers |
| `JSONB[]` | `json[]` | Array of JSON objects |
| `<any_type>[]` | `<mapped_type>[]` | Any type can be an array |

#### Full-Text Search Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `TSVECTOR` | `string` | `@format: tsvector` — use `@@` operator, not `LIKE` |
| `TSQUERY` | `string` | `@format: tsquery` — search query representation |

#### Network Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `CIDR` | `string` | `@format: cidr` — IPv4/IPv6 network |
| `INET` | `string` | `@format: cidr` — IPv4/IPv6 host |
| `MACADDR` | `string` | `@format: mac` — MAC address |
| `MACADDR8` | `string` | `@format: mac` — EUI-64 MAC address |

#### Bit String Types
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `BIT(n)` | `string` | `@format: bits` — fixed-length bit string |
| `BIT VARYING(n)` / `VARBIT(n)` | `string` | `@format: bits` — variable-length bit string |

#### Geometric Types (Native)
| PostgreSQL | TSSN | Notes |
|------------|------|-------|
| `POINT` | `string` | `@format: wkt` |
| `LINE` | `string` | `@format: wkt` |
| `LSEG` | `string` | `@format: wkt` |
| `BOX` | `string` | `@format: wkt` |
| `PATH` | `string` | `@format: wkt` |
| `POLYGON` | `string` | `@format: wkt` |
| `CIRCLE` | `string` | `@format: wkt` |

#### PostGIS Types
| PostgreSQL + PostGIS | TSSN | Notes |
|----------------------|------|-------|
| `GEOMETRY` | `string` | `@format: wkt` |
| `GEOGRAPHY` | `string` | `@format: wkt` |

#### Enum Types

PostgreSQL enums (`CREATE TYPE status AS ENUM ('a','b','c')`) should be mapped to literal union types:

```typescript
status: 'a' | 'b' | 'c';
```

Generators SHOULD look up enum values and emit union types for columns using enum types.

### MySQL → TSSN

#### Numeric Types
| MySQL | TSSN | Notes |
|-------|------|-------|
| `TINYINT` | `int` | 1 byte (-128 to 127) |
| `TINYINT(1)` | `boolean` | Special case: display width 1 → boolean |
| `SMALLINT` | `int` | 2 bytes |
| `MEDIUMINT` | `int` | 3 bytes (MySQL-specific) |
| `INT` / `INTEGER` | `int` | 4 bytes |
| `BIGINT` | `int` | 8 bytes |
| `DECIMAL(p,s)` / `NUMERIC(p,s)` | `decimal` | Precision/scale discarded (lossy) |
| `FLOAT` | `float` | Single-precision |
| `DOUBLE` / `DOUBLE PRECISION` | `float` | Double-precision |
| `REAL` | `float` | Synonym for DOUBLE (default) |

#### String Types
| MySQL | TSSN | Notes |
|-------|------|-------|
| `CHAR(n)` | `char(n)` | Fixed-length, up to 255 |
| `VARCHAR(n)` | `string(n)` | Variable-length, up to 65,535 |
| `TINYTEXT` | `text` | Up to 255 bytes |
| `TEXT` | `text` | Up to 64 KB |
| `MEDIUMTEXT` | `text` | Up to 16 MB |
| `LONGTEXT` | `text` | Up to 4 GB |

#### Binary Types
| MySQL | TSSN | Notes |
|-------|------|-------|
| `BINARY(n)` | `blob` | Fixed-length binary |
| `VARBINARY(n)` | `blob` | Variable-length binary |
| `TINYBLOB` | `blob` | Up to 255 bytes |
| `BLOB` | `blob` | Up to 64 KB |
| `MEDIUMBLOB` | `blob` | Up to 16 MB |
| `LONGBLOB` | `blob` | Up to 4 GB |

#### Temporal Types
| MySQL | TSSN | Notes |
|-------|------|-------|
| `DATE` | `date` | Date only |
| `TIME` | `time` | Time only |
| `DATETIME` | `datetime` | Date and time (literal value) |
| `TIMESTAMP` | `datetime` | Stored as UTC, auto-converts to session timezone |
| `YEAR` | `int` | 4-digit year (1901-2155) |

#### Other Types
| MySQL | TSSN | Notes |
|-------|------|-------|
| `JSON` | `json` | Native JSON (MySQL 5.7.8+) |
| `BIT(n)` | `string` | `@format: bits` — bit-field (1-64 bits) |

#### Spatial Types
| MySQL | TSSN | Notes |
|-------|------|-------|
| `GEOMETRY` | `string` | `@format: wkt` |
| `POINT` | `string` | `@format: wkt` |
| `LINESTRING` | `string` | `@format: wkt` |
| `POLYGON` | `string` | `@format: wkt` |
| `MULTIPOINT` | `string` | `@format: wkt` |
| `MULTILINESTRING` | `string` | `@format: wkt` |
| `MULTIPOLYGON` | `string` | `@format: wkt` |
| `GEOMETRYCOLLECTION` | `string` | `@format: wkt` |

#### Enum and Set Types

MySQL `ENUM('a','b','c')` should be mapped to literal union types:

```typescript
status: 'a' | 'b' | 'c';
```

MySQL `SET('a','b','c')` allows multiple values. Map to `string` with a comment indicating the allowed values:

```typescript
features: string;   // SET: 'wifi', 'pool', 'parking'
```

Generators SHOULD look up ENUM values and emit union types. SET columns should use `string` as they store comma-separated values.

### Oracle → TSSN

**Important:** Oracle's `DATE` type includes time components (hour, minute, second), unlike the SQL standard `DATE`. It MUST be mapped to `datetime`, not `date`.

#### Numeric Types
| Oracle | TSSN | Notes |
|--------|------|-------|
| `NUMBER` (no precision) | `number` | Generic numeric |
| `NUMBER(n)` (scale=0) | `int` | Integer (precision only, no decimals) |
| `NUMBER(p,s)` (scale>0) | `decimal` | Fixed-point decimal |
| `BINARY_FLOAT` | `float` | 32-bit IEEE 754 |
| `BINARY_DOUBLE` | `float` | 64-bit IEEE 754 |

#### String Types
| Oracle | TSSN | Notes |
|--------|------|-------|
| `VARCHAR2(n)` | `string(n)` | Oracle's standard variable-length (NOT `VARCHAR`) |
| `NVARCHAR2(n)` | `string(n)` | Unicode variable-length |
| `CHAR(n)` | `char(n)` | Fixed-length |
| `NCHAR(n)` | `char(n)` | Unicode fixed-length |
| `CLOB` | `text` | Character LOB, up to 128 TB |
| `NCLOB` | `text` | Unicode CLOB |
| `LONG` | `text` | Deprecated, use CLOB |

#### Temporal Types
| Oracle | TSSN | Notes |
|--------|------|-------|
| `DATE` | `datetime` | **Includes time!** Unlike SQL standard DATE |
| `TIMESTAMP` | `datetime` | Fractional seconds precision |
| `TIMESTAMP WITH TIME ZONE` | `datetime` | `@format: tz` — includes timezone |
| `TIMESTAMP WITH LOCAL TIME ZONE` | `datetime` | `@format: tz` — session timezone conversion |
| `INTERVAL YEAR TO MONTH` | `string` | `@format: interval` |
| `INTERVAL DAY TO SECOND` | `string` | `@format: interval` |

#### Other Types
| Oracle | TSSN | Notes |
|--------|------|-------|
| `BOOLEAN` | `boolean` | Oracle 23ai+ (previously PL/SQL only) |
| `RAW(n)` | `blob` | Variable-length binary, up to 32 KB |
| `LONG RAW` | `blob` | Deprecated, use BLOB |
| `BLOB` | `blob` | Binary LOB, up to 128 TB |
| `BFILE` | `blob` | Pointer to external OS file |
| `JSON` | `json` | Oracle 23ai+, native binary JSON |
| `XMLTYPE` | `text` | `@format: xml` — native XML with methods |
| `ROWID` | `string` | Physical row address |
| `UROWID` | `string` | Universal ROWID |

#### Spatial Types (Oracle Spatial)
| Oracle | TSSN | Notes |
|--------|------|-------|
| `SDO_GEOMETRY` | `string` | `@format: wkt` |

### SQLite → TSSN

SQLite uses a **type affinity** system rather than strict types. Any type name is accepted in a column declaration, but SQLite maps it to one of 5 storage classes: `NULL`, `INTEGER`, `REAL`, `TEXT`, `BLOB`.

**Important:** SQLite does NOT enforce type constraints. A `VARCHAR(255)` column can hold any value of any length. TSSN generators working with SQLite should be aware of this.

#### Storage Class Mapping
| SQLite Storage Class | TSSN | Notes |
|---------------------|------|-------|
| `INTEGER` | `int` | 1-8 bytes, signed |
| `REAL` | `float` | 8-byte IEEE floating point |
| `TEXT` | `text` | UTF-8/UTF-16 string |
| `BLOB` | `blob` | Raw binary data |

#### Common Declared Types → TSSN
| SQLite Declared Type | Affinity | TSSN | Notes |
|---------------------|----------|------|-------|
| `INT`, `INTEGER` | INTEGER | `int` | `INTEGER PRIMARY KEY` auto-increments |
| `REAL`, `FLOAT`, `DOUBLE` | REAL | `float` | |
| `TEXT`, `CLOB` | TEXT | `text` | |
| `BLOB` | BLOB | `blob` | |
| `VARCHAR(n)` | TEXT | `string(n)` | Length NOT enforced |
| `CHAR(n)` | TEXT | `char(n)` | Length NOT enforced |
| `BOOLEAN` | NUMERIC | `boolean` | Stored as INTEGER 0/1 |
| `DATE` | NUMERIC | `date` | Stored as TEXT (ISO 8601), REAL (Julian), or INTEGER (Unix) |
| `DATETIME`, `TIMESTAMP` | NUMERIC | `datetime` | Same storage options as DATE |
| `DECIMAL` | NUMERIC | `decimal` | Stored as INTEGER or REAL, not fixed-point |
| `JSON` | TEXT | `json` | JSON functions available since 3.9.0 |

#### SQLite-Specific Considerations

1. **Auto-increment:** `INTEGER PRIMARY KEY` auto-increments implicitly. The `AUTOINCREMENT` keyword changes the algorithm but is rarely needed.
2. **Foreign keys:** Supported but OFF by default. Require `PRAGMA foreign_keys = ON`.
3. **STRICT tables (3.37.0+):** Enforce declared types. Only allow: `INT`, `INTEGER`, `REAL`, `TEXT`, `BLOB`, `ANY`.
4. **Type affinity trap:** The declared type name `STRING` gets NUMERIC affinity (not TEXT), because it doesn't match SQLite's TEXT-affinity patterns.

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
