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
  `.tssn` / `.ast.json` fixtures) usable by any language implementation

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

The specification's Security Considerations section (to be added
before 1.0) will address:

- Parser resource limits against pathological inputs
  (deeply-nested declarations, extremely long identifiers, oversized
  literal unions)
- Handling of potentially-hostile comments containing control
  characters or injection payloads
- Guidance for implementations that consume TSSN from untrusted
  sources (LLM input, user-submitted schemas)

These considerations are not blocking for 0.8 but are a release gate
for 1.0.

## 9. Editorial Team

- **Editor:** Benjamin Zimmer
- **Automated Reviewers:** `spec-editor`, `conformance-reviewer`,
  `test-auditor` (see `.claude/agents/`)

Contributors who add substantial work to the reference implementation
or conformance suite are recognized in release notes.

## 10. Open Questions for the Editor

Items that affect the shape of 1.0 and need explicit resolution before
stable release. Captured here rather than in issues so they remain
visible during editorial review.

1. **Unicode in `simple_id`**: EBNF restricts to ASCII, but the
   informative note at the end of Appendix A mentions Unicode support.
   Resolve by either broadening the EBNF or making the note normative.
2. **`type X = int;`** shadowing a base type: currently accepted; should
   the validator warn?
3. **Float literals in unions**: currently rejected; is that final?
4. **Blank-line detachment** for annotations: currently attaches
   comments with zero blank lines; is one blank line enough to
   detach?
5. **Trailing `;` after `}`**: currently rejected; keep strict or
   accept leniently?
6. **`@materialized` + `@updatable`** interaction: rejected as of
   v0.8 Section 2.9.3. Is that the final portable rule, or should the
   spec defer to database-specific semantics?
7. **Composite PK ordering semantics**: is `PK(a, b)` equivalent to
   `PK(b, a)` for equality, or does order define a normative index
   shape that generators must preserve?
8. **Type alias scope**: Spec Section 2.2.7 says aliases are
   "file-level" but TSSN has no formal file/module concept. Rephrase
   in terms of a single parse() invocation.
9. **Reserved-keyword list**: v0.8 introduces `type` and `view` as
   top-level keywords. A consolidated reserved-word section is
   missing; without it, future additions (`enum`? `domain`?) will be
   harder to plan.
10. **`@computed` on nullable columns**: legal? The spec shows no
    example. Assume yes; document explicitly.
11. **Mixed-literal unions (`'a' | 1`)**: currently accepted at parse
    time with no validator warning. Was this intentional or should
    the validator flag it?
12. **Unknown base-type identifiers**: currently accepted with no
    diagnostic (e.g., `id: Foobar;` parses as a BaseType). Should
    the validator reject types not in the spec's 14-entry base type
    list?
13. **File-level `@schema` propagation**: the canonical EXAMPLES.md
    Section 16 example writes `@schema: app` at the top of the file
    and expects every subsequent declaration to inherit it. But per
    Section 2.7, `@schema` attaches to the immediately following
    declaration only, and intervening `type` aliases break the chain.
    Either extend the spec to make file-top `@schema` sticky across a
    parse unit, or update EXAMPLES.md so the propagation is explicit.

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
