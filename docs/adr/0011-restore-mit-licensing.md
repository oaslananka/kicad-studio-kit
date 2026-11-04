# ADR-0011 — Restore MIT Licensing

- **Date:** 2026-11-04
- **Status:** Accepted
- **Supersedes:** [ADR-0010](0010-source-available-commercial-licensing.md)

## Context

KiCad Studio Kit was MIT-licensed originally. ADR-0010 changed new
project-authored source to PolyForm Noncommercial 1.0.0 on 2026-09-14,
with separate commercial licensing. The maintainer has chosen to return
current project-authored source to a standard permissive open-source license.

## Decision

Use the OSI-approved MIT License for current project-authored source,
including the root and shipped extension license files, package metadata,
Marketplace documentation, README badges and contribution terms. No
commercial-use restriction or mandatory dual-licensing CLA applies to
new MIT contributions. Retain DCO sign-off, third-party notices and
all security, packaging and release-quality gates.

Earlier releases keep their original distribution terms; a current-source
license change does not rewrite immutable historical release artifacts.
The historical PolyForm period remains documented without implying it
is the present policy.

## Consequences

- MIT permits commercial distribution and reuse under its notice conditions.
- Contributor documentation and policy checks must require MIT, not PolyForm.
- Existing OpenSSF Best Practices Silver evidence remains historically
  accurate; MIT restoration alone does not verify or reissue a live badge.
- Future published extension artifacts must include the updated MIT notice.
- The repository does not claim third-party code is relicensed.
