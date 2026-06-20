# Getting Started

This guide walks you through your first KiCad Studio experience. It takes about 15 minutes.

---

## 1. Install VS Code and the Extension

1. Install [VS Code](https://code.visualstudio.com/) (1.101.0 or later).
2. Open VS Code, go to the **Extensions** view (`Ctrl+Shift+X`).
3. Search for **KiCad Studio Kit** and click **Install**.
4. After installation, the KiCad Studio icon appears in the Activity Bar.

> **Tip:** You can also download the `.vsix` from [GitHub Releases](https://github.com/oaslananka/kicad-studio-kit/releases)
> and install via `Extensions → ... → Install from VSIX...`.

---

## 2. (Optional) Install kicad-cli

Some features (DRC, ERC, exports) need `kicad-cli`. Install the full KiCad application
from [kicad.org](https://www.kicad.org/download/) to get it.

To verify:

```bash
kicad-cli --version
```

If auto-detection fails, set the path in VS Code Settings → `kicadstudio.kicadCliPath`.

---

## 3. Open a KiCad Project

1. Click **File → Open Folder** (`Ctrl+K Ctrl+O`).
2. Select a folder that contains a `.kicad_pro` file (any KiCad project).
3. The **KiCad Project** view in the Activity Bar sidebar shows your project tree.

> **No project yet?** Download the [LED Basic example](https://github.com/oaslananka/kicad-studio-kit/tree/main/examples/led-basic) from the repository.

### Multi-root and multi-project workspaces

KiCad Studio discovers every `.kicad_pro` file across all folders of a
multi-root workspace, so a single window can contain several KiCad projects.
Commands, views, diagnostics, and the MCP context all operate on one **active
project** at a time:

- The active project name is shown in the status bar. Click it to switch.
- Run **KiCad: Select Active Project** from the Command Palette, or use the
  selector button in the **KiCad Project** view title bar.
- With one project the active project is chosen automatically; with several it
  is chosen from your last selection (persisted per workspace), then the project
  owning the active file, then the first project alphabetically.
- Switching the active project refreshes the project tree, variants,
  diagnostics, and the live MCP context. If the selected project is removed, the
  extension falls back to another available project automatically.

---

## 4. View a Schematic

1. In the project tree, click any `.kicad_sch` file.
2. The schematic opens in the built-in KiCad Schematic Viewer.
3. Use the toolbar to zoom, pan, and toggle layers.

---

## 5. View a PCB

1. Click a `.kicad_pcb` file in the project tree.
2. The PCB opens in the built-in KiCad PCB Viewer.
3. Use the layer panel to show/hide copper layers, silkscreen, etc.

---

## 6. Run Design Checks

1. Open the **Validation** view in the sidebar.
2. Click **Run DRC** (Design Rule Check) or **Run ERC** (Electrical Rule Check).
3. Results appear in the **Problems** panel (`Ctrl+Shift+M`).

---

## 7. Export Files

1. Open the Command Palette (`Ctrl+Shift+P`).
2. Type `KiCad: Export` and choose an export format:
   - **Gerber Files** — for PCB fabrication
   - **PDF (Schematic)** or **PDF (PCB)** — documentation
   - **Interactive HTML BOM** — shareable bill of materials
   - **Pick and Place** — assembly file
   - **3D Model (GLB/BREP/PLY)** — mechanical integration

Exports go to the `kicad-studio-output/` folder in your project directory.

---

## 8. (Optional) Connect kicad-mcp-pro

For AI-assisted workflows — quality gates, fix queues, design intent forms:

1. Install kicad-mcp-pro: `pip install kicad-mcp-pro`
2. Launch it in HTTP mode: `kicad-mcp-pro --port 27185`
3. In VS Code, run **KiCad: Setup MCP Integration** from the Command Palette.
4. Open the **MCP & Tools** sidebar view — it should show "Connected".

See [MCP Overview](/mcp/) for transport options and profiles.

---

## 9. Try AI Features

1. Open the **AI Chat** panel (sidebar or `Ctrl+Shift+I`).
2. Ask: "Summarize the DRC violations" or "Explain this schematic block".
3. Configure your AI provider in **Settings → KiCad Studio → AI** if not already set.

---

## 10. Next Steps

- Read the [Extension docs](/extension/) for command and settings reference.
- Explore [MCP integration](/mcp/) for advanced design review workflows.
- Check the [Workflows](/workflows/manufacturing-export) for production pipelines.
- Visit the [FAQ](/faq) for common questions.
