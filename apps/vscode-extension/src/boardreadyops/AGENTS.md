# BoardReadyOps Integration Agent Instructions

These instructions apply to `apps/vscode-extension/src/boardreadyops/**` and supplement
the parent extension and root instructions.

## Ownership boundary

BoardReadyOps is an external CLI product. This subtree owns its extension-side invocation,
contract parsing, compatibility decision, evidence verification and manufacturing release
gate. Do not copy BoardReadyOps implementation logic into the extension.

## Contract validation

- `boardreadyops doctor --format json` is a compatibility preflight, not an advisory
  banner. Validate schema, tool identity and supported semantic version before trusting the
  integration.
- Treat stdout as untrusted external data. Parse JSON and validate every field used for a
  release decision.
- Keep findings, location data, fingerprints, summaries and evidence verification
  fail-closed on malformed or incomplete contracts.
- Compatibility ranges and schema versions must stay aligned with `compatibility.yaml`.

## Manufacturing release gate

- A numeric readiness score never overrides a `critical` or `high` blocking finding.
- Non-passing readiness remains blocking when BoardReadyOps is enabled.
- Missing, stale, malformed or unverified release evidence must fail closed.
- A release evidence signature is considered verified only when the returned contract says
  it is present and valid.
- Do not treat exit codes outside the documented contract as a normal finding result.
- Do not surface raw private artifact paths or arbitrary CLI payloads in user-facing release
  UI/logging.

## Testing

Changes to parsing or release decisions need focused malformed-input and fail-closed tests.
Manufacturing-gate changes must prove both blocking and successful evidence paths and keep
the compatibility contract tests green.
