# TSSN Conformance Test Suite

This directory is the language-agnostic conformance suite for TSSN
v0.8. Any implementation — in any language — that wants to claim a
conformance level (L1, L2, L3 per Spec Section 5.1) runs its parser
and validator against the fixtures under the corresponding `levelN/`
directory and verifies that every fixture produces the expected
outcome.

The reference TypeScript implementation under
`reference/typescript/` runs this suite via
`reference/typescript/tests/conformance.test.ts`. A second
implementation in another language is expected to write its own
equivalent harness and read the same fixtures verbatim.

## Directory Layout

```text
tests/conformance/
├── README.md               (this file — the contract)
├── level1/                 (L1 Core fixtures)
│   ├── 001-name.tssn
│   ├── 001-name.expected.json
│   └── ...
├── level2/                 (L2 Standard fixtures)
└── level3/                 (L3 Extended fixtures)
```

Every fixture is a pair:

- `NNN-name.tssn` — the input TSSN source
- `NNN-name.expected.json` — the expected outcome in sidecar form

Both files MUST be present. Fixture file names start with a
three-digit zero-padded sequence number for deterministic ordering
and a short slug describing the feature under test.

## Expected-Sidecar Format

The `.expected.json` sidecar is intentionally much simpler than a
full AST dump. Its goal is to verify that an implementation parses
the fixture and reaches specific high-level conclusions — not to
pin every byte of the AST to a specific shape. This keeps the
suite portable across implementations that may legitimately use
different internal node structures.

### Positive fixture (schema must parse cleanly)

```json
{
  "kind": "positive",
  "description": "Short human-readable description of what the fixture exercises",
  "level": 1,
  "declarationCount": 2,
  "tables": [
    {
      "name": "Users",
      "columns": ["id", "email"],
      "schema": "auth"
    }
  ],
  "views": [
    {
      "name": "ActiveUsers",
      "columns": ["id", "email"],
      "materialized": false,
      "readonly": true
    }
  ],
  "aliases": [
    { "name": "Status" }
  ]
}
```

All fields except `kind`, `description`, and `level` are optional.
The harness asserts only what is present in the sidecar. An
implementation MAY expose additional AST detail that is not
described here; the harness MUST NOT fail on extra fields.

### Negative fixture (schema must be rejected)

```json
{
  "kind": "negative",
  "description": "Short description of why this input is invalid",
  "level": 2,
  "errorCodes": ["heterogeneous_union"]
}
```

Negative fixtures list one or more error codes that the
implementation MUST surface. The harness succeeds if at least every
listed code appears in the collected parse/validation errors. Extra
unexpected errors also cause a failure — if an implementation
reports `unknown_base_type` when the fixture expects
`heterogeneous_union`, the fixture fails.

Error code vocabulary is defined by the reference implementation in
`reference/typescript/src/validate.ts` and `errors.ts`. Other
implementations SHOULD use the same codes for interoperability. The
canonical codes are:

| Code | Meaning | Source |
|---|---|---|
| `unknown_base_type` | A base type identifier outside the 14-entry set | Spec 2.2.1–2.2.4 |
| `heterogeneous_union` | A union mixing string and numeric literals | Spec 2.2.6 |
| `alias_shadows_base_type` | An alias name collides with a base type | Spec 2.2.7 |
| `duplicate_type_alias` | Two aliases with the same name | Spec 2.2.7 |
| `duplicate_column` | Two columns with the same name in one decl | Spec 2.1 |
| `duplicate_declaration` | Two interfaces/views with the same qualified name | Spec 2.7 |
| `mixed_pk_forms` | Inline PRIMARY KEY + interface-level PK(...) on one table | Spec 2.5.1 |
| `unknown_column_in_constraint` | PK/UNIQUE/INDEX references nonexistent column | Spec 2.5.2 |
| `materialized_on_table` | @materialized on an interface, not a view | Spec 2.9 |
| `contradictory_view_annotations` | @readonly + @updatable or @materialized + @updatable | Spec 2.9.3 |
| `alias_self_reference` | `type A = A;` | Spec 2.2.7 |

Parse-time errors also surface through negative fixtures. These are
not validator codes but parser-level diagnostics; the harness
matches them against the raw message text. Use the `errorMessage`
field to match on a substring when no stable code applies:

```json
{
  "kind": "negative",
  "description": "A single literal is not a valid union",
  "level": 2,
  "errorMessage": "not a valid type"
}
```

Either `errorCodes` or `errorMessage` (or both) MUST be present on a
negative fixture.

## How an Implementation Claims a Level

An implementation claims **Level N** conformance by running every
fixture under `levelN/` and every fixture under `levelN-1/`,
`levelN-2/`, ... down to `level1/` and verifying each fixture
reaches the expected outcome. Failures at any level below the
claimed one invalidate the claim.

The reference TypeScript implementation currently passes all L1,
L2, and L3 fixtures and claims Level 3.

## Adding New Fixtures

When a new feature is added to the specification:

1. Add at least one positive fixture exercising the happy path
2. Add at least one negative fixture covering the most likely
   misuse or edge case
3. Place both under the conformance level that the feature belongs
   to, per the Spec 5.1.4 Conformance Matrix
4. Number the fixture using the next available `NNN` sequence in
   that level's directory
5. Update `reference/typescript/tests/conformance.test.ts` only if
   new expected-sidecar fields are needed — the harness should
   otherwise pick up new fixtures automatically via directory scan

## Stability

The fixture file names, the sidecar format, and the error-code
vocabulary are **normative** from v0.8 onward. Future spec versions
MAY add new fields and new codes. They MUST NOT remove or rename
existing ones within a major version. Breaking a fixture's expected
outcome counts as a breaking change and requires a major-version
bump.
