# Issue 563: Bound PCM ZIP Extraction Resources

## Goal

Make direct PCM archive extraction deterministic and resource-bounded before untrusted ZIP content can affect the active install directory.

## Security contract

- Validate EOCD, central-directory, local-header, name/extra/comment, and compressed-data ranges before every read.
- Reject multi-disk, ZIP64, encrypted, and data-descriptor archives.
- Enforce explicit archive-byte, entry-count, per-entry output, and aggregate output limits.
- Bound deflate output and verify declared versus produced sizes.
- Reject stored-entry size mismatches and central/local metadata drift.
- Extract into a sibling staging directory and replace the target only after complete success.
- Remove staging content on every failure and preserve any existing target.
- Keep traversal entries outside the extraction set.

## Test-first evidence

Add direct tests for all limits, malformed/truncated offsets, unsupported features, decompression expansion, size mismatches, cleanup, and successful atomic replacement before changing the implementation.

## Validation

Run focused archive/service tests, architecture checks, full extension unit/coverage/security/accessibility/build/package checks, and the full repository pre-push gate.
