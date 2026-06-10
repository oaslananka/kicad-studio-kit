import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";

test("#342 compatibility product version matches the released extension", () => {
  const extension = JSON.parse(
    fs.readFileSync("apps/vscode-extension/package.json", "utf8"),
  );
  const manifest = JSON.parse(
    fs.readFileSync(".release-please-manifest.json", "utf8"),
  );
  const compatibility = parseYaml(
    fs.readFileSync("compatibility.yaml", "utf8"),
  );

  assert.equal(manifest["apps/vscode-extension"], extension.version);
  assert.equal(
    compatibility.products["kicad-studio"].version,
    extension.version,
  );
});
