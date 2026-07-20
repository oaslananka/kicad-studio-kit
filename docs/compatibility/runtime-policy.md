# Runtime Policy Enforcement

`compatibility.yaml` is the source of truth for runtime support boundaries and
for the policy used to detect drift. The checks deliberately separate local,
deterministic validation from network freshness reporting.

## Deterministic pull-request gate

The root command remains:

```bash
corepack pnpm run check:compatibility-contract
```

It invokes the runtime-policy validator without network access and fails when:

- `runtimePolicy.reviewed` or authoritative source URLs are malformed;
- an enforcement value is not `report` or `error`;
- lag/window values are not valid non-negative integers;
- `vscode.enginesRange` differs from the extension manifest;
- the Python support window does not match `supportedMinorWindow`, begin at
  `python.range`, or remain contiguous;
- KiCad primary/latest-verified version syntax is invalid.

These errors are always blocking because they describe an internally
inconsistent repository contract.

## Scheduled and manual freshness gate

`.github/workflows/runtime-policy-drift.yml` runs weekly and through
`workflow_dispatch`. It executes:

```bash
node scripts/check-runtime-policy.mjs \
  --fetch \
  --json runtime-policy-report.json \
  --summary "$GITHUB_STEP_SUMMARY"
```

The workflow reads the HTTPS sources declared under `runtimePolicy.sources`,
validates each response before use, writes a human-readable job summary, and
uploads the complete JSON report. It never edits compatibility metadata.

A source timeout, HTTP failure, or malformed response is reported as `unknown`.
It is never treated as `current`.

## Enforcement values

Each runtime and unavailable-source result has one explicit enforcement value:

- `report`: show drift or `unknown` evidence while keeping the workflow
  non-blocking;
- `error`: return a failing exit code and promote that condition to a blocking
  policy gate.

Changing `report` to `error` is therefore an explicit policy decision in
`compatibility.yaml`, not hidden checker behavior.

## Runtime decisions

- **VS Code:** compare `vscode.minimum` with the newest stable minor and report
  drift beyond `maxMinimumMinorLag`.
- **Python:** compare `python.supported` with the newest bugfix-status releases
  selected by `supportedMinorWindow`.
- **KiCad:** compare the primary major with the newest stable major using
  `primaryMajorLag`. Patch freshness is reported separately; a newer patch does
  not automatically change the support claim.

Freshness evidence informs compatibility issues and canaries. Maintainers update
support claims only after the relevant product tests pass.
