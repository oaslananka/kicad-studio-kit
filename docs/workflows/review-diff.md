# KiCad Review Diff

Text diffs alone are hard to review for hardware changes. The **KiCad: Generate
Diff Report** command produces a structural, KiCad-aware summary of what changed
between the working file and its last committed (`HEAD`) version, for local
review and PR workflows. It complements — and never replaces — the Git text diff,
and it makes no electrical-correctness claims.

## Using it

1. Open a `.kicad_sch` or `.kicad_pcb` file from a project under git.
2. Run **KiCad: Generate Diff Report** from the Command Palette (the command is
   gated on workspace trust because it shells out to `git`).
3. A Markdown report opens with the structural summary.

## What the report covers

- **Schematics:** components added, removed, and changed, including how many
  changes touched the component **value** or **footprint**, with the affected
  references listed.
- **PCBs:** before/after counts (with deltas) for footprints, tracks, vias, and
  zones, plus **per-layer track counts** so copper changes are distinguishable
  by layer.

## Headless / CI use

The summary engine in `src/diff/kicadDiffSummary.ts` is free of editor APIs, so
the same machine-readable summary and Markdown report can be produced in a
headless CI/PR context from two file snapshots. Large files are guarded: inputs
above the scan-size limit are reported as `truncated` instead of being parsed.

## Scope

This is the minimal-useful first iteration (issue #401). Rendered visual
overlays (SVG/PNG screenshots of the board/schematic) and an optional
AI risk summary grounded in those artifacts are tracked as follow-up work; the
structural summary above is the grounding source any such summary must use.
