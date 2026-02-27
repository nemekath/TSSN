# LINDT

**LLM INterface for Database Tables**

[![Spec Version](https://img.shields.io/badge/spec-v0.7.0-blue)](LINDT-SPEC.md)
[![Status](https://img.shields.io/badge/status-draft-orange)](LINDT-SPEC.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

> A compact, TypeScript-inspired notation for describing database schemas --
> designed to fit more structure into fewer tokens for LLM context windows.

LINDT reduces schema token consumption by **40-60%** compared to JSON while remaining immediately readable by developers and language models alike. It is a *representation* format for communication and documentation, not a replacement for SQL DDL.

## Format Comparison

| | **LINDT** | JSON Schema | SQL DDL | GraphQL SDL |
|---|---|---|---|---|
| **Primary purpose** | LLM context | Data validation | Schema definition | API schema |
| **Token efficiency** | Excellent | Poor | Moderate | Good |
| **Human readability** | High | Low | Moderate | High |
| **Constraint support** | Inline comments | Limited | Full | None |
| **Foreign keys** | Yes | No | Yes | No |
| **Nullability** | `?` suffix | `required` array | `NOT NULL` | `!` suffix |
| **Lossy / Lossless** | Lossy | Lossless | Lossless | N/A |
| **Executable** | No | No | Yes | No |

## Quick Start

### Step 1: Describe a table

```typescript
interface Users {
  id: int;                    // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);         // UNIQUE
  name: string(100);
  created_at: datetime;       // DEFAULT CURRENT_TIMESTAMP
}
```

### Step 2: Add relationships

```typescript
interface Orders {
  id: int;                    // PRIMARY KEY
  user_id: int;               // FK -> Users(id)
  total: decimal;
  status: 'pending' | 'shipped' | 'delivered';
  created_at: datetime;
}
```

### Step 3: Use with an LLM

```
System prompt:
  Database schemas are provided in LINDT format.
  Read `?` as nullable columns.
  Read `//` comments for constraints (PK, FK, indexes).
  Use semantic types (int, string, datetime, etc.).

[paste your LINDT schemas here]

User: Write a query to find all shipped orders with user emails.
```

## Token Efficiency

A typical 20-column table schema:

| Format | ~Tokens | Savings |
|--------|---------|---------|
| Verbose JSON | 450 | -- |
| Minified JSON | 300 | 33% |
| **LINDT** | **180** | **60%** |

*Measured with cl100k_base tokenizer. Actual savings vary by schema complexity.*

## Documentation

| Document | Description |
|----------|-------------|
| [LINDT-SPEC.md](LINDT-SPEC.md) | Full specification (v0.7.0 draft) |
| [EXAMPLES.md](EXAMPLES.md) | Feature-by-feature examples |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Parser/generator pseudocode |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Specification Status

LINDT is currently a **draft specification** (v0.7.0). There are no reference implementations yet.

### Roadmap

- **v0.7.x** -- Stabilize literal union types based on feedback
- **v0.8.0** -- View definitions, computed columns (under discussion)
- **v1.0.0** -- First stable release (when core syntax is proven by implementations)

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Implementations

*No reference implementations exist yet.* LINDT is seeking early implementors to validate the specification.

If you are building a LINDT parser or generator, please [open a discussion](https://github.com/nemekath/LINDT/discussions) so we can list it here. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for pseudocode guidance.

## Integration Examples

### MCP Server Integration

```typescript
// Model Context Protocol server returning schemas in LINDT
{
  "tools": [{
    "name": "get_schema",
    "description": "Get database schema in LINDT format",
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
Schemas are provided in LINDT (LLM INterface for Database Tables):
- Read `?` as nullable columns
- Read `//` comments for constraints (PK, FK, indexes)
- Use semantic types (int, string, datetime, etc.)
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where we need help:
- Implementations in new languages
- Database-specific type mappings
- Real-world examples and use cases
- Specification feedback

## License

LINDT is released under the [MIT License](LICENSE).

## Contact

- **Issues**: [GitHub Issues](https://github.com/nemekath/LINDT/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nemekath/LINDT/discussions)
- **Email**: github@just-do-it.mozmail.com
