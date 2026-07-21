# KiCad 10.0.5 RC1 client canary evidence

- **Recorded:** 2026-07-21
- **Repository commit:** `3d590f2337c5aee724de3f7fea864c3662faed57`
- **Host:** `ops-vps-2`, Ubuntu 24.04
- **Fixture:** `packages/kicad-fixtures/fixtures/clean-led-kicad10`
- **Stable control:** KiCad 10.0.4
- **Preview candidate:** KiCad 10.0.5 RC1

## Source artifacts

Both binaries were downloaded from the official KiCad Linux AppImage release
surface and extracted without FUSE.

| Artifact                               |       Bytes | SHA-256                                                            |
| -------------------------------------- | ----------: | ------------------------------------------------------------------ |
| `kicad-10.0.4-x86_64.AppImage.tar`     | 480,457,728 | `4b1da0156cb1d180ba4a672e9a9981672390545c3b3b4575382b1662e959b220` |
| `kicad-10.0.5-rc1-x86_64.AppImage.tar` | 475,209,216 | `43704e7b2a1b592e1b1811d0f77819e09b36dcfc039f0b1f41252957a8b9a83c` |

## Result

| Probe                     | 10.0.4                | 10.0.5 RC1                                    |
| ------------------------- | --------------------- | --------------------------------------------- |
| Version discovery         | `10.0.4`              | `10.0.5` (`10.0.5-rc1` in generated metadata) |
| Top-level CLI help        | PASS                  | PASS; no surface drift                        |
| PCB export help           | PASS                  | PASS; no surface drift                        |
| PCB import help           | PASS                  | PASS; no surface drift                        |
| Schematic export help     | PASS                  | PASS; no surface drift                        |
| PCB DRC JSON              | 17 fixture violations | 17 fixture violations                         |
| Schematic ERC JSON        | 0 violations          | 0 violations                                  |
| BOM and netlist           | PASS                  | PASS                                          |
| Gerber and drill          | PASS                  | PASS                                          |
| Schematic and PCB PDF     | PASS                  | PASS                                          |
| STEP and board statistics | PASS                  | PASS                                          |

The PCB importer format list remained `auto`, `pads`, `altium`, `eagle`,
`cadstar`, `fabmaster`, `pcad`, and `solidworks`. Allegro remains absent from the
CLI surface and therefore remains capability-blocked in KiCad Studio.

Generated text and plot files differ in version/date headers and PDF producer
metadata, so byte-for-byte hashes are not used as the compatibility criterion.
The command surface, output inventory, and semantic DRC/ERC/board statistics
were stable.

## Ownership and release interpretation

The permanent real-KiCad canary belongs to
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/). Its checked-in
10.0.4 report records 31 passing canary steps and one intentional optional
Allegro-import skip. This Studio-side RC probe verifies the client-facing command
contract only.

KiCad 10.0.4 remains the stable, release-blocking baseline. KiCad 10.0.5 RC1 is
non-blocking preview evidence. Do not update `kicad.latestVerified` to 10.0.5
until the final release is published and passes the owning canary.
