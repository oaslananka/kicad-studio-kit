import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import {
  validateTarballOrigin,
  verifyPublishedNpmDigest,
} from "./verify-npm-release.mjs";

const PACKAGE_VERSION = "3.5.2";

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
  await writeFile(
    checksums,
    `${checksum}  kicad-mcp-pro-${PACKAGE_VERSION}.tgz\n`,
  );

  await withRegistry(
    (request, response) => {
      if (request.url === `/kicad-mcp-pro/${PACKAGE_VERSION}`) {
        const baseUrl = `http://${request.headers.host}`;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            dist: {
              tarball: `${baseUrl}/kicad-mcp-pro/-/kicad-mcp-pro-${PACKAGE_VERSION}.tgz`,
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
        version: PACKAGE_VERSION,
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
  assert.equal(evidence.version, PACKAGE_VERSION);
  assert.equal(evidence.sha256, checksum);
});

test("rejects a published npm tarball digest mismatch", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "npm-release-"));
  const checksums = join(workspace, "SHA256SUMS.txt");
  await writeFile(
    checksums,
    `${"0".repeat(64)}  kicad-mcp-pro-${PACKAGE_VERSION}.tgz\n`,
  );

  await withRegistry(
    (request, response) => {
      if (request.url === `/kicad-mcp-pro/${PACKAGE_VERSION}`) {
        const baseUrl = `http://${request.headers.host}`;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            dist: {
              tarball: `${baseUrl}/kicad-mcp-pro/-/kicad-mcp-pro-${PACKAGE_VERSION}.tgz`,
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
          version: PACKAGE_VERSION,
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

test("rejects registry metadata that points to a different tarball origin", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "npm-release-origin-"));
  const checksums = join(workspace, "SHA256SUMS.txt");
  await writeFile(checksums, `${"0".repeat(64)}  untrusted.tgz\n`);
  let tarballRequests = 0;
  await withRegistry(
    (request, response) => {
      if (request.url === `/kicad-mcp-pro/${PACKAGE_VERSION}`) {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            dist: { tarball: "http://127.0.0.1:1/untrusted.tgz" },
          }),
        );
        return;
      }
      tarballRequests += 1;
      response.end("unexpected request");
    },
    async (registryUrl) => {
      await assert.rejects(
        verifyPublishedNpmDigest({
          packageName: "kicad-mcp-pro",
          version: PACKAGE_VERSION,
          checksumsPath: checksums,
          outputDir: join(workspace, "verify"),
          registryUrl,
          retries: 1,
          retryDelayMs: 0,
        }),
        /configured registry origin/u,
      );
    },
  );
  assert.equal(tarballRequests, 0);
});

test("rejects redirect responses from a nominally trusted npm tarball", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "npm-release-redirect-"));
  const checksums = join(workspace, "SHA256SUMS.txt");
  await writeFile(
    checksums,
    `${"0".repeat(64)}  kicad-mcp-pro-${PACKAGE_VERSION}.tgz\n`,
  );
  let redirectedRequests = 0;
  await withRegistry(
    (request, response) => {
      if (request.url === `/kicad-mcp-pro/${PACKAGE_VERSION}`) {
        const registryUrl = `http://${request.headers.host}`;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            dist: {
              tarball: `${registryUrl}/kicad-mcp-pro/-/kicad-mcp-pro-${PACKAGE_VERSION}.tgz`,
            },
          }),
        );
        return;
      }
      if (request.url?.startsWith("/kicad-mcp-pro/-/")) {
        response.writeHead(302, { location: "/redirected" });
        response.end();
        return;
      }
      redirectedRequests += 1;
      response.end("must not follow redirect");
    },
    async (registryUrl) => {
      await assert.rejects(
        verifyPublishedNpmDigest({
          packageName: "kicad-mcp-pro",
          version: PACKAGE_VERSION,
          checksumsPath: checksums,
          outputDir: join(workspace, "verify"),
          registryUrl,
          retries: 1,
          retryDelayMs: 0,
        }),
        (error) =>
          error instanceof TypeError &&
          error.cause?.message === "unexpected redirect",
      );
    },
  );
  assert.equal(redirectedRequests, 0);
});

test("rejects malformed tarball URLs and embedded credentials", () => {
  assert.throws(
    () => validateTarballOrigin("not-a-url", "https://registry.npmjs.org"),
    /absolute/u,
  );
  assert.throws(
    () =>
      validateTarballOrigin(
        "https://user:pass@registry.npmjs.org/pkg.tgz",
        "https://registry.npmjs.org",
      ),
    /configured registry origin/u,
  );
  assert.equal(
    validateTarballOrigin(
      "https://registry.npmjs.org/pkg.tgz",
      "https://registry.npmjs.org",
    ),
    "https://registry.npmjs.org/pkg.tgz",
  );
});
