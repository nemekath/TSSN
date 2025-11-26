# TypeScript-Style Schema Notation (TSSN)

**Version:** 0.5.0
**Status:** Draft Specification
**Date:** 2025-11-20
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
column          = ws identifier nullable? ws ":" ws type ws ";" comment? newline
nullable        = "?"
type            = identifier ( "(" digits ")" )?
comment         = "//" char* newline
identifier      = letter ( letter | digit | "_" )*
letter          = "A" | "B" | ... | "Z" | "a" | "b" | ... | "z"
digit           = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
digits          = digit+
char            = (* any character except newline *)
ws              = ( " " | "\t" | newline )*
newline         = "\n" | "\r\n" | "\r"
```

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
