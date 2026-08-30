import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  validateCompatibilityAxes,
  validateCompatibilityContract,
  validateEmbeddedExtensionCompatibilityMatrix,
  validateKiCadPatchBaseline,
  validateMcpProtocolActivation,
} from "./check-compatibility-contract.mjs";

const compatibility = parseYaml(fs.readFileSync("compatibility.yaml", "utf8"));
const extensionPackage = JSON.parse(
  fs.readFileSync("apps/vscode-extension/package.json", "utf8"),
);
const matrixSource = fs.readFileSync(
  "apps/vscode-extension/src/mcp/compatibilityMatrix.ts",
  "utf8",
);

test("embedded extension compatibility matrix matches compatibility metadata", () => {
  assert.deepEqual(
    validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource,
    }),
    [],
  );
});

test("embedded extension compatibility matrix rejects product-version drift", () => {
  // Inject drift relative to the current authoritative version so this test
  // never needs a manual bump on release (the kicadStudio version equals
  // extensionPackage.version and is the first `version: '...'` in the matrix).
  const driftedSource = matrixSource.replace(
    `version: '${extensionPackage.version}'`,
    "version: '0.0.0'",
  );
  assert.notEqual(
    driftedSource,
    matrixSource,
    "drift fixture must actually mutate the matrix source",
  );

  assert.match(
    validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource: driftedSource,
    }).join("\n"),
    /kicadStudioVersion/u,
  );
});

test("#621 embedded support axes reject BoardReadyOps required-range drift", () => {
  const driftedSource = matrixSource.replace(
    "required: '>=1.2.0 <2.0.0'",
    "required: '>=1.3.0 <2.0.0'",
  );
  assert.notEqual(driftedSource, matrixSource);
  assert.match(
    validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource: driftedSource,
    }).join("\n"),
    /boardReadyOpsRequired/u,
  );
});

test("#621 embedded support axes reject BoardReadyOps contract drift", () => {
  const driftedSource = matrixSource.replace(
    "testedAgainst: '1.36.0'",
    "testedAgainst: '1.34.0'",
  );
  assert.notEqual(driftedSource, matrixSource);
  assert.match(
    validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource: driftedSource,
    }).join("\n"),
    /boardReadyOpsTestedAgainst/u,
  );
});

test("repository compatibility contract validates current state", () => {
  assert.deepEqual(validateCompatibilityContract(), []);
});

test("#621 support axes are independent, complete, and internally consistent", () => {
  assert.deepEqual(validateCompatibilityAxes({ compatibility }), []);
});

test("#621 rejects a missing product support axis", () => {
  const drifted = structuredClone(compatibility);
  delete drifted.supportAxes.mcpServer;

  assert.match(
    validateCompatibilityAxes({ compatibility: drifted }).join("\n"),
    /supportAxes\.mcpServer/u,
  );
});

test("#621 rejects contradictory Studio CLI lifecycle claims", () => {
  const drifted = structuredClone(compatibility);
  drifted.supportAxes.studioCli.kicad.stable = ["9.x"];

  assert.match(
    validateCompatibilityAxes({ compatibility: drifted }).join("\n"),
    /studioCli.*stable.*kicad\.primary/iu,
  );
});

test("#621 rejects stale published kicad-mcp-pro tested-pair evidence", () => {
  assert.match(
    validateCompatibilityAxes({
      compatibility,
      publishedArtifacts: { mcpServerVersion: "99.0.0" },
    }).join("\n"),
    /mcpServer.*testedAgainst.*99\.0\.0/iu,
  );
});

test("#621 rejects stale published BoardReadyOps contract evidence", () => {
  assert.match(
    validateCompatibilityAxes({
      compatibility,
      publishedArtifacts: { boardReadyOpsVersion: "99.0.0" },
    }).join("\n"),
    /boardReadyOps.*testedAgainst.*99\.0\.0/iu,
  );
});

test("#621 keeps protocol activation separate from product semver compatibility", () => {
  const drifted = structuredClone(compatibility);
  drifted.supportAxes.mcpProtocol.active = "2026-07-28";

  assert.match(
    validateCompatibilityAxes({ compatibility: drifted }).join("\n"),
    /mcpProtocol\.active.*mcp\.protocolVersion/u,
  );
});

test("#494 compatibility contract rejects malformed runtime policy metadata", () => {
  const malformed = structuredClone(compatibility);
  malformed.runtimePolicy.enforcement.vscode = "ignore";

  assert.match(
    validateCompatibilityContract({
      runtimePolicyCompatibility: malformed,
      runtimePolicyExtensionPackage: extensionPackage,
    }).join("\n"),
    /runtimePolicy\.enforcement\.vscode/u,
  );
});

test("#558 final KiCad 10.0.5 baseline is aligned and has no active patch preview", () => {
  assert.equal(compatibility.kicad.latestVerified, "10.0.5");
  assert.equal(compatibility.kicad10FeatureParity.baseline, "10.0.5");
  assert.equal(
    compatibility.kicad10FeatureParity.sources.canaryEvidence,
    "docs/evidence/kicad-10-0-5/2026-07-26/summary.md",
  );
  assert.equal(compatibility.kicad.patchCanary, undefined);
  assert.deepEqual(validateKiCadPatchBaseline({ compatibility }), []);
});

test("#558 verified stable patches do not require an active prerelease canary", () => {
  const stableOnly = structuredClone(compatibility);
  delete stableOnly.kicad.patchCanary;

  assert.deepEqual(
    validateKiCadPatchBaseline({ compatibility: stableOnly }),
    [],
  );
});

test("#491 rejects stable parity drift", () => {
  const drifted = structuredClone(compatibility);
  drifted.kicad10FeatureParity.baseline = "10.0.3";

  assert.match(
    validateKiCadPatchBaseline({ compatibility: drifted }).join("\n"),
    /kicad10FeatureParity\.baseline must match kicad\.latestVerified/u,
  );
});

test("#491 keeps future patch release candidates non-blocking", () => {
  const blocking = structuredClone(compatibility);
  blocking.kicad.patchCanary = {
    version: "10.0.6-rc1",
    reportedVersion: "10.0.6",
    state: "preview",
    blocking: true,
    owner: "KiCad MCP Pro",
    ownerDocumentation: "https://oaslananka.github.io/kicad-mcp-pro/",
    releaseNotes:
      "https://www.kicad.org/blog/2026/08/KiCad-Version-10.0.6-Release-Candidate-1-Available/",
    evidence: "docs/evidence/kicad-10-0-5-rc1/2026-07-21/summary.md",
  };

  assert.match(
    validateKiCadPatchBaseline({ compatibility: blocking }).join("\n"),
    /kicad\.patchCanary must remain preview-only and non-blocking/u,
  );
});

test("#491 requires reviewable stable canary evidence", () => {
  const missingEvidence = structuredClone(compatibility);
  missingEvidence.kicad10FeatureParity.sources.canaryEvidence =
    "docs/evidence/missing.md";

  assert.match(
    validateKiCadPatchBaseline({ compatibility: missingEvidence }).join("\n"),
    /sources\.canaryEvidence must reference an existing file/u,
  );
});

test("#492 current MCP final-activation record remains blocked and valid", () => {
  assert.deepEqual(
    validateMcpProtocolActivation({
      compatibility,
      repoRoot: process.cwd(),
      registrySource: fs.readFileSync(
        "apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts",
        "utf8",
      ),
      adrSource: fs.readFileSync(
        "docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md",
        "utf8",
      ),
      adrIndexSource: fs.readFileSync("docs/adr/README.md", "utf8"),
    }),
    [],
  );
});

test("#492 rejects selecting the target protocol while final evidence is incomplete", () => {
  const activated = structuredClone(compatibility);
  activated.mcp.protocolVersion = activated.mcp.nextProtocolVersion;
  delete activated.mcp.nextProtocolVersion;
  activated.mcp.activation.state = "active";

  assert.match(
    validateMcpProtocolActivation({
      compatibility: activated,
      repoRoot: process.cwd(),
      registrySource:
        "export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2026-07-28'];",
      adrSource: "Status: Proposed",
      adrIndexSource: "| 0008 | MCP | Proposed |",
    }).join("\n"),
    /finalSpecification|pythonSdk|protocolSchemas|serverArtifact|extensionAdapter|realPair/u,
  );
});

test("#492 accepts activation only with stable published artifacts and accepted ADR evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-activation-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs", "adr"), { recursive: true });
    fs.mkdirSync(
      path.join(root, "apps", "vscode-extension", "src", "mcp", "protocol"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(root, "src", "mcp2026ProtocolAdapter.ts"),
      "export const MCP_2026_PROTOCOL_VERSION = '2026-07-28';\nexport const lifecycle = 'stateless-discovery';\n",
    );
    fs.writeFileSync(
      path.join(
        root,
        "apps",
        "vscode-extension",
        "src",
        "mcp",
        "protocol",
        "protocolAdapterRegistry.ts",
      ),
      "export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2026-07-28'];\n",
    );
    fs.writeFileSync(path.join(root, "evidence", "real-pair.md"), "passed\n");
    fs.writeFileSync(
      path.join(root, "evidence", "activation.md"),
      "reviewed\n",
    );
    fs.writeFileSync(
      path.join(root, "docs", "adr", "0008.md"),
      "# ADR 0008\n\nStatus: Accepted\n",
    );

    const activated = structuredClone(compatibility);
    activated.mcp.protocolVersion = "2026-07-28";
    delete activated.mcp.nextProtocolVersion;
    activated.mcp.activation = {
      targetProtocolVersion: "2026-07-28",
      state: "active",
      reviewed: "2026-07-28",
      evidenceNote: "evidence/activation.md",
      finalSpecification: {
        version: "2026-07-28",
        source:
          "https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28",
      },
      pythonSdk: {
        package: "mcp",
        version: "2.0.0",
        source: "https://pypi.org/project/mcp/2.0.0/",
      },
      protocolSchemas: {
        package: "@oaslananka/kicad-protocol-schemas",
        version: "2.0.0",
        source:
          "https://www.npmjs.com/package/@oaslananka/kicad-protocol-schemas/v/2.0.0",
      },
      serverArtifact: {
        package: "kicad-mcp-pro",
        version: "4.0.0",
        protocolVersion: "2026-07-28",
        source: "https://pypi.org/project/kicad-mcp-pro/4.0.0/",
      },
      extensionAdapter: { path: "src/mcp2026ProtocolAdapter.ts" },
      realPair: { evidence: "evidence/real-pair.md" },
      adr: { path: "docs/adr/0008.md", status: "Accepted" },
    };

    assert.deepEqual(
      validateMcpProtocolActivation({
        compatibility: activated,
        repoRoot: root,
        adrSource: "# ADR 0008\n\nStatus: Accepted\n",
        adrIndexSource: "| 0008 | MCP | Accepted |",
      }),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#492 detects ADR status drift before final protocol activation", () => {
  const current = structuredClone(compatibility);
  current.mcp.activation.adr.status = "Proposed";

  assert.match(
    validateMcpProtocolActivation({
      compatibility: current,
      repoRoot: process.cwd(),
      registrySource: fs.readFileSync(
        "apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts",
        "utf8",
      ),
      adrSource: "Status: Proposed",
      adrIndexSource: "| 0008 | MCP | Accepted |",
    }).join("\n"),
    /ADR 0008 index status must match/u,
  );
});

test("#492 rejects RC specification and prerelease SDK evidence for active protocol", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prerelease-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs", "adr"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "adapter.ts"),
      "export const version = '2026-07-28'; export const lifecycle = 'stateless-discovery';",
    );
    fs.writeFileSync(
      path.join(root, "evidence", "activation.md"),
      "reviewed\n",
    );
    fs.writeFileSync(path.join(root, "evidence", "real-pair.md"), "passed\n");
    fs.writeFileSync(
      path.join(root, "docs", "adr", "0008.md"),
      "Status: Accepted\n",
    );

    const activated = structuredClone(compatibility);
    activated.mcp.protocolVersion = "2026-07-28";
    delete activated.mcp.nextProtocolVersion;
    activated.mcp.activation = {
      targetProtocolVersion: "2026-07-28",
      state: "active",
      reviewed: "2026-07-28",
      evidenceNote: "evidence/activation.md",
      finalSpecification: {
        version: "2026-07-28",
        source:
          "https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28-RC",
      },
      pythonSdk: {
        package: "mcp",
        version: "2.0.0b2",
        source: "https://pypi.org/project/mcp/2.0.0b2/",
      },
      protocolSchemas: {
        package: "@oaslananka/kicad-protocol-schemas",
        version: "2.0.0-rc.1",
        source:
          "https://www.npmjs.com/package/@oaslananka/kicad-protocol-schemas/v/2.0.0-rc.1",
      },
      serverArtifact: {
        package: "kicad-mcp-pro",
        version: "4.0.0rc1",
        protocolVersion: "2026-07-28",
        source: "https://pypi.org/project/kicad-mcp-pro/4.0.0rc1/",
      },
      extensionAdapter: { path: "src/adapter.ts" },
      realPair: { evidence: "evidence/real-pair.md" },
      adr: { path: "docs/adr/0008.md", status: "Accepted" },
    };

    const errors = validateMcpProtocolActivation({
      compatibility: activated,
      repoRoot: root,
      registrySource:
        "export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2026-07-28'];",
      adrSource: "Status: Accepted",
      adrIndexSource: "| 0008 | MCP | Accepted |",
    }).join("\n");

    assert.match(errors, /official stable release/u);
    assert.match(errors, /pythonSdk\.version must be a stable/u);
    assert.match(errors, /protocolSchemas\.version must be a stable/u);
    assert.match(errors, /serverArtifact\.version must be a stable/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#492 activation evidence paths cannot escape the repository", () => {
  const escaped = structuredClone(compatibility);
  escaped.mcp.activation.evidenceNote = "../../outside.md";

  assert.match(
    validateMcpProtocolActivation({
      compatibility: escaped,
      repoRoot: process.cwd(),
      registrySource: fs.readFileSync(
        "apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts",
        "utf8",
      ),
      adrSource: "Status: Proposed",
      adrIndexSource: "| 0008 | MCP | Proposed |",
    }).join("\n"),
    /evidenceNote must remain inside the repository/u,
  );
});
