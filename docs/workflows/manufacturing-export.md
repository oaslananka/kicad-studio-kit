# Manufacturing Export Workflow

KiCad Studio separates executable quality gate actions from documentation links.
Use **Run gate** from the Quality Gates view to execute schematic,
connectivity, placement, PCB transfer, or manufacturing checks. Use **Open
docs** to inspect this workflow reference without starting a gate run.

The manufacturing export gate expects the active KiCad project to be selected,
then validates the project state before release packaging. DRC and ERC findings
remain real project diagnostics: the extension reports them as gate evidence and
does not suppress or reinterpret board or schematic rule violations.

When live KiCad IPC is unavailable, read-only file-backed capabilities can still
surface diagnostics, BOM, netlist, and export-readiness evidence. Write or apply
actions remain disabled until the MCP server advertises the required live/write
capability.

## Prepare Manufacturing Release

The **KiCad Studio: Prepare Manufacturing Release** wizard turns the separate
export and quality-gate actions into one auditable, evidence-backed release
bundle.

1. Pick a variant (or the default), then choose **Create release bundle** or
   **Preview (dry run)**. Dry-run reports the planned output folder, KiCad CLI
   version, source commit, and quality-gate status without exporting or writing
   any files.
2. Blocking quality gates (`FAIL`/`BLOCKED`) stop the release before any
   artifacts are produced.
3. The output folder is validated through the central guarded-operation layer, so
   it cannot escape the workspace (no `..` traversal or symlink escape).
4. A successful release writes the manufacturing artifacts plus two evidence
   files:
   - `release-manifest.json` — schema-versioned record of the KiCad Studio
     extension version, KiCad CLI version and capability snapshot, MCP server
     version (when connected), git commit/branch/tag and dirty state, project
     files, per-artifact SHA-256 hashes, and the DRC/ERC quality-gate summaries.
   - `RELEASE-SUMMARY.md` — a human-readable summary of the same evidence.
5. If the release fails partway, the folder is marked with
   `RELEASE-INCOMPLETE.txt` so partial artifacts are never mistaken for a
   finished bundle.

Unsupported outputs are never skipped silently; the export step surfaces the
KiCad CLI capabilities that were available when the bundle was produced.
