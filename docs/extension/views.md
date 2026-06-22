# Extension Views

Machine-maintained from the VS Code extension contribution manifest.
Refresh with `corepack pnpm run docs:generate`.

## Sidebar Views

| View ID | Name | Container | Type | When |
| --- | --- | --- | --- | --- |
| `kicadstudio.projectTree` | KiCad Project | `kicadstudio-sidebar` | tree |  |
| `kicadstudio.validation` | Validation | `kicadstudio-sidebar` | tree | `kicadstudio.hasProject` |
| `kicadstudio.qualityGate` | Quality Gates | `kicadstudio-sidebar` | tree | `kicadstudio.hasProject` |
| `kicadstudio.bomView` | Bill of Materials | `kicadstudio-sidebar` | webview | `kicadstudio.hasProject` |
| `kicadstudio.netlistView` | Netlist | `kicadstudio-sidebar` | webview | `kicadstudio.hasProject` |
| `kicadstudio.variants` | Variants | `kicadstudio-sidebar` | tree | `kicadstudio.hasProject &amp;&amp; kicadstudio.kicad10Plus` |
| `kicadstudio.library` | Library | `kicadstudio-sidebar` | tree |  |
| `kicadstudio.drcRules` | DRC Rules | `kicadstudio-sidebar` | tree | `kicadstudio.hasProject` |
| `kicadstudio.fixQueue` | AI Fix Queue | `kicadstudio-sidebar` | tree | `kicadstudio.mcpConnected` |
| `kicadstudio.componentSearch` | Component Search | `kicadstudio-sidebar` | tree |  |
| `kicadstudio.mcpTools` | MCP &amp; Tools | `kicadstudio-sidebar` | tree | `kicadstudio.hasProject` |

## Custom Editors

| View type | Display name | Selector | Priority |
| --- | --- | --- | --- |
| `kicadstudio.schematicViewer` | KiCad Schematic Viewer | `*.kicad_sch` | default |
| `kicadstudio.pcbViewer` | KiCad PCB Viewer | `*.kicad_pcb` | default |
