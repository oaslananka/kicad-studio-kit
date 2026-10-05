# Repository Policy Scripts Agent Instructions

These instructions apply to `scripts/**` and supplement the repository root
`AGENTS.md`.

## Boundary

This directory is policy-as-code, not a miscellaneous utility folder. It owns validators,
generators, governance checks, compatibility checks, release-integrity checks, CI lane
classification, evidence checks and repository maintenance automation.

## Fail-closed behavior

- Security, compatibility, release, provenance, branch-protection, permissions and
  evidence validators must fail closed when required input is missing, malformed,
  contradictory or unverifiable.
- Do not turn an error into a warning/skip merely to make CI pass.
- Do not reduce a threshold, remove a required reference, broaden an allowlist, add an
  exclusion or weaken a baseline without an explicit policy decision and regression test.
- Absence of an external service or API response is not proof that a policy is satisfied.

## Checker and policy ownership

- Treat each checker and the document/config it enforces as one contract. When policy is
  intentionally changed, update the checker, its regression test and the owning
  documentation/config in the same PR.
- Prefer extending an existing checker over adding a parallel validator for the same
  contract.
- Every substantive checker behavior change needs a focused regression test that would
  fail under the previous/incorrect behavior.
- Keep deterministic output where scripts feed CI summaries, generated docs, manifests,
  snapshots or release evidence.

## Filesystem, process and network safety

- Keep path handling cross-platform and explicit; do not assume POSIX-only separators
  unless the script is intentionally platform-scoped.
- Use argument-array process execution rather than shell interpolation when values can be
  influenced by repository or external data.
- Bound or validate external data before parsing/extracting large artifacts.
- When fetching published artifacts or registry metadata, verify the expected identity,
  version and digest/contract before treating content as evidence.
- Never log credentials, bearer tokens, private paths or secret-bearing environment values.

## Generated outputs

If a script owns generated state, update the source/generator and regenerate deliberately.
Do not hand-edit the generated output to satisfy a drift check. Generator changes must keep
stable ordering and reproducible content unless the contract intentionally changes.

## Validation

Run the narrow test file for the changed checker first. Then run its package script and the
root policy path that consumes it. Common examples include:

```text
node --test scripts/<checker>.test.mjs
corepack pnpm run check:agent-configs
corepack pnpm run check:boundaries
corepack pnpm run check:ci-lanes
corepack pnpm run check:quality-gates
corepack pnpm run release:verify
```

A policy-script change is not complete just because the script exits zero; its tests,
owning policy surface and CI wiring must still agree.
