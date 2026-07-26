# KiCad 10.0.5 stable client compatibility evidence

- **Recorded:** 2026-07-26
- **KiCad Studio issue:** [#558](https://github.com/oaslananka/kicad-studio-kit/issues/558)
- **Owning canary repository:** [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/)
- **Canary source commit:** `e3536e4a0c671e9e89ddbed996dd75fde7328120`
- **Host:** `ops-vps-3`, Ubuntu 24.04, Linux `6.8.0-136-generic`, x86-64
- **Fixture package:** published/shared KiCad fixture corpus used by KiCad MCP Pro
- **Promoted stable baseline:** KiCad 10.0.5
- **Historical preview evidence:** [KiCad 10.0.5 RC1](../../kicad-10-0-5-rc1/2026-07-21/summary.md)

## Official release artifact

The final Linux AppImage was downloaded from the official
`KiCad/kicad-source-mirror` 10.0.5 GitHub release and verified before extraction.

| Artifact                           |       Bytes | SHA-256                                                            |
| ---------------------------------- | ----------: | ------------------------------------------------------------------ |
| `kicad-10.0.5-x86_64.AppImage.tar` | 481,770,496 | `af65bb1fd5ee2730df860bc2a8c49f507a64c83c15c2ce13927eec74d38eba8f` |

The extracted `kicad-cli version` command reported `10.0.5`. `ldd` reported no
missing dynamic libraries for the bundled CLI.

## Canary command

The owning repository requires uv `0.10.8`; the canary used that exact toolchain
without changing the host-global uv installation:

```bash
KICAD_CANARY_KICAD_CLI=/var/tmp/kicad-10.0.5-stable/kicad-cli \
  mise exec uv@0.10.8 -- uv run --all-extras \
    python scripts/kicad_canary.py run \
    --artifacts /var/tmp/kicad-10.0.5-stable/canary \
    --kicad-range 10.0.x
```

Result:

```text
KiCad canary passed for 10.0.x; artifacts written to /var/tmp/kicad-10.0.5-stable/canary.
```

## Result summary

| Check                              | Result                          |
| ---------------------------------- | ------------------------------- |
| Version discovery                  | PASS — `10.0.5`                 |
| Total canary steps                 | 31                              |
| Required passed steps              | 30                              |
| Intentional optional skips         | 1 — `allegro-import-capability` |
| Failed steps                       | 0                               |
| Failing fixtures                   | none                            |
| Manufacturing exports              | enabled and produced            |
| Path-with-spaces and Unicode paths | PASS                            |
| Read-only output failure behavior  | PASS — expected non-zero result |

The optional Allegro probe remains a non-failing skip because final 10.0.5
`kicad-cli pcb import --help` still does not advertise `allegro`. The detected
importer tokens were `auto`, `pads`, `altium`, `eagle`, `cadstar`, `fabmaster`,
`pcad`, and `solidworks`, matching the checked-in RC1 boundary.

## Covered surface

The final canary produced and validated:

- clean and intentionally dirty DRC/ERC JSON reports;
- schematic and PCB PDF, SVG, and DXF outputs;
- BOM, KiCad S-expression netlist, Python BOM, and SPICE netlist outputs;
- Gerber, drill, and IPC-2581 manufacturing outputs;
- STEP, STEPZ, BREP, GLB, STL, and rendered PNG outputs;
- board statistics for ordinary, path-with-spaces, and Unicode workspaces;
- PADS capability availability and the intentional Allegro capability absence;
- deterministic failure for an unwritable output directory.

The clean fixture retained 17 DRC violations and 4 unconnected items, matching
the semantic shape recorded by the RC1 evidence. The intentionally dirty DRC
fixture retained 12 violations and 3 unconnected items. Both ERC fixtures
produced one-sheet reports with the expected clean/violation exit behavior.
No covered client-facing semantic regression was observed between RC1 and the
final release.

## Evidence bundle

A normalized tar archive of the generated canary directory was produced for
reproducibility review:

| Artifact     |     Bytes | SHA-256                                                            |
| ------------ | --------: | ------------------------------------------------------------------ |
| `canary.tar` | 1,095,680 | `b9c8d7d2c2174e441ff35c5cda1bb873991c47037f03305ab0fc85eb95522f1b` |

The full generated bundle is intentionally not committed because it contains
reproducible reports, workspace copies, logs, and binary export artifacts. This
summary freezes the source commit, command, official input digest, result counts,
semantic observations, and bundle digest needed to reproduce and compare it.

## Promotion decision

KiCad 10.0.5 is the verified stable patch baseline for the existing `10.0.x`
primary support line. The RC1 report remains historical evidence, but there is
no longer an active patch preview in `compatibility.yaml`. KiCad 11 readiness
remains separate and is not promoted by this evidence.
