# TSSN - TypeScript-Style Schema Notation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.5.0--draft-orange.svg)](https://github.com/nemekath/TSSN)

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

```typescript
// Git-friendly, diff-friendly schema documentation
// Changes are immediately visible in pull requests

// v1.0
interface Users {
  id: int;
  email: string(255);
}

// v2.0 - Added organization support
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

*No reference implementations yet — TSSN is currently a draft specification.*

Interested in building one? See [CONTRIBUTING.md](CONTRIBUTING.md) and [IMPLEMENTATION.md](IMPLEMENTATION.md) for parser/generator guidelines.

## 🔧 Integration Examples

### MCP Server Integration

```typescript
// Model Context Protocol server returning schemas in TSSN
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
