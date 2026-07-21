# KiCad 10.0.4 stable client compatibility evidence

- **Recorded:** 2026-07-21
- **Repository commit:** `3d590f2337c5aee724de3f7fea864c3662faed57`
- **Host:** `ops-vps-2`, Ubuntu 24.04
- **Fixture:** `packages/kicad-fixtures/fixtures/clean-led-kicad10`
- **Previous baseline:** KiCad 10.0.3
- **Candidate stable baseline:** KiCad 10.0.4

## Source artifacts

Both controls came from the official KiCad Linux AppImage release surface and
were extracted without FUSE.

| Artifact                           |       Bytes | SHA-256                                                            |
| ---------------------------------- | ----------: | ------------------------------------------------------------------ |
| `kicad-10.0.3-x86_64.AppImage.tar` | 478,051,328 | `ec2e4de813f4f94c4bef21e6b612075368101ea6865f50ed77368b303bb9c0ca` |
| `kicad-10.0.4-x86_64.AppImage.tar` | 480,457,728 | `4b1da0156cb1d180ba4a672e9a9981672390545c3b3b4575382b1662e959b220` |

## CLI surface comparison

The following help surfaces were byte-identical between 10.0.3 and 10.0.4:

| Surface                       | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `kicad-cli --help`            | `71e0f1e77958d50aeeb617167eeef0acd07106b67c4606545dfc23ecab9e7049` |
| `kicad-cli pcb export --help` | `bf552d426d12b825cf056d052f663e6afd2646b07b86b7b897d66abdd11d596a` |
| `kicad-cli pcb import --help` | `3c86958b17b3c46caf0e6b8f8b0819a66595bcc54a7c7e5a24e8012d322682a9` |
| `kicad-cli sch export --help` | `4ce7af84379e001d4b57ce9cc2fb8deac1e9b8780564bebedadd54da9d006f08` |

The PCB importer list remained `auto`, `pads`, `altium`, `eagle`, `cadstar`,
`fabmaster`, `pcad`, and `solidworks`. Allegro remains absent and therefore
capability-blocked in KiCad Studio.

## Fixture result

| Probe                     | 10.0.3                | 10.0.4                |
| ------------------------- | --------------------- | --------------------- |
| PCB DRC JSON              | 17 fixture violations | 17 fixture violations |
| Schematic ERC JSON        | 0 violations          | 0 violations          |
| BOM and netlist           | PASS                  | PASS                  |
| Gerber and drill          | PASS                  | PASS                  |
| Schematic and PCB PDF     | PASS                  | PASS                  |
| STEP and board statistics | PASS                  | PASS                  |

The normalized board, pad, via, and component statistics had the same SHA-256:
`6d1a865cfb3260946ee1e2ff5284946d86a862757e4ba0cab2b937ab7eadd139`.
The only artifact-size difference was the schematic PDF producer metadata
(27,366 bytes versus 27,394 bytes); no command, option, output-inventory, DRC,
ERC, or board-statistics drift was observed.

## Owning canary evidence

The permanent real-KiCad canary belongs to
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/). Its checked-in
10.0.4 report records 31 passing steps, no failing fixtures, and one intentional
optional Allegro-import skip. That broader run covers additional import, 3D,
manufacturing, path-with-spaces, Unicode, and read-only-output surfaces.

This evidence supports promoting `kicad.latestVerified` and the feature-parity
baseline to 10.0.4. Historical `kicad-10-0-3-regressions` fixture IDs remain
unchanged because they identify the patch that introduced the regression corpus.
