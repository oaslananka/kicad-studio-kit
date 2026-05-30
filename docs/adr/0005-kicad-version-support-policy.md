# ADR 0005: KiCad Version Support Policy

Status: Accepted

Date: 2026-05-30

## Context

KiCad Studio Kit depends on `kicad-cli` for core extension workflows: DRC/ERC,
BOM/netlist extraction, exports (Gerbers, drill, 3D PDF, STEP, ODB++), and
design variant support. KiCad releases new major versions on an annual cycle,
and upstream support for older versions ends when a new major is released.

Before this ADR, support levels were documented in `compatibility.yaml` and
`docs/support-matrix.md` but the policy for adding, deprecating, and removing
KiCad support lines was not formalized.

## Decision

Adopt a three-tier KiCad version support model:

| Tier        | Meaning                                                        | CI Requirement        | Feature Gate |
| ----------- | -------------------------------------------------------------- | --------------------- | ------------ |
| Primary     | Optimized target. All features must work.                      | Required release gate | Full         |
| Deprecated  | Best-effort. Core workflows remain available; no new features. | Scheduled canary      | Limited      |
| Unsupported | Not tested. No feature claims.                                 | None                  | Disabled     |

Policy rules:

1. **Primary designation** — Assigned to the latest KiCad stable major
   version. All extension features must be validated against this version
   before release.

2. **Deprecation trigger** — When a new KiCad major version is released,
   the previous major moves from Primary to Deprecated. The version before
   that moves from Deprecated to Unsupported.

3. **Deprecation period** — A deprecated version keeps best-effort
   compatibility for approximately one KiCad release cycle. Removal
   requires a release note and a scheduled canary lane in CI that gathers
   failure evidence before the version is marked Unsupported.

4. **Runtime probing** — The extension probes `kicad-cli --version` and
   feature-specific help output before enabling commands. A version line
   alone is not sufficient to enable advanced exports.

5. **CI requirements** — Primary versions run as a required release gate.
   Deprecated versions run as scheduled non-blocking canary lanes.
   Unsupported versions have no CI commitment.

## Consequences

- Positive: Users on older KiCad versions get clear messaging about what is
  supported and what is best-effort.
- Positive: CI catches KiCad CLI regressions against the primary version
  before release.
- Positive: The canary lane provides data-driven evidence for when to drop
  deprecated versions.
- Negative: Maintaining backward compatibility with deprecated versions
  adds test and documentation overhead.
- Negative: Users on deprecated versions may see degraded functionality
  without a clear migration path beyond "upgrade KiCad."

## Alternatives Considered

- **Support every KiCad version indefinitely**: Rejected. Would multiply
  test matrix and documentation burden. No upstream project does this.
- **Single-version support (latest only)**: Rejected. Would break existing
  users during the annual KiCad release cycle. The deprecated tier provides
  a transition period.

## Related

- Source of truth: `compatibility.yaml`.
- Documented in `docs/support-matrix.md`.
- KiCad support lines tracked in `compatibility.yaml` under `kicad.versions`.
- Issue #67.
