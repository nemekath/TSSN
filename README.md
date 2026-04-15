# TSSN - TypeScript-Style Schema Notation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.8.0--draft-orange.svg)](https://github.com/nemekath/TSSN)

> A token-efficient, human-readable format for representing database schemas

## 🎯 What is TSSN?

TSSN (TypeScript-Style Schema Notation) is a lightweight format for representing database table structures. It's designed for:

- **AI-Assisted Development**: Reduces token consumption by 40-60% in LLM context windows
- **Human Readability**: Familiar TypeScript-style syntax that developers can parse instantly
- **Documentation**: Git-friendly schema documentation that's easy to diff and review
- **Interoperability**: Converts to/from JSON Schema, SQL DDL, and other formats

## 📊 Quick Example

**Before (JSON - ~450 tokens):**
```json
{
  "table": "users",
  "columns": [
    {"name": "id", "type": "INT", "nullable": false, "key": "PRI", "extra": "auto_increment"},
    {"name": "email", "type": "VARCHAR(255)", "nullable": false, "key": "UNI"},
    {"name": "organization_id", "type": "INT", "nullable": false, "key": "MUL"},
    {"name": "created_at", "type": "TIMESTAMP", "nullable": false, "default": "CURRENT_TIMESTAMP"}
  ]
}
```

**After (TSSN - ~180 tokens, 60% reduction):**
```typescript
interface Users {
  id: int;                    // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);         // UNIQUE
  organization_id: int;       // FK -> Organizations(id)
  created_at: datetime;       // DEFAULT CURRENT_TIMESTAMP
}
```

## 🚀 Features

- **Token Efficient**: Save 40-60% tokens compared to JSON representations
- **Semantic Compression**: Like JPEG for images, preserves structure while discarding implementation details
- **Type Safe**: Semantic types with clear mappings to SQL types
- **Constraint Support**: Inline comments for PK, FK, indexes, and constraints
- **Extensible**: Support for domain-specific annotations
- **Language Agnostic**: Not tied to any specific database or programming language

## ✨ New in v0.8 (draft)

- **Type aliases** — define a literal union or sized type once, reuse
  it across tables. Huge token savings for schemas with shared enums.
- **First-class views** — the `view` keyword, distinct from
  `interface`, plus `@materialized` / `@readonly` / `@updatable`
  annotations.
- **Composite primary keys** — explicit `PK(col1, col2, …)` form for
  tables without a surrogate key.
- **`@computed` annotation** — marks derived columns so LLMs avoid
  proposing `INSERT`/`UPDATE` and understand indexing caveats.
- **Conformance Levels** — L1 Core / L2 Standard / L3 Extended, each
  with a defined feature matrix. Implementations declare the level
  they claim.
- **File-level `@schema` propagation** — one top-of-file `@schema`
  applies to every declaration without repetition.

See the [v0.8 changelog entry](CHANGELOG.md#080---2026-04-14-draft)
and the [full spec](TSSN-SPEC.md) for normative text.

```typescript
type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';

// PK(user_id, order_id)
interface UserOrders {
  user_id: int;              // FK -> Users(id), ON DELETE CASCADE
  order_id: int;             // FK -> Orders(id)
  status: OrderStatus;
}

// @materialized
view ActiveOrders {
  order_id: int;             // PRIMARY KEY
  user_id: int;
  status: OrderStatus;
}
```

## 📖 Documentation

- **[Full Specification](TSSN-SPEC.md)**: Complete technical specification
- **[Examples](#examples)**: Real-world usage examples
- **[Contributing](CONTRIBUTING.md)**: How to contribute to TSSN

## 💡 Use Cases

### AI-Powered Development

```typescript
// Compact schema fits easily in LLM context windows
interface Orders {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> Users(id)
  total: decimal;
  status: string(20);   // CHECK IN ('pending', 'completed', 'cancelled')
  created_at: datetime;
}

// LLM can now generate accurate queries with less context
```

### Schema Documentation

TSSN is git-friendly and diff-friendly — schema changes are immediately
visible in pull requests.

**v1.0:**

```typescript
interface Users {
  id: int;
  email: string(255);
}
```

**v2.0 — added organization support:**

```typescript
interface Users {
  id: int;
  email: string(255);
  organization_id: int;  // FK -> Organizations(id), @since: v2.0
}
```

### API Documentation

```typescript
// Self-documenting API responses
// @endpoint: GET /api/users/:id
// @response: application/json
interface UserResponse {
  id: int;
  email: string;
  profile?: json;           // Optional nested profile data
  created_at: datetime;
}
```

## 📦 Implementations

The **reference TypeScript parser** lives in
[`reference/typescript/`](reference/typescript/) and claims
[Level 3 (Extended)](TSSN-SPEC.md#513-level-3--extended) conformance.
It is parser + semantic validator only — no type mapper, no DDL
generator, no database introspector — and runs against the
comprehensive conformance suite under
[`tests/conformance/`](tests/conformance/) (15 L1 + 25 L2 + 26 L3
fixtures).

Not published to npm. Use the source directly for now.

Interested in building a second implementation in another language?
See [CONTRIBUTING.md](CONTRIBUTING.md), [IMPLEMENTATION.md](IMPLEMENTATION.md),
and [CHARTER.md](CHARTER.md). A second implementation that passes the
full Level 3 conformance suite is the last missing piece before TSSN
can leave draft status.

## 🔧 Integration Examples

### MCP Server Integration

```json
{
  "tools": [{
    "name": "get_schema",
    "description": "Get database schema in TSSN format",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {"type": "string"}
      }
    }
  }]
}
```

### LLM System Prompt

```
Schemas are provided in TypeScript-Style Schema Notation (TSSN):
- Read `?` as nullable columns
- Read `//` comments for constraints (PK, FK, indexes)
- Use semantic types (int, string, datetime, etc.)
```

## 📊 Performance

Token consumption for a typical 20-column table:

| Format | Tokens | Reduction |
|--------|--------|-----------|
| Verbose JSON | 450 | baseline |
| Minified JSON | 300 | 33% |
| **TSSN** | **180** | **60%** |

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where we need help:
- Implementations in new languages
- Database-specific type mappings
- Real-world examples and use cases
- Documentation improvements

## 📄 License

TSSN is released under the [MIT License](LICENSE).

## 🌟 Acknowledgments

TSSN was created to solve real-world problems in AI-assisted development workflows, particularly when working with large database schemas in token-constrained environments.

## 📮 Contact

- **Issues**: [GitHub Issues](https://github.com/nemekath/TSSN/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nemekath/TSSN/discussions)
- **Email**: github@just-do-it.mozmail.com

---

**Star this repo if you find TSSN useful! ⭐**
