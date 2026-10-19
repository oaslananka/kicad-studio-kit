# KiCad 10.0.7 stable CLI acceptance — AMD2700X Ubuntu

- **Recorded:** 2026-10-20
- **Primary release line:** KiCad 10.0.x
- **Executed version:** `/usr/bin/kicad-cli version` → `10.0.7`
- **Machine:** `amd2700x`, Ubuntu 24.04, Linux 7.0.0-38-generic, x86-64
- **Canary owner:** [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/)
- **Clean canary source SHA:** `48e82e44c7ec0850f74d861cece17d7149f17759`
- **Code isolation:** detached clean Git worktree, separate artifact directory; pre-existing working files were not modified.
- **Official [10.0.7 release notes](https://www.kicad.org/blog/2026/10/KiCad-10.0.7-Release/) and [source tag](https://github.com/KiCad/kicad-source-mirror/releases/tag/10.0.7):** confirmed; GitHub tag object `93a8a4827b0b2a01a6d1599733e6964e6ea94cf9`.

## Executed command

```bash
KICAD_CANARY_KICAD_CLI=/usr/bin/kicad-cli PYTHONPATH="$CLEAN_MCP_ROOT/src:$CLEAN_MCP_ROOT"   "$MCP_ORIGINAL_VENV/bin/python" scripts/kicad_canary.py run     --artifacts "$CANARY_ARTIFACTS" --kicad-range 10.0.x
```

The clean source tree used the existing installed Python dependencies, while
all CLI files were generated under an isolated `/tmp` artifact directory.
The installed Ubuntu KiCad package was used, **not** an independently downloaded
official AppImage; an AppImage digest is therefore not claimed.

## Results

| Validation | Observed result |
| --- | --- |
| KiCad CLI version | PASS — `10.0.7` |
| Canary result records | 32/32 expected outcomes `ok=true` |
| Executed probes | 31; zero failed |
| Optional skip | 1 — Allegro CLI importer not advertised in help |
| Failure fixture inventory | Empty |
| Manufacturing exports | Enabled and produced |
| Semantic differential | `match` |
| Deliberate error probes | Two expected violation exit codes (`5`); read-only destination failure code `4` |
| Generated reports | DRC, ERC, BOM, netlist, schematic/PCB PDFs, drill, Gerbers, IPC-2581, 3D exports, render and snapshots |
| Special paths | Paths with spaces and Unicode board statistics checked |

The existing synthetic `clean-led-kicad10` PCB fixture returned 17 DRC
violations and 4 unconnected items, matching the archived 10.0.5 baseline
count. Its schematic currently reports 3 ERC findings (2 dangling labels,
1 multiple-net-name warning) despite the fixture's legacy "clean" name.
The canary is green because the owning contract checks command behavior,
failure semantics, artifact inventory and differential shape; **it does not
establish that the fixture has no electrical design errors**. Updating the
verified *CLI compatibility patch* does not assert design correctness.

### Evidence integrity

- `summary.json` SHA-256: `8201e0ce8a83dc468efccd2ec1e752de24349e8e343cf533d346900090332748` (full; generated output kept outside Git)
- `failing-fixtures.txt`: empty
- Historical [10.0.5 AppImage result](../../kicad-10-0-5/2026-07-26/summary.md) retained unchanged.

The tested CLI surface supports promoting `kicad.latestVerified` to 10.0.7
for the 10.0.x primary line. This is not an endorsement of KiCad 11, a GUI IPC
live acceptance claim, or a multi-platform KiCad binary certification.
