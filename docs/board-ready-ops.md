# BoardReadyOps

BoardReadyOps is a static analysis tool that checks a KiCad board design against a specification file before manufacturing. It validates clearance, track width, hole size, drill alignment, silkscreen overlap, and other fabrication constraints.

BoardReadyOps runs as an external CLI tool (`npx boardreadyops`) and reports findings to the VS Code Problems panel.

## Prerequisites

- **Node.js** 20+ (to run the `boardreadyops` CLI via `npx`)
- The CLI is resolved automatically — no separate install step required.

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for `boardreadyops`.

| Setting                              | Type    | Default | Description                                                                                         |
| ------------------------------------ | ------- | ------- | --------------------------------------------------------------------------------------------------- |
| `kicadstudio.boardReadyOps.enabled`  | boolean | `false` | Enable BoardReadyOps checks for the active board.                                                   |
| `kicadstudio.boardReadyOps.specFile` | string  | `""`    | Path to the board specification file (JSON or YAML). Leave empty to use the project's default spec. |

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P`) or the KiCad Studio panel.

| Command ID                             | Title                                | Action                                                     |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `kicadstudio.boardReadyOps.check`      | BoardReadyOps: Check Board Readiness | Run checks on the active project.                          |
| `kicadstudio.boardReadyOps.plan`       | BoardReadyOps: Plan Remediation      | Build a structured remediation plan from current findings. |
| `kicadstudio.boardReadyOps.configure`  | BoardReadyOps: Configure Checks      | Open BoardReadyOps settings.                               |
| `kicadstudio.boardReadyOps.showReport` | BoardReadyOps: Show Readiness Report | Display the last check report.                             |
| `kicadstudio.boardReadyOps.openDocs`   | BoardReadyOps: Open Documentation    | Open this page in a browser.                               |

## Usage

1. Enable BoardReadyOps in settings: `kicadstudio.boardReadyOps.enabled → true`.
2. (Optional) Set `kicadstudio.boardReadyOps.specFile` to a custom spec path.
3. Open a KiCad project (a directory containing a `.kicad_pro` file).
4. Run **BoardReadyOps: Check Board Readiness** from the Command Palette.
5. Review findings in the Problems panel (`Ctrl+Shift+M`).

## Results

Each finding has a severity level:

| Severity   | Problems Panel | Meaning                                  |
| ---------- | -------------- | ---------------------------------------- |
| `critical` | Error          | Design cannot be manufactured.           |
| `high`     | Error          | Major violation that must be fixed.      |
| `medium`   | Warning        | Violation that should be reviewed.       |
| `low`      | Warning        | Minor issue or best-practice suggestion. |
| `info`     | Information    | Informational observation.               |

Findings are scoped to the file and line number of the violating design element when available.

## Release Readiness Scorecard

BoardReadyOps findings roll up into a release **readiness scorecard** that
answers "is this board ready to ship?" across multiple dimensions rather than a
single check. The scorecard engine (`src/scorecard/readinessScorecard.ts`) is
editor-free, so the same result can be produced in VS Code and in CI.

Each **dimension** carries a `pass` / `warn` / `fail` / `not-applicable` status:

- design checks (DRC/ERC, BoardReadyOps findings)
- manufacturing readiness
- assembly readiness
- documentation readiness
- release-artifact readiness
- policy compliance (see `docs/policies.md`)
- procurement / BOM readiness (see `docs/bom-risk.md`)

The result model is stable and machine-readable:

```json
{
  "project": "example.kicad_pro",
  "status": "fail",
  "score": 72,
  "dimensions": [],
  "blockingFindings": [],
  "warnings": [],
  "artifacts": [],
  "toolVersions": {}
}
```

The score never hides a hard failure: any failed dimension or any
`critical`/`high` blocking finding forces an overall `fail`, even when the
numeric score is high. Each dimension and finding carries a remediation hint, and
reports export to both Markdown and HTML so CI can publish the scorecard as an
artifact. Any AI-generated remediation plan must be grounded in these findings.

## Manufacturing release gate

When `kicadstudio.boardReadyOps.enabled` is `true`, the Manufacturing Release
Wizard treats BoardReadyOps as a release gate in addition to the existing
project quality gates. Before any manufacturing package is exported, KiCad
Studio:

1. runs `boardreadyops doctor --format json` and rejects unsupported or
   malformed contracts;
2. runs the structured readiness check and blocks on a failed readiness result
   or any `critical`/`high` finding; and
3. verifies the project's `build/boardreadyops-release` evidence bundle.

A numeric readiness score cannot override a blocking finding. Missing, stale,
malformed, or unverified evidence fails closed while BoardReadyOps is enabled.
If BoardReadyOps is disabled, the Manufacturing Release Wizard keeps its
existing behavior and does not require BoardReadyOps.

A successful verification is recorded as a `BoardReadyOps` quality-gate entry
in the generated release manifest and summary. The release UI reports counts
and verification state only; it does not surface raw CLI payloads or private
artifact paths.
