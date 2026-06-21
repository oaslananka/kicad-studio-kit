# Release Candidate Smoke-Test Checklist

A maintainer runs this manual checklist against a packaged VSIX before tagging or
publishing a release candidate. It complements — it does not replace — the
automated CI gates ([branch protection](architecture/branch-protection.md)) and
the [release runbook](release.md).

Record the run by copying the tables below into the release PR or a release
issue and filling in **Actual** / **Pass-Fail** / **Notes** for each step. Run on
each target OS where practical (Windows, macOS, Linux) and note OS-specific
differences.

## Environment

| Field | Value |
| --- | --- |
| Candidate version | |
| VSIX file / SHA-256 | |
| VS Code version | |
| OS | |
| KiCad CLI version (if installed) | |
| MCP server version (if connected) | |
| Date / tester | |

## Install and activation

| Step | Expected result | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Fresh install of the VSIX into a clean VS Code | Extension installs; activity-bar icon appears | | | |
| Upgrade install over the previous version | Settings/secrets preserved; no duplicate views | | | |
| Activation time on a sample project | Activates without error; under the perf budget | | | |
| Getting-started walkthrough on first install | Walkthrough opens once | | | |

## Project discovery and scoping

| Step | Expected result | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Open a single-project workspace | Project tree shows the project | | | |
| Open a multi-project / multi-root workspace | All projects discovered; active project shown in status bar | | | |
| Switch active project (status bar / palette) | Tree, variants, diagnostics, and context update | | | |
| Open a workspace with no KiCad project | No errors; project views stay empty | | | |

## Diagnostics, viewer, and export

| Step | Expected result | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| View a schematic and a PCB in the built-in viewer | Both render and fit to screen | | | |
| Run DRC and ERC (KiCad CLI installed) | Findings appear in Problems panel | | | |
| Export Gerbers / BOM / PDF | Files produced in the output folder | | | |
| Prepare Manufacturing Release — dry run | Preview shown; nothing written | | | |
| Prepare Manufacturing Release — create | `release-manifest.json` + `RELEASE-SUMMARY.md` produced | | | |
| BoardReadyOps / readiness scorecard | Scorecard reports per-dimension status | | | |
| Generate KiCad Diff Report on a committed file | Structural diff report opens | | | |

## Trust and failure paths

| Step | Expected result | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Restricted (untrusted) workspace | Write/export/MCP actions are disabled with a clear reason | | | |
| Grant workspace trust | Gated features become available | | | |
| KiCad CLI **not** installed / wrong path | Capability-gated commands warn; no crash | | | |
| MCP endpoint unavailable | MCP views show disconnected; no blocking errors | | | |
| Malicious output path (`..`, absolute, symlink) | Guarded operation rejects it with a safe message | | | |

## Marketplace and Open VSX

| Step | Expected result | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| VSIX identity / metadata | `oaslananka.kicadstudiokit` with the candidate version | | | |
| Marketplace listing (after publish) | Version, icon, and README render correctly | | | |
| Open VSX listing (after publish) | Same VSIX payload published | | | |
| Marketplace/Open VSX indexing delay | Treated as advisory, not a publish failure | | | |

## Sign-off

| Field | Value |
| --- | --- |
| Overall result (pass / pass-with-notes / fail) | |
| Blocking issues | |
| Maintainer sign-off | |
