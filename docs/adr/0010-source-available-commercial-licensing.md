# ADR-0010 - Source-Available and Commercial Licensing

**Status:** Accepted
**Date:** 2026-09-14

## Context

KiCad Studio Kit was previously published under the MIT License. That permitted
unrestricted commercial reuse and supported OpenSSF FLOSS badge claims.

The project now wants to remain publicly inspectable and available for
noncommercial use while reserving commercial use of new project-authored source
revisions for separately negotiated licensing. Previously published MIT releases
cannot be retroactively withdrawn, and third-party material keeps its own terms.

## Decision

Current project-authored source is licensed under PolyForm Noncommercial 1.0.0.
Commercial use requires a separate written commercial license. Earlier revisions
already published under MIT remain usable under their original MIT terms.

Third-party material is not relicensed. The bundled KiCanvas viewer remains MIT.
Non-trivial external code contributions require both DCO sign-off and a reviewed
CLA before merge so future commercial licensing remains possible.

## Consequences

- Describe current code as source-available, not OSI-approved open source.
- Treat OpenSSF Best Practices Silver evidence as historical MIT-period evidence.
- Keep package metadata, VSIX license files, docs, and release surfaces aligned.
- Preserve all third-party notices and licenses independently.
