import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import { verifyPublishedNpmDigest } from "./verify-npm-release.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function withRegistry(handler, testBody) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    await testBody(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("verifies the published npm tarball SHA-256 digest", async () => {
  const tarball = Buffer.from("package-bytes");
  const checksum = sha256(tarball);
  const workspace = mkdtempSync(join(tmpdir(), "npm-release-"));
  const checksums = join(workspace, "SHA256SUMS.txt");
  await writeFile(checksums, `${checksum}  kicad-mcp-pro-1.0.0.tgz\n`);

  await withRegistry(
    (request, response) => {
      if (request.url === "/kicad-mcp-pro/1.0.0") {
        const baseUrl = `http://${request.headers.host}`;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            dist: {
              tarball: `${baseUrl}/kicad-mcp-pro/-/kicad-mcp-pro-1.0.0.tgz`,
            },
          }),
        );
        return;
      }
      response.end(tarball);
    },
    async (registryUrl) => {
      await verifyPublishedNpmDigest({
        packageName: "kicad-mcp-pro",
        version: "1.0.0",
        checksumsPath: checksums,
        outputDir: join(workspace, "verify"),
        registryUrl,
        retries: 1,
        retryDelayMs: 0,
      });
    },
  );

  const evidence = JSON.parse(
    readFileSync(
      join(workspace, "verify", "npm-published-digest.json"),
      "utf8",
    ),
  );
  assert.equal(evidence.package, "kicad-mcp-pro");
  assert.equal(evidence.version, "1.0.0");
  assert.equal(evidence.sha256, checksum);
});

test("rejects a published npm tarball digest mismatch", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "npm-release-"));
  const checksums = join(workspace, "SHA256SUMS.txt");
  await writeFile(checksums, `${"0".repeat(64)}  kicad-mcp-pro-1.0.0.tgz\n`);

  await withRegistry(
    (request, response) => {
      if (request.url === "/kicad-mcp-pro/1.0.0") {
        const baseUrl = `http://${request.headers.host}`;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            dist: {
              tarball: `${baseUrl}/kicad-mcp-pro/-/kicad-mcp-pro-1.0.0.tgz`,
            },
          }),
        );
        return;
      }
      response.end("changed");
    },
    async (registryUrl) => {
      await assert.rejects(
        verifyPublishedNpmDigest({
          packageName: "kicad-mcp-pro",
          version: "1.0.0",
          checksumsPath: checksums,
          outputDir: join(workspace, "verify"),
          registryUrl,
          retries: 1,
          retryDelayMs: 0,
        }),
        /sha256 mismatch/,
      );
    },
  );
});
