# BoardReadyOps

BoardReadyOps is a static analysis tool that checks a KiCad board design against a specification file before manufacturing. It validates clearance, track width, hole size, drill alignment, silkscreen overlap, and other fabrication constraints.

BoardReadyOps runs as an external CLI tool (`npx boardreadyops`) and reports findings to the VS Code Problems panel.

## Prerequisites

- **Node.js** 22.14+ or 24.x (the supported engines of published BoardReadyOps 1.68.3)
- The CLI is resolved automatically — no separate install step required.

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for `boardreadyops`.

| Setting                              | Type    | Default | Description                                                                                         |
| ------------------------------------ | ------- | ------- | --------------------------------------------------------------------------------------------------- |
| `kicadstudio.boardReadyOps.enabled`  | boolean | `false` | Enable BoardReadyOps checks for the active board.                                                   |
| `kicadstudio.boardReadyOps.specFile` | string  | `""`    | Path to the board specification file (JSON or YAML). Leave empty to use the project's default spec. |

BoardReadyOps execution requires a trusted VS Code workspace. In Restricted Mode,
BoardReadyOps commands cannot launch the external CLI, and workspace-defined
BoardReadyOps settings are ignored until trust is granted.

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P`) or the KiCad Studio panel.

| Command ID                                 | Title                                             | Action                                                                                             |
| ------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `kicadstudio.boardReadyOps.check`          | BoardReadyOps: Check Board Readiness              | Run checks on the active project.                                                                  |
| `kicadstudio.boardReadyOps.plan`           | KiCad Studio: Show BoardReadyOps Remediation Plan | Build a structured remediation plan from current findings.                                         |
| `kicadstudio.boardReadyOps.reviewEvidence` | KiCad Studio: BoardReadyOps Review and Evidence   | Inspect local release verification, safely preview compatible review JSON, or open web governance. |
| `kicadstudio.boardReadyOps.configure`      | BoardReadyOps: Configure Checks                   | Open BoardReadyOps settings.                                                                       |
| `kicadstudio.boardReadyOps.showReport`     | BoardReadyOps: Show Readiness Report              | Display the last check report.                                                                     |
| `kicadstudio.boardReadyOps.openDocs`       | BoardReadyOps: Open Documentation                 | Open this page in a browser.                                                                       |

## Usage

1. Enable BoardReadyOps in settings: `kicadstudio.boardReadyOps.enabled → true`.
2. (Optional) Set `kicadstudio.boardReadyOps.specFile` to a custom spec path.
3. Open a KiCad project (a directory containing a `.kicad_pro` file).
4. Run **BoardReadyOps: Check Board Readiness** from the Command Palette.
5. Review findings in the Problems panel (`Ctrl+Shift+M`). The saved readiness report is scoped to the
   project that was checked; it is not displayed after changing projects or
   disabling BoardReadyOps. Retrying a check clears the cached report until
   the new check succeeds.
6. Use **KiCad Studio: Show BoardReadyOps Remediation Plan** for structured next actions.
   The cancellable CLI progress indicator closes before the action picker appears.
   Select an action to open its **complete fix steps and verification commands in an
   unsaved plaintext preview**; suggested commands are never executed automatically.
   The external plan is accepted only when its JSON status/exit code agrees with the
   CLI process result; malformed or contradictory plans are rejected.

7. Choose **KiCad Studio: BoardReadyOps Review and Evidence** in the Review Task Hub to
   verify local release evidence, preview review metadata (dry run only), or open the web
   governance dashboard. Web navigation requires a deliberate selection.

### Review JSON version gate

**Published BoardReadyOps 1.68.3 does not emit JSON** for `review publish --dry-run`
or `review verify`, even with `--format json`. Studio never parses this human output
as a review verdict. The preview requires compatible `doctor --format json` and a
version >=1.69.0 **plus** actual review JSON schema 1, matching tool/version, zero
exit, `success:true`, `dryRun:true`, SHA-256 digest and no review URL or run ID.
Any mismatch fails closed; unreleased upstream JSON is not production support.

The preview checks `run --format json` readiness, distinguishes critical/high blockers,
and displays an **unpublished, unapproved, unverified** digest as inert plaintext.
There is **no upload, token use, approval, signature, project edit or gate change**.
The web link opens the general dashboard, not an invented review-specific URL.
Actual manufacturer handoff still requires separate `release prepare` and verified
`release verify --format json` evidence. DRC/ERC gates remain independent.

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
2. runs the structured readiness check, rejects discrepancies between the CLI
   process exit code and JSON status/exit code, and blocks on a failed readiness
   result or any `critical`/`high` finding; and
3. verifies the project's `build/boardreadyops-release` evidence bundle,
   rejects disagreement between the CLI exit status and JSON `ok` verdict,
   and requires at least one verified artifact with no reported errors.
   Unsigned bundles remain permitted if the CLI has verified them without a
   required signing key; an invalid or failed signature is never accepted.

A numeric readiness score cannot override a blocking finding. Missing, stale,
malformed, or unverified evidence fails closed while BoardReadyOps is enabled.
If BoardReadyOps is disabled, the Manufacturing Release Wizard keeps its
existing behavior and does not require BoardReadyOps.

A successful verification is recorded as a `BoardReadyOps` quality-gate entry
in the generated release manifest and summary. The release UI reports counts
and verification state only; it does not surface raw CLI payloads or private
artifact paths.
