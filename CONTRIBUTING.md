# Contributing to LINDT

Thank you for your interest in contributing to LINDT (LLM INterface for Database Tables)! This document provides guidelines for contributing to the specification and related implementations.

## Ways to Contribute

### 1. Specification Improvements
- Clarify ambiguous language
- Add examples for edge cases
- Propose new features or extensions
- Fix typos or formatting issues

### 2. Implementations
- Create parsers/generators in new languages
- Improve existing implementations
- Add database-specific adapters
- Create integration examples

### 3. Documentation
- Add real-world use cases
- Create tutorials or guides
- Translate documentation
- Improve code examples

### 4. Testing
- Report bugs or inconsistencies
- Create test suites
- Add edge case examples
- Performance benchmarks

## Process

### Reporting Issues

Before creating an issue:
1. Search existing issues to avoid duplicates
2. Gather relevant information (examples, error messages, versions)
3. Provide a minimal reproducible example if applicable

We use structured issue templates. Please select the appropriate template when [opening an issue](https://github.com/nemekath/LINDT/issues/new/choose).

### Proposing Specification Changes

Specification changes require careful consideration:

1. **Open a Discussion** first in [GitHub Discussions](https://github.com/nemekath/LINDT/discussions)
   - Explain the problem you're solving
   - Show examples of current limitations
   - Propose your solution with examples

2. **Gather Feedback** from the community
   - Address concerns and questions
   - Refine your proposal based on feedback

3. **Create a Pull Request** once there's consensus
   - Update the specification document
   - Add examples demonstrating the change
   - Update the changelog
   - Ensure backward compatibility or document breaking changes

### Submitting Pull Requests

1. **Fork** the repository
2. **Create a branch** with a descriptive name:
   ```bash
   git checkout -b feature/add-temporal-tables
   git checkout -b fix/type-mapping-ambiguity
   git checkout -b docs/improve-examples
   ```

3. **Make your changes**
   - Follow the style guide (see below)
   - Add or update tests if applicable
   - Update documentation

4. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add support for temporal tables"
   git commit -m "fix: clarify decimal type precision handling"
   git commit -m "docs: add PostgreSQL extension example"
   ```

5. **Push** and create a pull request:
   ```bash
   git push origin feature/add-temporal-tables
   ```

6. **Describe** your changes in the PR:
   - What problem does it solve?
   - How does it work?
   - Are there breaking changes?
   - Have you updated documentation?

## Style Guide

### Specification Writing

- **Be precise**: Avoid ambiguous language
- **Use RFC 2119 keywords**: When writing normative requirements, use MUST, SHOULD, MAY in UPPER CASE (see [Section 1.4 of the specification](LINDT-SPEC.md#14-notation-conventions))
- **Use examples**: Show, don't just tell
- **Be consistent**: Follow existing patterns
- **Think about edge cases**: Document limitations

**Good Example:**
```markdown
### 2.3 Nullability

The `?` suffix indicates nullable columns:

```typescript
interface Users {
  id: int;              // NOT NULL
  email?: string;       // NULL allowed
}
```

The `?` MUST be placed immediately after the column name, before the `:` separator.
```

**Bad Example:**
```markdown
### Nullability

You can use ? for nullable columns.
```

### Code Examples

- **Use realistic names**: `Users`, `Orders`, not `Table1`, `Column1`
- **Include comments**: Explain constraints and business logic
- **Show complete examples**: Not just fragments
- **Test your examples**: Ensure they're syntactically correct

### Documentation

- Use clear headings (Markdown H2 for sections, H3 for subsections)
- Keep paragraphs short and focused
- Use bullet points for lists
- Include code blocks with syntax highlighting
- Link to related sections when referencing concepts

## Testing Guidelines

### Specification Compliance

When implementing LINDT:

1. **Core Features** (MUST support):
   - Interface declarations
   - Basic type mapping (int, string, datetime, boolean, decimal, blob)
   - Nullable columns (`?` suffix)
   - Inline comments for constraints

2. **Extended Features** (SHOULD support):
   - Type length parameters `string(255)`
   - Standard constraint patterns (PK, FK, UNIQUE, INDEX)
   - Multi-line comments for interface-level constraints

3. **Optional Features** (MAY support):
   - Domain-specific annotations `@table`, `@schema`
   - Custom type mappings
   - Database-specific extensions

### Test Cases

Create test cases covering:

```typescript
// Basic types
interface BasicTypes {
  id: int;
  name: string;
  price: decimal;
  active: boolean;
  data: blob;
  created: datetime;
}

// Nullable columns
interface NullableTest {
  required: int;
  optional?: string;
}

// Lengths
interface LengthTest {
  fixed: string(50);
  variable: string;
}

// Constraints
interface ConstraintTest {
  id: int;              // PRIMARY KEY
  email: string;        // UNIQUE
  user_id: int;         // FK -> Users(id)
}

// Comments
// INDEX(created_at, status)
interface CommentTest {
  id: int;
  status: string;
  created_at: datetime;
}
```

## Creating New Implementations

### Structure

Recommended package structure:

```
lindt-[language]/
├── README.md
├── LICENSE
├── src/
│   ├── parser.{ext}      # Parse LINDT text
│   ├── generator.{ext}   # Generate LINDT from schemas
│   ├── types.{ext}       # Type definitions
│   └── utils.{ext}       # Helpers
├── tests/
│   ├── parser_test.{ext}
│   ├── generator_test.{ext}
│   └── fixtures/         # Test LINDT files
└── examples/
    └── usage.{ext}
```

### API Guidelines

**Parser API:**
```python
# Parse LINDT text into structured data
schema = parse_lindt(lindt_text)
# Returns: Schema object with tables, columns, constraints
```

**Generator API:**
```python
# Generate LINDT from database connection
lindt_text = generate_lindt(connection, table_name)
# Returns: LINDT formatted string

# Generate from structured data
lindt_text = generate_lindt(schema_object)
```

### Documentation Requirements

Each implementation should include:

1. **README** with:
   - Installation instructions
   - Quick start example
   - API reference
   - Database support matrix

2. **Examples** demonstrating:
   - Basic parsing/generation
   - Database integration
   - Custom type mappings
   - Error handling

3. **Tests** with:
   - Parser validation
   - Generator output verification
   - Edge case handling
   - Performance benchmarks

## Versioning

LINDT follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes to specification
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, clarifications

### Breaking Changes

Breaking changes require:
1. Clear migration guide
2. Deprecation period for removed features
3. Community discussion and consensus

## Communication

- **GitHub Discussions**: General questions, ideas, announcements
- **GitHub Issues**: Bug reports, specific problems
- **Pull Requests**: Code and documentation changes

### Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md). In short: be respectful, assume good intentions, and focus on the idea rather than the person.

## Recognition

Contributors will be:
- Credited in release notes for their contributions
- Mentioned in relevant documentation

Significant contributions may result in:
- Co-author credit in specification updates
- Maintainer status for implementations

## Resources

- [LINDT Specification](LINDT-SPEC.md)
- [Examples](EXAMPLES.md)
- [Implementation Guide](IMPLEMENTATION.md)
- [Discussion Forum](https://github.com/nemekath/LINDT/discussions)
- [Issue Tracker](https://github.com/nemekath/LINDT/issues)

## Questions?

Don't hesitate to ask questions:
- Open a [GitHub Discussion](https://github.com/nemekath/LINDT/discussions)
- Comment on relevant issues or PRs
- Reach out to maintainers

---

Thank you for contributing to LINDT! Your efforts help make database schema representation better for everyone.
