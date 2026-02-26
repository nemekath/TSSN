# Security Policy

## Scope

LINDT is a **specification**, not executable software. There is no code to exploit directly. Security concerns relate to how the specification might lead implementations to introduce vulnerabilities.

## Reporting Specification Vulnerabilities

If you discover that the LINDT specification contains language or patterns that could lead implementations to create security vulnerabilities (e.g., SQL injection through improper identifier handling, or insufficient escaping guidance), please report it responsibly.

**Contact:** [github@just-do-it.mozmail.com](mailto:github@just-do-it.mozmail.com)

Please include:
- The affected specification section
- A description of the potential vulnerability
- An example demonstrating the issue
- Suggested mitigation or specification change

## Response Timeline

- **Acknowledgment:** Within 7 business days
- **Assessment:** Within 30 days
- **Resolution:** Spec update within 90 days for confirmed issues

## Responsible Disclosure

We request a 90-day disclosure window for confirmed specification-level vulnerabilities to allow time for a coordinated spec update and implementor notification.

## Implementation Security

LINDT implementations (parsers, generators, database introspectors) are maintained by their respective authors. Security issues in specific implementations should be reported to those projects directly.

The LINDT specification provides guidance but does not guarantee that implementations built upon it are secure. Implementors are responsible for:
- Input validation and sanitization
- Proper SQL escaping when generating queries from LINDT schemas
- Safe handling of quoted identifiers (Section 2.8)
- Protection against injection attacks

## Not in Scope

The following are not security issues:
- Typos or formatting errors in the specification
- Feature requests or enhancement proposals
- General questions about the specification

For these, please use [GitHub Issues](https://github.com/nemekath/LINDT/issues) or [Discussions](https://github.com/nemekath/LINDT/discussions).
