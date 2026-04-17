# Changelog

All notable changes to the TSSN specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Under Discussion
- Temporal table syntax for history/versioning
- Graph database relationship syntax
- Soft-delete standardization (`@softdelete` annotation)
- Rebrand to LINDT (deferred — revisit for 1.0)

## [0.8.0] - 2026-04-14 (Draft)

**Theme:** Reusability & Conformance — higher semantic density for read-query
generation and a clear conformance story for implementers.

### Added

- **Section 2.2.7: Type Aliases** — Reusable literal unions and sized types
  ```typescript
  type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';
  interface Orders { status: OrderStatus; }
  ```
  Declared once at the top of the schema, referenced from any column.
  Highest-leverage feature for schemas with repeated enums — pays the token
  cost for a union once instead of N times.
- **Section 2.5.1: Composite Primary Keys** — Explicit `PK(col1, col2, ...)`
  form at the interface level for tables without a surrogate key
- **Section 2.5.2: Multi-Column Constraint Patterns** — Canonical table of
  supported `PK(...)` / `UNIQUE(...)` / `INDEX(...)` forms
- **Section 2.9: Views** — First-class `view` keyword, distinct from
  `interface`
  - `@materialized` annotation for cached views
  - `@readonly` / `@updatable` annotations for write-semantics hints
  - Rationale: LLMs need to distinguish tables from views to avoid proposing
    writes against views, re-joining pre-joined data, or trusting materialized
    view freshness
- **Section 3.3: Computed Columns** — `@computed` annotation with optional
  expression
  - Informs LLMs that the column is derived and may not be indexed
  - Database mapping table for PostgreSQL, SQL Server, MySQL, Oracle
- **Section 5.1: Conformance Levels** — Three-tier conformance model
  - **Level 1 (Core)**: Interface declarations, base types, nullability,
    opaque comments
  - **Level 2 (Standard)**: Structured constraints, multi-column constraints,
    arrays, literal unions, quoted identifiers, cross-schema FK triples
  - **Level 3 (Extended)**: Type aliases, views, view annotations, full
    domain annotations
  - Each implementation MUST declare its target level
- **Section 5.4: Conformance Test Suite** — Official `tests/conformance/`
  directory with `.tssn` inputs and `.expected.json` expected outputs, grouped
  by level

### Changed

- **EBNF Grammar** — Added `type_alias`, `view_decl`, `alias_ref` productions;
  `schema` now admits top-level aliases and views in any order
- **Implementation Guidelines** — Split into Parser / Generator / Conformance
  sections; generators at Level 3 SHOULD factor out repeated literal unions
  as type aliases
- **IMPLEMENTATION.md** — Pseudocode updated with `parse_type_alias`,
  `resolve_aliases`, `parse_interface(kind=...)`, `parse_interface_level_constraint`,
  and new data-structure fields (`Table.kind`, `Column.alias_name`,
  `Constraint.reference_schema`, `Schema.type_aliases`, `Schema.views`)
- **Cross-schema FKs** — Foreign-key parser now captures an optional schema
  prefix `schema.Table(col)` as a structured `(schema, table, column)` triple
  instead of a flat string

### Rationale

Four themes converge in v0.8:

1. **Token efficiency through reuse**. Literal unions from v0.7 are
   high-impact but self-sabotage when the same enum appears in 20 tables.
   Type aliases eliminate the repetition — pure information reuse with no
   semantic loss.
2. **Read-query precision**. `view`, `@computed`, and composite PK clarity
   all give LLMs more accurate signals about what a query against the schema
   will actually do.
3. **Implementability**. Conformance Levels make "what does it mean for a
   parser to support TSSN?" a concrete, testable question for the first time.
4. **Closing loose ends**. Composite primary keys and cross-schema FK
   triples were under-specified in v0.6/v0.7 — 0.8 makes both canonical.

## [0.7.0] - 2025-11-26 (Draft)

### Added
- **Section 2.2.6: Literal Union Types** - TypeScript-style unions for enum columns
  - Syntax: `status: 'pending' | 'shipped' | 'delivered';`
  - Numeric unions: `priority: 1 | 2 | 3;`
  - Nullable unions: `payment?: 'card' | 'bank';`
  - Reduces LLM hallucination by providing exact valid values
  - Recommended for ≤10 values; fallback to `string` + `@enum` for larger sets

### Changed
- **EBNF Grammar** - Added `union_type`, `literal`, `string_lit`, `number_lit` productions
- **EXAMPLES.md** - Added Section 4: Literal Union Types with query examples

### Rationale
Literal unions transform CHECK constraints from comments (metadata) into types (structure). This improves LLM query generation by making valid values explicit rather than implicit.

## [0.6.0] - 2025-11-26 (Draft)

### Added
- **Section 2.2.5: Array Types** - The `[]` suffix for array columns (PostgreSQL arrays)
  - Semantic hint for LLMs to generate correct array operations (ANY, UNNEST, @>)
  - Database mapping table showing PostgreSQL array support
  - LLM query generation impact examples
- **Section 2.8: Quoted Identifiers** - Backtick quoting for legacy identifiers
  - Support for identifiers with spaces, reserved words, or special characters
  - Escaping rules (double backticks for literal backticks)
  - Database-specific escaping guidance (SQL Server brackets, MySQL backticks, PostgreSQL quotes)
- **Section 2.6: Vendor-Specific Type Handling** - Guidelines for mapping database-specific types to TSSN base types
  - Mapping principle for vendor-agnostic type handling
  - Common vendor type mappings table (SQL Server, PostgreSQL)
  - `@format` annotation pattern for preserving semantic context
  - Implementation guidance for generators and parsers
- **Section 1.3.1: Primary Use Case** - Clarified that TSSN is optimized for read query (SELECT) generation
- **Section 1.3.2: Positioning** - Added guidance on when to use TSSN vs. alternatives (GraphQL, ORM schemas, DDL)
- **Section 2.7: Schema Namespaces** - Support for multi-schema databases via `@schema` annotation
  - Default schema behavior (dbo, public)
  - Cross-schema foreign key references

### Changed
- **EBNF Grammar** - Updated to include array suffix (`[]`) and quoted identifiers (backticks)
- **Appendix B** - Added PostgreSQL array type mappings (TEXT[], INTEGER[], JSONB[])
- **README.md** - Removed fictional implementation references; TSSN is draft-only with no reference implementations yet
- **EXAMPLES.md** - Added examples for array types (Section 3) and quoted identifiers (Section 9)

## [0.5.0] - 2025-11-20 (Draft)

### Added
- Initial draft specification
- Core syntax definition for interface-style schema notation
- Semantic type mapping system (int, string, datetime, boolean, decimal, blob, etc.)
- Nullability support via `?` suffix
- Constraint documentation via inline comments
- Support for PRIMARY KEY, FOREIGN KEY, UNIQUE, INDEX constraints
- Type length parameters (e.g., `string(255)`)
- Multi-column constraint support via interface-level comments
- Domain-specific annotation system via `@` prefixes
- Token efficiency benchmarks showing 40-60% reduction vs JSON
- Complete grammar specification in EBNF-style notation
- Type conversion tables for PostgreSQL, MySQL, and SQL Server
- Implementation guidelines for parsers and generators
- Formatting conventions and style guide
- Interoperability section covering JSON Schema and SQL DDL
- Real-world use cases and examples
- MIT License

### Documentation
- Complete specification document (TSSN-SPEC.md)
- README with quick start and examples
- Contributing guidelines
- Reference implementation pseudocode
- Extended examples covering common scenarios

---

## Release Notes

### Version 0.5.0 - Initial Draft Release

This is the initial draft release of TSSN (TypeScript-Style Schema Notation). The specification is in draft status and subject to changes based on community feedback.

**Key Features:**
- **Token Efficient**: 40-60% reduction in token usage compared to JSON
- **Human Readable**: Familiar TypeScript-style syntax
- **Database Agnostic**: Works with PostgreSQL, MySQL, SQL Server, and others
- **Extensible**: Support for domain-specific annotations
- **Well Documented**: Complete specification with examples and guidelines

**Known Limitations:**
- Draft status - specification may change based on feedback
- Advanced database features (partitioning, triggers) require custom annotations
- Type length interpretation may vary across database systems
- No built-in validation for semantic correctness

**Next Steps:**
We are seeking community feedback on the specification. Please see CONTRIBUTING.md for guidelines on how to provide feedback and contribute.

---

## Version Numbering

TSSN follows Semantic Versioning (SemVer):

- **MAJOR** version (X.0.0): Incompatible changes to specification
  - Changes that would break existing parsers
  - Removal of supported features
  - Changes to core syntax

- **MINOR** version (1.X.0): Backward-compatible additions
  - New optional features
  - New type mappings
  - Additional annotation patterns
  - Clarifications that don't change behavior

- **PATCH** version (1.0.X): Backward-compatible fixes
  - Typo corrections
  - Documentation improvements
  - Example additions
  - Clarifications of ambiguous language

## Deprecation Policy

When features need to be deprecated:

1. **Announcement**: Feature marked as deprecated in MINOR version
2. **Grace Period**: At least 2 MINOR versions before removal
3. **Migration Guide**: Clear documentation of alternatives
4. **Removal**: Feature removed in next MAJOR version

Example:
- v1.5.0: Feature X deprecated, alternatives documented
- v1.6.0 - v1.8.0: Feature X still supported but warnings issued
- v2.0.0: Feature X removed

## Breaking Changes Policy

Breaking changes require:
- Clear justification for the change
- Community discussion period (minimum 30 days)
- Comprehensive migration guide
- Updated implementations before release

## Future Feature Outlook

The following features are under discussion and consideration for future versions. The timeline and inclusion of these features will be determined based on community feedback and needs.

### Potential Future Features

**Schema Evolution & Refinement**
- Refinements based on community feedback
- Additional real-world examples and use cases
- Clarifications to specification based on implementation experience

**Extended Schema Support**
- Temporal table syntax for history/versioning
- Row-level security / tenant scoping hints

**Advanced Database Features**
- Graph relationship syntax for graph databases
- Partitioning strategy annotations
- Trigger and stored procedure references
- Custom check constraint expressions

**Tooling & Integration**
- Standard validation tools
- Schema migration utilities
- IDE extensions and language server support
- Integration with popular ORMs

**Community-Driven Extensions**
- Database-specific annotations
- Framework-specific metadata
- Cloud provider integrations

---

For detailed discussions about future versions, see:
- [GitHub Discussions](https://github.com/nemekath/TSSN/discussions)
- [Issue Tracker](https://github.com/nemekath/TSSN/issues)

**Note**: Dates and version numbers in the Unreleased and future sections are tentative and subject to change based on development progress and community feedback.
