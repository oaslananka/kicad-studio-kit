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
