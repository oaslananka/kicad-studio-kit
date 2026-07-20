# Issue 494 Runtime Policy Enforcement Design

## Goal

Make `compatibility.yaml.runtimePolicy` enforceable without making pull-request validation depend on network access.

## Decision

Use two layers:

1. **Deterministic metadata validation** runs inside the existing root `check:compatibility-contract` command. It validates the policy schema and local relationships between VS Code, Python, and KiCad compatibility metadata.
2. **Upstream freshness evaluation** runs only in a new scheduled/manual workflow. It fetches authoritative sources, validates their shapes, emits JSON and Markdown evidence, and reports `current`, `drift`, or `unknown` per runtime.

## Policy model

`runtimePolicy.enforcement` declares `report` or `error` for each upstream runtime and for unavailable/malformed sources. `report` keeps the workflow green while surfacing drift. `error` promotes that finding to a blocking failure without changing checker code.

Internal metadata errors always fail. Network failures never become implicit success: they produce `unknown` and follow `sourceUnavailable` enforcement.

## Pure interfaces

`scripts/lib/runtime-policy.mjs` owns pure validation and evaluation:

- `validateRuntimePolicyMetadata({ compatibility, extensionPackage }) -> string[]`
- `parseVsCodeStableRelease(payload) -> string`
- `parsePythonBugfixWindow(payload) -> string[]`
- `parseKiCadStableRelease(html) -> string`
- `evaluateRuntimePolicy({ compatibility, upstream }) -> RuntimePolicyReport`
- `renderRuntimePolicyMarkdown(report) -> string`

`scripts/check-runtime-policy.mjs` owns repository I/O, fetch timeouts, report files, CLI arguments, and exit status.

## Runtime rules

- VS Code: compare `vscode.minimum` minor to the latest stable minor. Drift exists when lag exceeds `maxMinimumMinorLag`.
- Python: compare `python.supported` to the highest `supportedMinorWindow` releases whose status is `bugfix`.
- KiCad: compare the major from `kicad.primary` to the latest stable major. Drift exists when lag exceeds `primaryMajorLag`. Patch freshness is reported separately by comparing `kicad.latestVerified` with the fetched stable release; patch drift does not change the primary-major decision.

## Workflow

`.github/workflows/runtime-policy-drift.yml` runs weekly and manually with read-only contents permission. It installs the pinned Node/pnpm toolchain, executes the checker with `--fetch`, appends Markdown to `$GITHUB_STEP_SUMMARY`, and uploads the JSON report. No issue-writing permission is required.

## Non-goals

- Automatically editing compatibility claims.
- Installing KiCad or running CLI canaries.
- Moving server-owned Python policy into this repository.
- Making transient upstream outages silently pass as current.
