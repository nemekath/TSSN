# LLM INterface for Database Tables (LINDT)

## Status of This Document

| Field | Value |
|-------|-------|
| **Version** | 0.7.0 |
| **Status** | Draft Specification |
| **Date** | 2025-11-26 |
| **Authors** | Benjamin Zimmer |
| **License** | MIT |
| **Repository** | [github.com/nemekath/LINDT](https://github.com/nemekath/LINDT) |

This is a **draft** specification. It is subject to change based on community feedback and implementation experience. Features marked as "Draft" in the Feature Status table may be modified without notice.

### Feature Status

| Feature | Section | Since | Status |
|---------|---------|-------|--------|
| Core syntax (interface, types) | 2.1--2.4 | v0.5.0 | Stable |
| Multi-column constraints | 2.5 | v0.5.0 | Stable |
| Vendor-specific type handling | 2.6 | v0.6.0 | Stable |
| Schema namespaces | 2.7 | v0.6.0 | Stable |
| Quoted identifiers | 2.8 | v0.6.0 | Stable |
| Array types | 2.2.5 | v0.6.0 | Stable |
| Literal union types | 2.2.6 | v0.7.0 | Draft |
| Domain annotations | 3 | v0.5.0 | Stable |

**Status definitions:** **Stable** -- unlikely to change; implementations can rely on this. **Draft** -- may change based on implementation feedback. **Experimental** -- subject to removal; not recommended for production parsers.

## Table of Contents

- [1. Introduction](#1-introduction)
  - [1.1 Motivation](#11-motivation)
  - [1.2 Design Goals](#12-design-goals)
  - [1.3 Scope](#13-scope)
  - [1.4 Notation Conventions](#14-notation-conventions)
- [2. Syntax Specification](#2-syntax-specification)
  - [2.1 Core Structure](#21-core-structure)
  - [2.2 Data Type Mapping](#22-data-type-mapping)
  - [2.3 Nullability](#23-nullability)
  - [2.4 Constraints and Metadata](#24-constraints-and-metadata)
  - [2.5 Complex Constraints](#25-complex-constraints)
  - [2.6 Vendor-Specific Type Handling](#26-vendor-specific-type-handling)
  - [2.7 Schema Namespaces](#27-schema-namespaces)
  - [2.8 Quoted Identifiers](#28-quoted-identifiers)
- [3. Extended Annotations](#3-extended-annotations)
- [4. Complete Examples](#4-complete-examples)
- [5. Implementation Guidelines](#5-implementation-guidelines)
  - [5.1 Parser Requirements](#51-parser-requirements)
  - [5.2 Generator Requirements](#52-generator-requirements)
  - [5.3 Formatting Conventions](#53-formatting-conventions)
  - [5.4 Conformance Levels](#54-conformance-levels)
- [6. Performance Characteristics](#6-performance-characteristics)
- [7. Interoperability](#7-interoperability)
- [8. Use Cases](#8-use-cases)
- [9. Limitations and Considerations](#9-limitations-and-considerations)
- [10. Future Extensions](#10-future-extensions)
- [11. References](#11-references)
- [Appendix A: Grammar (EBNF)](#appendix-a-grammar-ebnf-style)
- [Appendix B: Type Conversion Table](#appendix-b-type-conversion-table)
- [Appendix C: License](#appendix-c-license)

## Abstract

LLM INterface for Database Tables (LINDT) is a human-readable, token-efficient format for representing database table structures with their columns, types, and constraints. It uses semantic compression - similar to how JPEG preserves visual appearance while discarding pixel-perfect detail, LINDT preserves schema structure while discarding database-specific implementation details. This approach reduces token consumption by 40-60% compared to standard JSON representations while maintaining clarity and expressiveness. LINDT is optimized for AI language model consumption and developer readability.

## 1. Introduction

### 1.1 Motivation

Traditional schema representations (JSON, XML, verbose DDL) suffer from high token costs when used in AI-assisted development workflows. A typical 50-column table schema can consume 2000+ tokens in standard JSON format. LINDT addresses this by leveraging the fact that language models are highly efficient at parsing code-like structures.

### 1.2 Design Goals

1. **Token Efficiency**: Reduce token consumption by 40-60% compared to JSON
2. **Human Readability**: Maintain clarity for developers
3. **LLM Native**: Use syntax patterns familiar to language models
4. **Semantic Preservation**: Preserve essential schema structure and relationships through lossy compression
5. **Extensible**: Support domain-specific annotations

### 1.3 Scope

LINDT is designed for schema *representation* and *communication*, not schema *definition* or *execution*.

Unlike lossless data serialization formats (JSON for data interchange, Protocol Buffers for structured data), LINDT uses semantic compression similar to JPEG - it preserves essential structure while discarding implementation details. This makes it ideal for:
- Documentation and human understanding
- LLM context windows and code generation
- Schema discussion and collaboration

LINDT does not replace SQL DDL or migration tools, but complements them as a token-efficient communication layer.

#### 1.3.1 Primary Use Case: Read Query Generation

LINDT is optimized for enabling LLMs to write **read queries** (SELECT statements). The schema information preserved by LINDT is specifically chosen to support:

- Correct table and column references
- Proper JOIN construction via foreign key relationships
- Appropriate WHERE clause syntax based on column types
- Understanding of nullability for IS NULL / IS NOT NULL conditions

LINDT intentionally discards information irrelevant to read queries (storage engines, precise decimal scales, index implementations) to maximize token efficiency.

#### 1.3.2 Positioning: When to Use LINDT

LINDT fills a specific niche in the schema representation landscape:

| Environment | Recommended Approach |
|-------------|---------------------|
| GraphQL API available | Use GraphQL SDL — already optimized for typed queries |
| Modern ORM (Prisma, etc.) | Use native schema format — tooling already exists |
| Legacy SQL without API layer | **Use LINDT** — lightweight, no infrastructure changes |
| Token-constrained LLM context | **Use LINDT** — maximum information density |
| DDL generation / migrations | Use SQL DDL — LINDT is lossy by design |

LINDT is particularly valuable for:
- Enterprise systems with large legacy databases
- Environments where adding GraphQL infrastructure is impractical
- MCP (Model Context Protocol) servers providing database access to LLMs

### 1.4 Notation Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174.html).

These keywords appear in **UPPER CASE** when used with their RFC 2119 meaning. When these words appear in lower case, they carry their ordinary English meaning.

## 2. Syntax Specification

### 2.1 Core Structure

A LINDT document MUST contain one or more interface declarations. Each interface declaration MUST begin with the keyword `interface` followed by an identifier and a brace-enclosed body:

```typescript
interface TableName {
  column_name: DataType;
  nullable_column?: DataType;
  // Comments for metadata
}
```

### 2.2 Data Type Mapping

LINDT uses abstract type categories rather than database-specific types. These categories represent broad type families that map to concrete SQL types. Parsers MUST recognize all base types listed in Sections 2.2.1 through 2.2.4. Generators SHOULD use the most specific type available (e.g., `date` rather than `string` for date columns).

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

| LINDT | PostgreSQL | SQL Server | MySQL |
|------|------------|------------|-------|
| `string[]` | `TEXT[]` | — | — |
| `int[]` | `INTEGER[]` | — | — |
| `json[]` | `JSONB[]` | — | — |

**Note**: Arrays are primarily a PostgreSQL feature. For databases without native array support, this notation indicates the column stores serialized array data (typically as JSON).

#### 2.2.6 Literal Union Types

For columns with a fixed set of allowed values (enums), LINDT supports TypeScript-style literal union types. This provides LLMs with exact valid values, reducing hallucination in WHERE clauses:

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

| LINDT | SQL Equivalent |
|------|----------------|
| `'a' \| 'b' \| 'c'` | `VARCHAR CHECK (col IN ('a','b','c'))` |
| `1 \| 2 \| 3` | `INT CHECK (col IN (1,2,3))` |

**Note**: The primary purpose of literal unions is semantic precision for LLMs, not DDL generation. Implementations may choose how to represent these in generated SQL.

### 2.3 Nullability

The `?` suffix indicates nullable columns. The `?` MUST be placed immediately after the column name, before the `:` separator. Columns without `?` MUST be interpreted as NOT NULL.

```typescript
interface Users {
  id: int;              // NOT NULL
  email?: string;       // NULL allowed
}
```

### 2.4 Constraints and Metadata

Constraints are documented using inline comments. Parsers MUST preserve inline comments verbatim. Parsers SHOULD recognize the standard constraint patterns listed in Section 2.4.1.

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

Multi-column constraints MUST appear as comments immediately preceding the interface declaration:

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

LINDT maintains database-agnosticism by mapping vendor-specific types to semantic equivalents from the core type system. This ensures parsers remain lightweight and implementations stay interoperable across different database systems.

#### 2.6.1 Mapping Principle

When a database-specific type has no direct LINDT equivalent, map it to the closest semantic base type. Use `@format` annotations to preserve additional context when needed.

#### 2.6.2 Common Vendor Type Mappings

| Vendor Type | Database | LINDT Type | Annotation | Rationale |
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

1. **Generators** SHOULD map vendor types to LINDT base types according to this table
2. **Generators** MAY include `@format` annotations for round-trip fidelity
3. **Parsers** MUST accept any base type regardless of `@format` annotation
4. **Parsers** MAY use `@format` hints for validation or transformation

**Note**: The `@format` annotation is informational. LINDT parsers are not required to validate format compliance—this responsibility lies with the consuming application.

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

Legacy databases often contain identifiers with spaces, reserved words, or special characters. LINDT uses backtick quoting to represent these "dirty" identifiers, enabling LLMs to generate correctly escaped queries:

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

- Identifiers containing spaces, reserved words, or special characters MUST be wrapped in backticks
- Literal backticks within identifiers MUST be escaped by doubling: ``` `` ```
- Identifiers matching `[a-zA-Z_][a-zA-Z0-9_]*` MUST NOT require quoting

#### 2.8.2 When to Use Quoted Identifiers

| Identifier | Requires Quoting | Reason |
|------------|------------------|--------|
| `OrderDetails` | No | Valid identifier |
| `order_details` | No | Valid identifier |
| `Order Details` | Yes | Contains space |
| `Order-Details` | Yes | Contains hyphen |
| `Order` | Maybe | Reserved word (context-dependent) |
| `123Orders` | Yes | Starts with digit |

**Note**: Quoted identifiers indicate a schema design that predates modern naming conventions. While LINDT supports them for compatibility, new schemas should prefer snake_case or PascalCase identifiers.

## 3. Extended Annotations

### 3.1 Domain-Specific Metadata

LINDT supports domain-specific annotations through structured comments:

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

**LINDT:**
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

**LINDT:**
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

A compliant LINDT parser MUST:

1. Parse interface declarations with valid TypeScript-style identifiers
2. Recognize `?` suffix for nullable columns
3. Parse type annotations with optional length parameters
4. Extract inline comments as metadata
5. Handle multi-line comments for interface-level constraints

### 5.2 Generator Requirements

A compliant LINDT generator SHOULD:

1. Map database-specific types to abstract type categories according to Section 2.2
2. Preserve constraint information in comments
3. Order columns by role: primary keys first, followed by data columns, then timestamp columns (created_at, updated_at)
4. Include foreign key relationships
5. Omit internal/system columns unless explicitly requested

### 5.3 Formatting Conventions

- **Indentation**: 2 spaces (RECOMMENDED)
- **Column Alignment**: Align types at column 25 (RECOMMENDED)
- **Comment Alignment**: Align comments at column 45 (RECOMMENDED)
- **Blank Lines**: One blank line between interfaces (RECOMMENDED)
- **Column Ordering**: Generators SHOULD order columns as: primary keys first, data columns in the middle, timestamp columns (created_at, updated_at) last

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

### 5.4 Conformance Levels

LINDT defines three conformance levels for implementations:

#### 5.4.1 Level 1: Core (REQUIRED)

A Level 1 compliant implementation MUST support:
- Interface declarations with simple identifiers
- All base types from Section 2.2 (`int`, `string`, `decimal`, `float`, `number`, `char`, `text`, `datetime`, `date`, `time`, `boolean`, `blob`, `uuid`, `json`)
- Type length parameters: `string(n)`, `char(n)`
- Nullable columns via `?` suffix
- Inline comment extraction

#### 5.4.2 Level 2: Standard (RECOMMENDED)

A Level 2 compliant implementation MUST support all Level 1 features and additionally:
- Constraint pattern recognition (PRIMARY KEY, FOREIGN KEY, UNIQUE, INDEX, AUTO_INCREMENT, DEFAULT) as described in Section 2.4
- Multi-column constraints via interface-level comments (Section 2.5)
- Array type suffix `[]` (Section 2.2.5)
- Quoted identifiers via backtick syntax (Section 2.8)
- Literal union types (Section 2.2.6)

#### 5.4.3 Level 3: Extended (OPTIONAL)

A Level 3 compliant implementation MAY support:
- Domain-specific annotations (`@schema`, `@format`, `@enum`, etc.) from Section 3
- Vendor-specific type mapping (Section 2.6)
- Schema namespace resolution (Section 2.7)
- Cross-schema foreign key references

#### 5.4.4 Compliance Reporting

Implementations SHOULD declare their conformance level in their documentation using the format:

> This implementation is LINDT Level 2 compliant (v0.7.0).

## 6. Performance Characteristics

### 6.1 Token Efficiency Benchmark

Test scenario: 20-column table with typical constraints*

| Format | Approximate Tokens | Reduction |
|--------|-------------------|-----------|
| Verbose JSON | 450 | 0% (baseline) |
| Minified JSON | 300 | 33% |
| **LINDT** | **180** | **60%** |

*Token counts measured using the GPT-4 tokenizer (cl100k_base). Actual reduction varies based on schema complexity, constraint density, and specific tokenizer used.

### 6.2 Readability Metrics

- **Human Comprehension**: Developers familiar with TypeScript can quickly understand LINDT syntax
- **LLM Efficiency**: Language models trained on code efficiently parse interface-style syntax
- **Maintainability**: Changes to schema are clearly visible in diff tools

## 7. Interoperability

### 7.1 JSON Schema Mapping

LINDT can be converted **to** JSON Schema (one-way conversion):

**LINDT:**
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

**Note**: Conversion from JSON Schema to LINDT requires additional database-specific metadata (primary keys, foreign keys, indexes) that JSON Schema does not capture.

### 7.2 SQL DDL Generation

LINDT representations can generate SQL DDL with database-specific adapters:

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

LINDT employs **semantic compression** - similar to how JPEG preserves visual appearance while discarding pixel-perfect detail, LINDT preserves schema structure while discarding database-specific implementation details.

**What LINDT Preserves:**
- Table and column names
- Data types (semantic level)
- Nullability
- Primary and foreign key relationships
- Unique constraints and indexes
- Basic default values

**What LINDT Discards:**
- Database-specific type parameters (e.g., `DECIMAL(10,2)` becomes `decimal`)
- Storage engines (e.g., `InnoDB`, `MyISAM`)
- Collations and character sets
- Partitioning strategies
- Trigger definitions
- Stored procedure references
- Index types (BTREE, HASH, etc.)
- Exact constraint enforcement mechanisms

This lossy approach is intentional - LINDT prioritizes token efficiency and human readability over bit-perfect database reconstruction.

### 9.2 Not a DDL Replacement

LINDT is a **representation** format, not a **definition** language. It cannot:
- Execute schema changes
- Enforce constraints
- Generate indexes automatically
- Recreate exact DDL statements

### 9.3 Use Case Fit

**LINDT is ideal for:**
- Schema documentation and communication
- LLM context windows
- Understanding database structure
- Code generation guidance
- API documentation

**LINDT is NOT suitable for:**
- Database migration scripts (use proper DDL)
- Exact schema replication
- Production deployment automation
- Compliance documentation requiring exact specifications

### 9.4 Ambiguity Resolution

When mapping from LINDT back to SQL:
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

LINDT is designed to be extended by the community. Proposed extensions should maintain:
- Token efficiency
- Backward compatibility
- Clear semantics

## 11. References

### Normative References

- [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt): Key words for use in RFCs to Indicate Requirement Levels
- [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174.html): Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words

### Informative References

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

### SQL Server → LINDT
| SQL Server | LINDT |
|------------|------|
| INT, BIGINT, SMALLINT | int |
| VARCHAR, NVARCHAR | string |
| DATETIME, DATETIME2 | datetime |
| BIT | boolean |
| DECIMAL, MONEY | decimal |
| VARBINARY, IMAGE | blob |

### PostgreSQL → LINDT
| PostgreSQL | LINDT |
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

### MySQL → LINDT
| MySQL | LINDT |
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
[https://github.com/nemekath/LINDT](https://github.com/nemekath/LINDT)
