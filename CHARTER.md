# TSSN Project Charter

**Status:** Draft Standard in Development
**Current Specification Version:** 0.8.0 (Draft)
**Editor:** Benjamin Zimmer
**License:** MIT

## 1. Purpose

TSSN (TypeScript-Style Schema Notation) is a draft interchange format for
representing relational database schemas in a token-efficient, human-readable
form optimized for consumption by large language models.

This Charter positions TSSN as a **draft standard on a path to stabilization**.
It documents the process by which the specification evolves, the quality
bar every change must clear, and the relationship between the normative
specification, reference implementations, and conformance tests.

## 2. Scope

### 2.1 In Scope

- A normative grammar and semantics for representing relational schemas
  as TypeScript-style interfaces, including columns, types, constraints,
  views, type aliases, and domain annotations
- Three conformance levels (Core, Standard, Extended) allowing
  implementations to declare the subset they support
- At least one reference implementation that passes a conformance test
  suite exercising every normative feature
- A test-suite format (`tests/conformance/levelN/` with paired
  `.tssn` / `.expected.json` fixtures) usable by any language implementation

### 2.2 Out of Scope

- SQL DDL generation, database introspection, and type-mapper layers
  (these are valuable but separate from the core specification)
- Schema migration, versioning, or diffing semantics beyond the
  representational level
- Runtime validation of instance data against a TSSN schema
- Commercial support, certification, or trademark management

## 3. Normative vs Informative Content

The specification distinguishes normative requirements from informative
commentary using the conventions of [RFC 2119] and [RFC 8174]:

- **MUST / MUST NOT / REQUIRED / SHALL / SHALL NOT** — absolute
  requirements. An implementation that violates a MUST rule is
  non-conformant.
- **SHOULD / SHOULD NOT / RECOMMENDED / NOT RECOMMENDED** — strong
  guidance. Deviation is permitted but must be documented.
- **MAY / OPTIONAL** — purely permissive; neither choice affects
  conformance.

Every normative rule in the specification SHOULD be accompanied by:

1. A minimal positive example
2. A negative example or clear boundary condition
3. A brief rationale when the choice is non-obvious
4. A backward-compatibility note when it changes existing behavior

Text without these markers is informative and non-binding.

[RFC 2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174

## 4. Versioning and Stability

TSSN follows [Semantic Versioning 2.0.0]. Pre-1.0 releases are draft
status and may change, but each minor version is treated as a coherent
editorial unit:

- **MAJOR (x.0.0)**: Breaking syntactic or semantic changes to existing
  features. Requires a migration guide.
- **MINOR (0.x.0)**: New features that are backward-compatible with
  prior minor versions at the same major.
- **PATCH (0.0.x)**: Editorial corrections, clarifications, added
  examples, and typos that do not change normative content.

A release becomes **Stable** (leaving draft status) only when:

1. Two or more independent implementations pass the full Level 3
   conformance suite
2. The specification has been reviewed for clarity, terminology
   consistency, and spec-to-implementation alignment
3. No unresolved blocking issues have been raised against the draft
   for at least one minor version cycle

[Semantic Versioning 2.0.0]: https://semver.org/spec/v2.0.0.html

## 5. Change Process

Every change to `TSSN-SPEC.md`, `EXAMPLES.md`, `IMPLEMENTATION.md`, or
`reference/typescript/src/` is subject to review gates. Reviews are
conducted by specialized subagents defined under `.claude/agents/` in
addition to human review.

### 5.1 Specification Changes

1. A change is proposed as a patch against `TSSN-SPEC.md` with a
   rationale, backward-compatibility note, and at least one positive
   and one negative example.
2. The `spec-editor` subagent reviews the change for RFC 2119
   compliance, terminological consistency, and adherence to this
   Charter's quality bar.
3. If the change alters the grammar, the `conformance-reviewer`
   subagent verifies that the reference implementation is updated in
   the same change, or the change documents the gap explicitly.
4. If the change adds a new feature, the `test-auditor` subagent
   verifies that the conformance suite under
   `tests/conformance/level{N}/` has been extended with positive and
   negative fixtures exercising the new feature.

### 5.2 Implementation Changes

1. Changes to `reference/typescript/src/` must maintain the
   production-to-method mapping between the EBNF in Appendix A and
   the parser. Every grammar production has a corresponding parse
   method or a documented exception.
2. The `conformance-reviewer` subagent audits the mapping after
   non-trivial parser changes.
3. The `test-auditor` subagent verifies that every parse method has
   at least one positive and one negative test, and that edge cases
   from Appendix A (CRLF, BOM, escaped backticks, `//` inside string
   literals, etc.) remain covered.

## 6. Conformance Levels (Summary)

Implementations MUST declare the highest level they claim. Details in
Spec Section 5.1.

- **Level 1 (Core):** interface declarations, base types with optional
  length, nullability, opaque comment capture.
- **Level 2 (Standard):** Level 1 plus structured constraint parsing
  (PK/FK/UNIQUE/INDEX/AUTO_INCREMENT/DEFAULT), interface-level
  multi-column constraints, array types, literal unions, quoted
  identifiers, and cross-schema FK triples.
- **Level 3 (Extended):** Level 2 plus type aliases, first-class
  views, `@materialized` / `@readonly` / `@updatable` annotations,
  and the full domain-annotation set (`@schema`, `@computed`,
  `@format`, `@since`, `@deprecated`, `@description`, `@enum`).

## 7. Multiple Independent Implementations

To leave draft status, TSSN requires at least two independent
implementations at Level 3 that pass the conformance suite. As of
v0.8.0, the reference TypeScript implementation under
`reference/typescript/` is the only implementation. The project
actively invites implementations in other languages; contribution
guidance is in `CONTRIBUTING.md`.

When a second implementation exists, an `interop-validator` subagent
will be added to routinely cross-check that both produce equivalent
ASTs for the same input. Until then, that role is deferred.

## 8. Security Considerations

The specification's Security Considerations section was added as
Section 11 (eight subsections) during the v0.8 editorial cycle. It
covers the three-tier threat model, recommended parser resource
limits (Section 11.3), downstream SQL-injection forwarding hazards
(Section 11.4), parser implementation hazards (Section 11.5), and
pre-1.0 open items including a fuzzing campaign (Section 11.8).

Remaining pre-1.0 gates from Section 11.8 are tracked as open
questions in Section 10.1.

## 9. Editorial Team

- **Editor:** Benjamin Zimmer
- **Automated Reviewers:** `spec-editor`, `conformance-reviewer`,
  `test-auditor` (see `.claude/agents/`)

Contributors who add substantial work to the reference implementation
or conformance suite are recognized in release notes.

## 10. Open Questions for the Editor

Items that still need resolution before the 1.0 stable release.
Resolved questions are tracked in Section 10.2 for traceability.

### 10.1 Still open

1. **Unicode in `simple_id`**: EBNF currently restricts simple_id to
   ASCII letters plus digits and underscore. The informative note at
   the end of Appendix A mentions Unicode support for quoted
   identifiers only. Decide before 1.0 whether to:
   - Broaden the EBNF to admit Unicode letter categories
   - Keep ASCII-only and formalize the note as "Unicode is supported
     only via quoted identifiers"
   The current reference implementation accepts ASCII only, matching
   the EBNF as written.

2. **DEFAULT values containing quoted commas**: The current constraint
   parser stops `DEFAULT` at the first comma, which breaks on
   `DEFAULT 'foo, bar'`. A proper tokenizer that respects single-quote
   quoting is needed. Conformance-reviewer flagged this; deferred to
   a follow-up with a broader constraint-comment tokenizer.

3. **Composite primary key columns and nullability**: Spec 2.5.1 does
   not explicitly say that columns referenced by a composite `PK(...)`
   must be non-nullable. Most SQL engines require non-null PK
   columns; should the validator enforce this?

4. **Single-quote handling inside string literals**: The grammar
   defines `char_no_sq` as "any character except single quote" with
   no escape sequence. Strings containing `'` currently cannot be
   represented at all, which limits literal unions. Decide whether
   to introduce an escape convention (e.g., SQL-style doubled `''`)
   or keep the restriction.

5. **Cross-implementation ordering of AST fields**: For the
   conformance suite to be language-agnostic, `.expected.json` fixtures
   need a canonical field order and canonical numeric formatting
   (integer vs float). The current TypeScript impl emits objects in
   insertion order; once a second implementation exists, drift is
   possible. Specify a JSON schema for `.expected.json` files before
   publishing the conformance suite as normative.

6. **Fuzzing campaign before 1.0**: Per Spec Section 11.8,
   structure-aware fuzzing for 24+ CPU-hours is a 1.0 release gate.
   Not started.

7. **Resource-limit conformance fixtures**: Per Spec Section 11.8,
   the conformance suite MUST gain boundary fixtures for every
   resource limit defined in Section 11.3. Not started.

### 10.2 Resolved questions (v0.8 cycle)

For traceability, the following questions were resolved during the
v0.8 editorial pass and no longer need further decision:

- ~~`type X = int;` shadowing a base type~~ — Resolved: validator
  error (`alias_shadows_base_type`). Spec 2.2.7.
- ~~Float literals in unions~~ — Resolved: rejected. Spec 2.2.6
  "Constraints on Literal Unions" rule 1.
- ~~Blank-line detachment for annotations~~ — Resolved implicitly:
  the lexer normalizes blank lines away, so leading comments attach
  unconditionally to the following declaration regardless of
  intervening blank lines.
- ~~Trailing `;` after `}`~~ — Resolved: rejected. Parser-level test
  coverage maintained.
- ~~`@materialized` + `@updatable` interaction~~ — Resolved:
  rejected. Spec 2.9.3 annotation interaction matrix.
- ~~Composite PK ordering semantics~~ — Resolved: order is
  significant. Spec 2.5.1.
- ~~Type alias scope terminology~~ — Resolved: "parse-unit-level".
  Spec 2.2.7.
- ~~Reserved keyword list~~ — Resolved: contextual keywords
  consolidated in new Spec Section 2.10.
- ~~`@computed` on nullable columns~~ — Resolved: permitted. Spec
  3.3.
- ~~Mixed-literal unions~~ — Resolved: validator error
  (`heterogeneous_union`). Spec 2.2.6 rule 2.
- ~~Unknown base-type identifiers~~ — Resolved: validator error
  (`unknown_base_type`) against the canonical 14-entry list. Spec
  2.2.1–2.2.4.
- ~~File-level `@schema` propagation~~ — Resolved: non-adjacent
  top-level `@schema` becomes the parse-unit default. Spec 2.7.2.
- ~~Security Considerations placeholder (Charter Section 8)~~ —
  Resolved: full Section 11 added to the spec, covering threat
  model, resource limits, downstream forwarding hazards, parser
  implementation hazards, error message policy, dependencies, and
  pre-1.0 open items. The open items moved to Section 10.1 questions
  6 and 7 (fuzzing campaign, boundary fixtures).

## 11. References

- [TSSN Specification](TSSN-SPEC.md)
- [Examples](EXAMPLES.md)
- [Implementation Guide](IMPLEMENTATION.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- Reference implementation: [`reference/typescript/`](reference/typescript/)
- Conformance suite: [`tests/conformance/`](tests/conformance/)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119),
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
