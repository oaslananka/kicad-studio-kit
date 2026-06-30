import { defineConfig } from "vitepress";
import { docsSiteBase } from "../../scripts/lib/docs-site-config.mjs";

export default defineConfig({
  vite: {
    build: {
      target: "es2021",
    },
  },
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
          { text: "Getting Started", link: "/getting-started" },
          { text: "Install", link: "/install" },
          { text: "FAQ", link: "/faq" },
          { text: "Versions", link: "/versions" },
          { text: "Support Matrix", link: "/support-matrix" },
          {
            text: "KiCad 10.0.3 Feature Parity",
            link: "/compatibility/kicad-10-0-3-feature-parity",
          },
          {
            text: "KiCad 10 → 11 Migration Guide",
            link: "/compatibility/kicad-10-to-11-migration",
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
          { text: "BoardReadyOps", link: "/board-ready-ops" },
          { text: "Troubleshooting", link: "/extension/troubleshooting" },
          { text: "Accessibility", link: "/accessibility" },
          { text: "UI/UX Review", link: "/ux-review-1.0" },
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
          { text: "Governance Board", link: "/architecture/governance-board" },
          { text: "Migration Phases", link: "/architecture/migration-phases" },
          {
            text: "M0 Completion Audit",
            link: "/architecture/m0-completion-audit",
          },
          {
            text: "Protocol Change Checklist",
            link: "/architecture/protocol-change-checklist",
          },
        ],
      },
      {
        text: "Decision Records",
        items: [
          { text: "Overview", link: "/adr/" },
          {
            text: "ADR 01: Monorepo Two Products",
            link: "/adr/0001-monorepo-two-products",
          },
          {
            text: "ADR 02: MCP Contract-First",
            link: "/adr/0002-mcp-contract-first-integration",
          },
          {
            text: "ADR 03: Independent Release Model",
            link: "/adr/0003-independent-release-model",
          },
          {
            text: "ADR 04: No Direct Cross-Product Imports",
            link: "/adr/0004-no-direct-cross-product-imports",
          },
          {
            text: "ADR 05: KiCad Version Support Policy",
            link: "/adr/0005-kicad-version-support-policy",
          },
          {
            text: "ADR 06: VS Code Web Compatibility",
            link: "/adr/0006-vscode-web-compatibility",
          },
          {
            text: "ADR 07: Agent Onboarding Config Pack",
            link: "/adr/0007-agent-onboarding-config-pack",
          },
          {
            text: "ADR 08: MCP 2026-07-28 Protocol Upgrade",
            link: "/adr/0008-mcp-2026-07-28-protocol-upgrade",
          },
          {
            text: "ADR 09: Split kicad-mcp-pro into Separate Repo",
            link: "/adr/0009-split-kicad-mcp-pro-into-separate-repository",
          },
        ],
      },
      {
        text: "Release",
        items: [
          { text: "Publishing", link: "/publishing" },
          { text: "Emergency Release Flow", link: "/EMERGENCY-RELEASE-FLOW" },
          { text: "Release Coordination", link: "/RELEASE-COORDINATION" },
          { text: "Release Runbook", link: "/release" },
          { text: "Beta Program", link: "/beta-program" },
          { text: "GA Readiness", link: "/ga-readiness" },
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
          { text: "Best Practices Evidence", link: "/best-practices-evidence" },
          {
            text: "Best Practices Questionnaire",
            link: "/best-practices-questionnaire",
          },
          { text: "Protocol Schemas", link: "/protocol-schemas" },
          { text: "Reusable Workflows", link: "/reusable-workflows" },
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
