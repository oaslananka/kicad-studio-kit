# Issue #491 — KiCad 10 patch baseline design

## Decision

Promote the Studio client compatibility baseline from KiCad 10.0.3 to the
verified stable KiCad 10.0.4 release. Record KiCad 10.0.5 RC1 as a separate,
non-blocking patch canary. Do not add a second heavyweight KiCad installation
workflow to this repository.

## Ownership boundary

KiCad MCP Pro owns real `kicad-cli`, GUI IPC, and transport canaries. Its
checked-in 10.0.4 report records 31 passing steps and one intentional optional
Allegro-import skip. KiCad Studio Kit owns the extension-facing compatibility
contract, deterministic fixtures, mocked capability probes, generated support
surfaces, and cross-repository artifact checks.

The historical `kicad-10-0-3-regressions` fixture name remains unchanged. It
identifies the patch that introduced the regression corpus; it is not the
current support baseline.

## Stable baseline

`compatibility.yaml` must keep these values aligned:

- `kicad.latestVerified`;
- `kicad10FeatureParity.baseline`;
- the feature-parity documentation path;
- the official release notes and release tag.

The compatibility checker fails when those values drift or when the referenced
document does not exist.

## Prerelease evidence

`kicad.patchCanary` records the current patch prerelease without changing stable
support claims. The record is valid only when:

- its state is `preview`;
- `blocking` is `false`;
- its patch version is newer than the stable baseline;
- the official release-note URL and a checked-in evidence summary exist.

The 2026-07-21 RC1 probe uses the official Linux AppImages and exercises version
and help discovery plus DRC, ERC, BOM, netlist, Gerber, drill, schematic/PCB PDF,
STEP, and board-statistics generation against the `clean-led-kicad10` fixture.

## Release interpretation

KiCad 10.0.4 is the release-blocking stable baseline. KiCad 10.0.5 RC1 is
informational only. A future stable 10.0.5 release requires a new stable canary
result before `latestVerified` is promoted.
