import { defineConfig } from "vitepress";
import { docsSiteBase } from "../../scripts/lib/docs-site-config.mjs";

export default defineConfig({
  lang: "en-US",
  title: "KiCad Studio Kit",
  description:
    "Searchable documentation for the KiCad Studio VS Code extension and kicad-mcp-pro.",
  base: docsSiteBase,
  outDir: "../site",
  lastUpdated: true,
  head: [
    [
      "link",
      {
        rel: "icon",
        href: `${docsSiteBase}icon.png`,
        type: "image/png",
      },
    ],
  ],
  markdown: {
    lineNumbers: true,
  },
  themeConfig: {
    logo: "/icon.png",
    siteTitle: "KiCad Studio Kit",
    search: {
      provider: "local",
    },
    nav: [
      { text: "Install", link: "/install" },
      { text: "Extension", link: "/extension/" },
      { text: "MCP", link: "/mcp/" },
      { text: "Agents", link: "/agents/" },
      { text: "Architecture", link: "/architecture/" },
      { text: "Support Matrix", link: "/support-matrix" },
      { text: "Changelog", link: "/changelog/" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "Install", link: "/install" },
          { text: "Versions", link: "/versions" },
          { text: "Support Matrix", link: "/support-matrix" },
          {
            text: "KiCad 10.0.3 Feature Parity",
            link: "/compatibility/kicad-10-0-3-feature-parity",
          },
        ],
      },
      {
        text: "Extension",
        items: [
          { text: "Overview", link: "/extension/" },
          { text: "Views", link: "/extension/views" },
          { text: "Commands", link: "/extension/commands" },
          { text: "Settings", link: "/extension/settings" },
          { text: "Troubleshooting", link: "/extension/troubleshooting" },
          { text: "Accessibility", link: "/accessibility" },
          { text: "Telemetry", link: "/telemetry" },
        ],
      },
      {
        text: "Workflows",
        items: [
          {
            text: "Manufacturing Export",
            link: "/workflows/manufacturing-export",
          },
        ],
      },
      {
        text: "MCP",
        items: [
          { text: "Overview", link: "/mcp/" },
          { text: "Tool Catalog", link: "/mcp/tools" },
          { text: "Transport", link: "/mcp/transport" },
          { text: "Deployment", link: "/mcp/deployment" },
          { text: "API Reference", link: "/mcp/api-reference" },
          { text: "Docker", link: "/deployment/docker" },
          { text: "Integration", link: "/integration/kicad-studio-mcp" },
        ],
      },
      {
        text: "Agents",
        items: [
          { text: "Overview", link: "/agents/" },
          { text: "Client Configurations", link: "/agents/client-configs" },
          { text: "Codex Support", link: "/agents/codex-support" },
        ],
      },
      {
        text: "Architecture",
        items: [
          { text: "Overview", link: "/architecture/" },
          {
            text: "Repository Structure",
            link: "/architecture/repo-structure",
          },
          {
            text: "Product Boundaries",
            link: "/architecture/product-boundaries",
          },
          { text: "Release Model", link: "/architecture/release-model" },
          {
            text: "Branch Protection",
            link: "/architecture/branch-protection",
          },
          {
            text: "Definition of Done",
            link: "/architecture/definition-of-done",
          },
          { text: "Testing Strategy", link: "/testing-strategy" },
        ],
      },
      {
        text: "Release",
        items: [
          { text: "Publishing", link: "/publishing" },
          { text: "Release Runbook", link: "/release" },
          { text: "Beta Program", link: "/beta-program" },
          { text: "Dependency Lifecycle", link: "/dependency-lifecycle" },
          { text: "Security", link: "/security" },
          { text: "Changelog", link: "/changelog/" },
        ],
      },
      {
        text: "Contribute",
        items: [
          { text: "Contributing", link: "/contributing" },
          { text: "Dev Container", link: "/devcontainer" },
          { text: "Contributors", link: "/contributors" },
          { text: "Fixture Corpus", link: "/kicad-fixture-corpus" },
          { text: "Performance Baselines", link: "/performance-baselines" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/oaslananka/kicad-studio-kit",
      },
    ],
    editLink: {
      pattern:
        "https://github.com/oaslananka/kicad-studio-kit/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright 2026 Osman Aslan and contributors.",
    },
    outline: {
      level: [2, 3],
    },
    externalLinkIcon: true,
  },
});
