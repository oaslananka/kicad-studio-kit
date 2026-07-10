#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { docsSiteUrl } from "./lib/docs-site-config.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const docsRoot = path.join(repoRoot, "docs");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readYaml(relativePath) {
  return parseYaml(readText(relativePath));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeGenerated(relativePath, content) {
  const filePath = path.join(docsRoot, relativePath);
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${content.trimEnd()}\n`, "utf8");
  return filePath;
}

function copyFile(sourceRelativePath, targetRelativePath) {
  const source = path.join(repoRoot, sourceRelativePath);
  const target = path.join(docsRoot, targetRelativePath);
  ensureDir(target);
  fs.copyFileSync(source, target);
}

function resolveMessage(value, messages) {
  if (typeof value !== "string") {
    return "";
  }
  const match = value.match(/^%(.+)%$/u);
  return match ? (messages[match[1]] ?? value) : value;
}

function markdownEscape(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\\/gu, "\\\\")
    .replace(/\r?\n/gu, "<br>")
    .replace(/\|/gu, "\\|");
}

function renderTable(headers, rows) {
  const header = `| ${headers.map(markdownEscape).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${row.map((cell) => markdownEscape(cell)).join(" | ")} |`,
  );
  return [header, divider, ...body].join("\n");
}

function renderDefault(value) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return `\`${value}\``;
  }
  return `\`${JSON.stringify(value)}\``;
}

function renderEnum(schema) {
  if (!Array.isArray(schema.enum)) {
    return "";
  }
  return schema.enum.map((item) => `\`${item}\``).join(", ");
}

function productVersions() {
  const root = readJson("package.json");
  const extension = readJson("apps/vscode-extension/package.json");
  const compatibility = readYaml("compatibility.yaml");
  return {
    root: root.version,
    extension: extension.version,
    mcpServer: compatibility.products["kicad-studio"]?.compatibleMcpPro?.testedAgainst ?? "unknown",
  };
}

function renderExtensionCommands() {
  const extension = readJson("apps/vscode-extension/package.json");
  const messages = readJson("apps/vscode-extension/package.nls.json");
  const commands = extension.contributes?.commands ?? [];
  const rows = commands.map((command) => [
    `\`${command.command}\``,
    resolveMessage(command.title, messages),
    resolveMessage(command.category, messages),
  ]);
  return `# Extension Commands

Machine-maintained from \`apps/vscode-extension/package.json\` and \`package.nls.json\`.
Refresh with \`corepack pnpm run docs:generate\`.

Total contributed commands: ${commands.length}.

${renderTable(["Command ID", "Title", "Category"], rows)}
`;
}

function renderExtensionSettings() {
  const extension = readJson("apps/vscode-extension/package.json");
  const messages = readJson("apps/vscode-extension/package.nls.json");
  const properties = extension.contributes?.configuration?.properties ?? {};
  const rows = Object.entries(properties).map(([key, schema]) => [
    `\`${key}\``,
    schema.type ?? "",
    renderDefault(schema.default),
    renderEnum(schema),
    resolveMessage(schema.description, messages),
  ]);
  return `# Extension Settings

Machine-maintained from the VS Code extension configuration schema.
Refresh with \`corepack pnpm run docs:generate\`.

Total settings: ${rows.length}.

${renderTable(["Setting", "Type", "Default", "Allowed values", "Description"], rows)}
`;
}

function renderExtensionViews() {
  const extension = readJson("apps/vscode-extension/package.json");
  const messages = readJson("apps/vscode-extension/package.nls.json");
  const viewGroups = extension.contributes?.views ?? {};
  const viewRows = Object.entries(viewGroups).flatMap(([container, views]) =>
    views.map((view) => [
      `\`${view.id}\``,
      resolveMessage(view.name, messages),
      `\`${container}\``,
      view.type ?? "tree",
      view.when ? `\`${view.when}\`` : "",
    ]),
  );
  const editorRows = (extension.contributes?.customEditors ?? []).map(
    (editor) => [
      `\`${editor.viewType}\``,
      resolveMessage(editor.displayName, messages),
      editor.selector
        ?.map((item) => `\`${item.filenamePattern}\``)
        .join(", ") ?? "",
      editor.priority ?? "",
    ],
  );
  return `# Extension Views

Machine-maintained from the VS Code extension contribution manifest.
Refresh with \`corepack pnpm run docs:generate\`.

## Sidebar Views

${renderTable(["View ID", "Name", "Container", "Type", "When"], viewRows)}

## Custom Editors

${renderTable(["View type", "Display name", "Selector", "Priority"], editorRows)}
`;
}

function resolveSchemaFile(name) {
  return path.join(
    "node_modules",
    "@oaslananka",
    "kicad-protocol-schemas",
    "schemas",
    name,
  );
}

function renderMcpApiReference() {
  const schema = readJson(
    resolveSchemaFile("kicad-mcp-server-info.schema.json"),
  );
  const compatibility = readYaml("compatibility.yaml");
  const required = new Set(schema.required ?? []);
  const propertyRows = Object.entries(schema.properties ?? {}).map(
    ([key, property]) => [
      `\`${key}\``,
      property.type ?? "object",
      required.has(key) ? "yes" : "no",
      property.description ?? "",
    ],
  );
  const capabilityRows = Object.entries(
    schema.properties?.capabilities?.properties ?? {},
  ).map(([key, property]) => [
    `\`${key}\``,
    property.type ?? "object",
    property.description ?? "",
  ]);
  const toolRows = [
    ...(compatibility.mcpTools?.required ?? []).map((tool) => [
      "required",
      `\`${tool}\``,
    ]),
    ...(compatibility.mcpTools?.optional ?? []).map((tool) => [
      "optional",
      `\`${tool}\``,
    ]),
  ];
  return `# MCP API Reference

Machine-maintained from \`@oaslananka/kicad-protocol-schemas/schemas/kicad-mcp-server-info.schema.json\`
and \`compatibility.yaml\`. Refresh with \`corepack pnpm run docs:generate\`.

## Current Contract

| Surface | Value |
| --- | --- |
| MCP protocol version | \`${compatibility.mcp.protocolVersion}\` |
| Tool schema version | \`${compatibility.mcp.toolSchema}\` |
| Registry schema version | \`${compatibility.mcp.registrySchema}\` |
| Server package version | \`${productVersions().mcpServer}\` |

## Server Info Fields

${renderTable(["Field", "Type", "Required", "Description"], propertyRows)}

## Capability Fields

${renderTable(["Capability", "Type", "Description"], capabilityRows)}

## Release-Gated MCP Tools

${renderTable(["Gate", "Tool"], toolRows)}
`;
}

function compatibilitySummary(compatibility) {
  const kicadRows = compatibility.kicad.supported.map((item) => [
    item.range,
    item.state,
    item.ci,
    item.notes,
  ]);
  const productRows = Object.entries(compatibility.products).map(
    ([name, product]) => [
      name,
      product.version,
      product.packagePath,
      product.compatibleMcpPro?.required ??
        product.compatibleExtension?.required ??
        "",
    ],
  );
  const gates = compatibility.releaseGate.required
    .map((item) => `- ${item}`)
    .join("\n");
  return `## Generated Compatibility Summary

<!-- docs-site:compatibility:start -->

Machine-maintained from \`compatibility.yaml\`. Refresh with
\`corepack pnpm run docs:generate\`.

### Runtime Baseline

| Runtime | Policy |
| --- | --- |
| KiCad primary | \`${compatibility.kicad.primary}\` |
| KiCad latest verified | \`${compatibility.kicad.latestVerified}\` |
| VS Code minimum | \`${compatibility.vscode.minimum}\` |
| Node | \`${compatibility.node.range}\` |
| pnpm | \`${compatibility.pnpm.range}\` |
| Python | \`${compatibility.python.range}\` |
| MCP protocol | \`${compatibility.mcp.protocolVersion}\` |${
    compatibility.mcp.nextProtocolVersion
      ? `\n| MCP protocol (next) | \`${compatibility.mcp.nextProtocolVersion}\` |`
      : ""
  }

### KiCad Support

${renderTable(["Range", "State", "CI", "Notes"], kicadRows)}

### Product Versions

${renderTable(["Product", "Version", "Manifest", "Compatibility range"], productRows)}

### Release Gate Inputs

${gates}

<!-- docs-site:compatibility:end -->`;
}

function updateSupportMatrix() {
  const relativePath = "support-matrix.md";
  const current = readText(`docs/${relativePath}`);
  const markerStart = "<!-- docs-site:compatibility:start -->";
  const markerEnd = "<!-- docs-site:compatibility:end -->";
  const generated = compatibilitySummary(readYaml("compatibility.yaml"));
  let next;
  if (current.includes(markerStart) && current.includes(markerEnd)) {
    const summaryIndex = current.indexOf("## Generated Compatibility Summary");
    const markerEndIndex = current.indexOf(markerEnd);
    if (summaryIndex === -1 || markerEndIndex === -1) {
      throw new Error(
        `${relativePath}: generated compatibility markers are present but the summary block is malformed`,
      );
    }
    const before = current.slice(0, summaryIndex).trimEnd();
    const after = current.slice(markerEndIndex + markerEnd.length).trimStart();
    next = `${before}\n\n${generated}\n\n${after}`;
  } else {
    next = current.replace(
      "\n## Lifecycle States\n",
      `\n${generated}\n\n## Lifecycle States\n`,
    );
  }
  writeGenerated(relativePath, next);
}

function renderChangelogIndex() {
  const versions = productVersions();
  return `# Changelog

Product changelogs are copied from their release-owned source files so the
documentation site always follows the same release history as the repository.

| Product | Version | Changelog |
| --- | ---: | --- |
| Monorepo | \`${versions.root}\` | [Root changelog](root.md) |
| KiCad Studio extension | \`${versions.extension}\` | [Extension changelog](kicad-studio.md) |
| kicad-mcp-pro Python server | \`${versions.mcpServer}\` | [MCP server changelog](kicad-mcp-pro.md) |
`;
}

function copyChangelog(sourceRelativePath, targetRelativePath, title) {
  const body = readText(sourceRelativePath).trim();
  writeGenerated(
    targetRelativePath,
    `# ${title}

Source: \`${sourceRelativePath}\`

${body.replace(/^# Changelog\s*/u, "").trimStart()}
`,
  );
}

function renderContributors() {
  const body = readText("CONTRIBUTORS.md").trim();
  return `# Contributors

Source: \`CONTRIBUTORS.md\`

${body.replace(/^# Contributors\s*/u, "").trimStart()}
`;
}

function renderContributing() {
  return `# Contributing

Source of truth: \`CONTRIBUTING.md\`

## Local Validation

Run the root checks before opening a pull request:

\`\`\`bash
corepack pnpm run check:forbidden-refs
corepack pnpm run check:boundaries
corepack pnpm run check:version
corepack pnpm run check:compatibility-contract
corepack pnpm run check:dev-doctor
corepack pnpm run check:devcontainer
\`\`\`

For local setup diagnostics:

\`\`\`bash
corepack pnpm run dev:doctor
corepack pnpm run dev:doctor -- --json
\`\`\`

Product-scoped checks:

\`\`\`bash
corepack pnpm run check:kicad-studio
corepack pnpm run check:protocol-schemas
corepack pnpm run check:compatibility-contract
\`\`\`

MCP server product checks run from the
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) repository.

## Protocol Changes

Protocol-impacting pull requests must complete the protocol section in
\`.github/PULL_REQUEST_TEMPLATE.md\`. This applies to MCP tool names, tool
schemas, capability metadata, transport behavior, server-info payloads,
compatibility metadata, and extension MCP adapter behavior. Mark the section not
applicable with a reason when none of those surfaces are touched.

Checklist policy: [protocol change checklist](architecture/protocol-change-checklist.md).

## Issue Order

Work follows the governance phases documented in
[governance board model](architecture/governance-board.md).

## Ownership

Ownership and branch protection are documented in
[branch protection](architecture/branch-protection.md) and the repository
\`CODEOWNERS\` file.

## Regression Coverage

Bug-fix pull requests must include automated regression coverage before the
related issue is closed, when practical. The regression evidence should include:

- A test that fails against the pre-fix behavior and passes after the fix.
- A reference to the related issue ID in the test name or test metadata.
- A fixture, golden output, contract case, visual snapshot, or accessibility
  check when that is the right way to reproduce the bug.
- The exact local or CI command that proves the regression now passes.

Apply this policy to repeatable bugs in diagnostics freshness, viewer rendering
and fit-to-screen behavior, MCP transport/session handling, project tree rows,
BOM or netlist loading states, status bar freshness, KiCad CLI compatibility,
and live GUI context.

Exceptions must be explicit in the PR description and explain why the bug is
not practical to automate. A maintainer must approve the exception before the
issue is closed. Manual screenshots alone are not sufficient to close
repeatable bugs.

## Accessibility Coverage

New or changed KiCad Studio UI must keep the accessibility gate current before a
pull request is ready for review:

\`\`\`bash
corepack pnpm --filter kicadstudiokit run test:a11y
\`\`\`

Update \`apps/vscode-extension/test/a11y/accessibilityConformance.test.ts\` when a
change adds or materially changes a webview, custom editor toolbar, side panel,
BOM/Netlist/Component Search surface, MCP Tools tree, Quality Gates tree, AI Fix
Queue tree, status bar item, dialog-like flow, search box, or overlay.

Contributor requirements:

- Keep keyboard order deterministic and free of focus traps.
- Provide accessible names for icon-only, symbolic, status, and toolbar actions.
- Give disabled buttons reason text with \`aria-describedby\`, title text, or
  adjacent assistive text when the reason is knowable.
- Use VS Code theme tokens and verify dark, light, and high-contrast behavior.
- Include \`:focus-visible\` styling for production webview controls.
- Include \`prefers-reduced-motion: reduce\` CSS when a surface uses animation or
  transitions.

See [accessibility conformance target](accessibility.md) for the full policy.

Runtime support changes must follow the [support matrix](support-matrix.md).

## Dev Container

Use the [dev container](devcontainer.md) for reproducible VS Code Dev Containers
or GitHub Codespaces setup. Inside the container,
\`corepack pnpm run dev-doctor -- --require-devcontainer\` confirms the
devcontainer marker and required tools.
`;
}

function renderVersions() {
  const compatibility = readYaml("compatibility.yaml");
  const versions = productVersions();
  return `# Versions

Machine-maintained from package manifests and \`compatibility.yaml\`.
Refresh with \`corepack pnpm run docs:generate\`.

| Surface | Version or range |
| --- | --- |
| Monorepo baseline | \`${versions.root}\` |
| KiCad Studio extension | \`${versions.extension}\` |
| kicad-mcp-pro Python server | \`${versions.mcpServer}\` |
| VS Code engine | \`${compatibility.vscode.enginesRange}\` |
| Node | \`${compatibility.node.range}\` |
| pnpm | \`${compatibility.pnpm.range}\` |
| Python | \`${compatibility.python.range}\` |
| MCP protocol | \`${compatibility.mcp.protocolVersion}\` |
| MCP tool schema | \`${compatibility.mcp.toolSchema}\` |
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${new URL("sitemap.xml", docsSiteUrl).toString()}
`;
}

function renderSitemap() {
  const pages = [
    "/",
    "/install.html",
    "/extension/",
    "/extension/views.html",
    "/extension/commands.html",
    "/extension/settings.html",
    "/extension/troubleshooting.html",
    "/mcp/",
    "/mcp/tools.html",
    "/mcp/transport.html",
    "/mcp/deployment.html",
    "/mcp/api-reference.html",
    "/workflows/manufacturing-export.html",
    "/architecture/",
    "/support-matrix.html",
    "/versions.html",
    "/changelog/",
    "/contributing.html",
  ];
  const urls = pages
    .map((page) => {
      const loc = new URL(page.replace(/^\//u, ""), docsSiteUrl).toString();
      return `  <url>
    <loc>${loc}</loc>
  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function copyStaticAssets() {
  const screenshotDir = "apps/vscode-extension/assets/screenshots";
  const screenshots = [
    "project-tree.png",
    "schematic-viewer.png",
    "pcb-viewer.png",
    "quality-gates.png",
    "mcp-tools-dashboard.png",
    "component-search.png",
  ];
  for (const screenshot of screenshots) {
    copyFile(
      `${screenshotDir}/${screenshot}`,
      `public/screenshots/${screenshot}`,
    );
  }
  copyFile("apps/vscode-extension/assets/icon.png", "public/icon.png");
  copyFile("apps/vscode-extension/assets/icon.png", "public/favicon.ico");
}

function main() {
  writeGenerated("extension/commands.md", renderExtensionCommands());
  writeGenerated("extension/settings.md", renderExtensionSettings());
  writeGenerated("extension/views.md", renderExtensionViews());
  writeGenerated("mcp/api-reference.md", renderMcpApiReference());
  updateSupportMatrix();
  writeGenerated("versions.md", renderVersions());
  writeGenerated("contributing.md", renderContributing());
  writeGenerated("contributors.md", renderContributors());
  writeGenerated("changelog/index.md", renderChangelogIndex());
  copyChangelog("CHANGELOG.md", "changelog/root.md", "Root Changelog");
  copyChangelog(
    "apps/vscode-extension/CHANGELOG.md",
    "changelog/kicad-studio.md",
    "KiCad Studio Changelog",
  );
  writeGenerated("public/robots.txt", renderRobots());
  writeGenerated("public/sitemap.xml", renderSitemap());
  copyStaticAssets();
  console.log("docs site generated");
}

main();
