# Policy Packs

A policy pack is a versioned, reusable, rules-as-code definition of a team or
manufacturer's standards for a KiCad project — approved constraints,
documentation requirements, manufacturing gates, and release criteria. Policy
packs are evaluated locally and in CI; the evaluator is editor-free so the same
result can be produced headlessly.

Policy packs **do not replace** native KiCad DRC rules, hard-code no specific
manufacturer's requirements, and never require AI. Any AI/MCP explanation must
be grounded in the machine-readable result described here.

## File format

A project opts in by adding `.kicad-studio/policy-pack.json`:

```json
{
  "schemaVersion": 1,
  "name": "Acme Class-2",
  "version": "1.0.0",
  "rules": [
    {
      "id": "drc-clean",
      "description": "No DRC violations permitted",
      "type": "maxDrcViolations",
      "severity": "error",
      "max": 0
    },
    {
      "id": "erc-budget",
      "type": "maxErcViolations",
      "severity": "warning",
      "max": 5
    },
    {
      "id": "required-docs",
      "type": "requiredFiles",
      "severity": "error",
      "files": ["README.md", "docs/assembly.md"]
    },
    {
      "id": "fab-artifacts",
      "type": "requiredArtifacts",
      "severity": "warning",
      "artifacts": ["gerbers", "drill", "bom"]
    },
    {
      "id": "no-deprecated-footprints",
      "type": "forbiddenFootprints",
      "severity": "error",
      "patterns": ["Deprecated:*", "*:TestOnly_*"]
    }
  ]
}
```

## Rule types

| Type | Parameters | Evaluated against |
| --- | --- | --- |
| `maxDrcViolations` | `max` | DRC violation count |
| `maxErcViolations` | `max` | ERC violation count |
| `requiredFiles` | `files[]` | project files present |
| `requiredArtifacts` | `artifacts[]` | generated artifacts present |
| `forbiddenFootprints` | `patterns[]` (glob `*`) | board footprint library ids |

## Severity and results

Each rule has a `severity` of `error`, `warning`, or `advisory`, and evaluates to
`pass`, `fail`, or `unknown` (when the supporting fact is unavailable). The
overall result is **fail only when an `error`-severity rule fails**; warnings and
advisories never block. Results are emitted as machine-readable data and a
human-readable Markdown report.

## Local and CI use

The evaluator (`src/policy/policyPack.ts`) takes a parsed pack plus a context of
project facts (DRC/ERC counts, present files, artifacts, footprints) and returns
the evaluation and report. Because it has no editor dependency, a CI job can read
the pack, gather the same facts, and fail the build when the overall result is
`fail`.

## Integration

Policy results are designed to feed the BoardReadyOps readiness scorecard and to
gate the Fabrication Release Wizard before a final bundle is produced. Those
integration surfaces consume the evaluation output rather than re-implementing
rule logic.
