import assert from "node:assert/strict";
import test from "node:test";

import {
  detectDevelopmentEnvironment,
  satisfiesSimpleRange,
} from "./dev-doctor.mjs";

test("dev-doctor detects the devcontainer marker and Codespaces", () => {
  assert.deepEqual(
    detectDevelopmentEnvironment({
      KICAD_STUDIO_DEVCONTAINER: "1",
    }),
    {
      isDevcontainer: true,
      isCodespaces: false,
      markers: ["KICAD_STUDIO_DEVCONTAINER=1"],
    },
  );

  assert.deepEqual(
    detectDevelopmentEnvironment({
      CODESPACES: "true",
    }),
    {
      isDevcontainer: true,
      isCodespaces: true,
      markers: ["CODESPACES=true"],
    },
  );
});

test("dev-doctor enforces the repository Node runtime policy", () => {
  assert.equal(satisfiesSimpleRange("24.11.0", ">=24.11.0 <25"), true);
  assert.equal(satisfiesSimpleRange("24.16.0", ">=24.11.0 <25"), true);
  assert.equal(satisfiesSimpleRange("24.10.0", ">=24.11.0 <25"), false);
  assert.equal(satisfiesSimpleRange("25.0.0", ">=24.11.0 <25"), false);
});
