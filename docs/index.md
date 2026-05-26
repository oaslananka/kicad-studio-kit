---
layout: home

hero:
  name: KiCad Studio Kit
  text: Searchable docs for KiCad Studio and kicad-mcp-pro
  tagline: Extension workflows, MCP deployment, compatibility policy, release runbooks, and generated API references from the monorepo source of truth.
  image:
    src: /screenshots/pcb-viewer.png
    alt: KiCad Studio PCB viewer
  actions:
    - theme: brand
      text: Install
      link: /install
    - theme: alt
      text: Extension Docs
      link: /extension/
    - theme: alt
      text: MCP Docs
      link: /mcp/

features:
  - title: Quick install paths
    details: Use the VS Code extension, the Python MCP server, the npm launcher, or the Docker image depending on your workflow.
    link: /install
  - title: Generated extension reference
    details: Commands, views, and settings are generated directly from the VS Code extension manifest.
    link: /extension/commands
  - title: Generated MCP reference
    details: The tool catalog and server-info contract are generated from kicad-mcp-pro source and protocol schemas.
    link: /mcp/tools
  - title: Compatibility matrix
    details: KiCad, VS Code, Node, pnpm, Python, MCP protocol, and release gates are summarized from compatibility.yaml.
    link: /support-matrix
  - title: Release lifecycle
    details: Publishing, beta testing, changelogs, dependency policy, and security controls are documented in one place.
    link: /publishing
  - title: Architecture and contribution flow
    details: Product boundaries, ownership, branch protection, test strategy, and contributor expectations are reachable from the architecture section.
    link: /architecture/
  - title: Agent onboarding
    details: Root agent instructions, MCP client setup examples, and Codex support boundaries are documented for repeatable coding-agent workflows.
    link: /agents/
---
