# KiCad 10.0.7 Feature Parity

The machine-readable capability contract is
[`compatibility.yaml`](../../compatibility.yaml) under
`kicad10FeatureParity`, reviewed 2026-10-20.
This document records the verified 10.0.7 patch baseline without rewriting
the historical [10.0.5 full matrix](kicad-10-0-5-feature-parity.md).

## Current validation

[Real KiCad 10.0.7 canary evidence](../evidence/kicad-10-0-7/2026-10-20/summary.md)
confirms CLI version discovery, error reporting, BOM/netlist, manufacturing
exports, 3D output, Unicode/path handling and an unchanged semantic differential.
All 32 recorded outcomes met their expectations, including one intentional
Allegro importer skip. The PCB fixture's known DRC findings do not represent
a new KiCad 10.0.7 compatibility failure.

## Feature and product boundaries

| Capability | Studio support contract |
| --- | --- |
| Altium, Cadstar, Eagle, Fabmaster, PADS, PCAD, SolidWorks | CLI help-gated importer; maintain corresponding test and fixture evidence |
| Allegro | **Blocked** in the stable CLI (GUI import is separate); remain capability gated |
| gEDA/Lepton | Probe-gated; do not claim without an installed CLI command |
| DRC/ERC, BOM/netlist | Supported CLI workflows; report real violations rather than masking them |
| Gerber, drill, IPC-2581, STEP/STEPZ, 3D formats | Native CLI command- and output-gated; real canary artifacts produced |
| KiCad native graphical editing | Native KiCad application responsibility; not replaced by Studio |
| IPC live editing | Separate live-session acceptance required; this CLI test does not prove it |
| KiCad 11 | Nightly/RC readiness only; not part of 10.0.7 release promotion |

As with the previous baseline, each `supported` item is backed by an
explicit test, fixture, command probe or smoke path in the compatibility
registry. Any `blocked` or `partial` capability remains gated; the new patch
does not broaden the advertised compatibility range.

Official references:
[10.0.7 release notes](https://www.kicad.org/blog/2026/10/KiCad-10.0.7-Release/),
[KiCad source tag](https://github.com/KiCad/kicad-source-mirror/releases/tag/10.0.7).
