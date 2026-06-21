# BOM Risk Scoring

Component intelligence and BOM risk scoring help reviewers spot sourcing and
lifecycle problems before a board is released. The scoring engine
(`src/bom/bomRisk.ts`) is **offline and deterministic** by default — it makes no
network calls and hard-codes no vendor assumptions — and is free of editor
dependencies so it can run in CI.

## Offline signals

Every active BOM entry (DNP parts are counted but not scored) is checked for:

| Signal | Meaning |
| --- | --- |
| `no-part-number` | neither MPN nor a distributor number is present |
| `distributor-only-sourcing` | a distributor number exists but no manufacturer MPN |
| `missing-manufacturer` | no manufacturer recorded |
| `missing-footprint` | no footprint assigned |
| `ambiguous-value` | no component value |

Each entry gets a numeric score mapped to `ok` / `low` / `medium` / `high`, and
the BOM's overall risk is the highest level present.

## Normalization

`normalizeMpn` upper-cases and removes whitespace; `normalizeManufacturer`
collapses whitespace and applies an optional, caller-supplied alias map (no
manufacturer names are hard-coded in the engine).

## Optional providers

External lifecycle/sourcing data is supplied through a `BomRiskProvider`:

```ts
interface BomRiskProvider {
  name: string;
  lookup(mpn: string): Promise<ComponentIntelligence | undefined>;
}
```

`scoreBomWithProvider` enriches each entry with lifecycle (`active`/`nrnd`/
`obsolete`/…), source count, and alternatives. Alternatives are explicitly
classified as **pin-compatible**, **footprint-compatible**, or merely
**functionally similar**. Provider failures (or a missing MPN) leave the entry at
its offline score and never throw, and every provider-derived field carries its
`source` so no provider-specific claim is shown without attribution.

## Privacy and network behavior

The default scoring is fully local. Providers are the only network surface, are
opt-in, and must be configured explicitly; nothing in this engine sends BOM data
anywhere on its own.

## Integration

The structured `BomRiskReport` is consumable by the BoardReadyOps readiness
scorecard and can be included in the Fabrication Release Wizard's report. Any AI
summary must cite this structured data rather than inventing sourcing claims.
