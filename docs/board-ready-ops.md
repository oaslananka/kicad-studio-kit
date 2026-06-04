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

| Command ID                             | Title                                | Action                            |
| -------------------------------------- | ------------------------------------ | --------------------------------- |
| `kicadstudio.boardReadyOps.check`      | BoardReadyOps: Check Board Readiness | Run checks on the active project. |
| `kicadstudio.boardReadyOps.configure`  | BoardReadyOps: Configure Checks      | Open BoardReadyOps settings.      |
| `kicadstudio.boardReadyOps.showReport` | BoardReadyOps: Show Readiness Report | Display the last check report.    |
| `kicadstudio.boardReadyOps.openDocs`   | BoardReadyOps: Open Documentation    | Open this page in a browser.      |

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
