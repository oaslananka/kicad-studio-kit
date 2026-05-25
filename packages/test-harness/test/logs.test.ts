import assert from "node:assert/strict";
import test from "node:test";

import { redactCommandForLog, redactSecrets } from "../src/index";

test("redacts common secret shapes and explicit values", () => {
  assert.equal(
    redactSecrets("Authorization: Bearer abc123 token=secret", ["abc123"]),
    "Authorization: Bearer [REDACTED] token=[REDACTED]",
  );
  assert.equal(
    redactCommandForLog("kicad-cli", ["--token=secret-value"]),
    "kicad-cli --token=[REDACTED]",
  );
  const privateKeyStart = "-----BEGIN " + "PRIVATE KEY-----";
  const privateKeyEnd = "-----END " + "PRIVATE KEY-----";
  assert.equal(
    redactSecrets(`${privateKeyStart}\nabc123\n${privateKeyEnd}`),
    `${privateKeyStart}[REDACTED]${privateKeyEnd}`,
  );
});
