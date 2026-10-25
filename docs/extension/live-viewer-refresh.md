# Live PCB and schematic viewer refresh

KiCad Studio automatically refreshes an **open, visible** PCB or schematic
viewer when another application saves its source file. The change can come
from KiCad, an MCP-driven workflow, a script, or another editor: no MCP
connection or additional background service is needed.

## How it works

- The extension uses VS Code's workspace file-change notifications for
  `*.kicad_pcb` and `*.kicad_sch`. The corresponding watcher is created
  only while at least one viewer of that type is open, and is disposed when
  the last such viewer closes. There is no periodic filesystem polling.
- Repeated notifications for the same open file are coalesced for 500 ms.
  The extension compares file size and modification time twice, 120 ms
  apart, before loading the new content. Unchanged files do not redraw.
- A hidden viewer is not redrawn in the background. It refreshes when shown.
  On focus the extension also compares file metadata, which helps recover
  from missed file notifications on some remote or network drives.
- Obvious incomplete external writes are rejected. The old image is retained
  until a later change or focus; a repeated failed read is not continuously
  retried. As with any file watcher, a fully valid-looking intermediate
  write cannot be distinguished perfectly from a finished file.
- Files over the existing interactive-viewer size limit continue to use the
  metadata-only fallback. The viewer preserves its existing selection,
  layers and other state during refresh.
- If a text editor has unsaved changes for the same file, external refresh
  is held until the document is saved. **The extension does not overwrite
  unsaved editor contents.**
- DRC/ERC findings are marked stale after a successful viewer refresh.
  Refresh does **not** run DRC/ERC, export manufacturing files, modify the
  design or approve a manufacturing gate.

## Configuration and limitations

The existing setting `kicadstudio.viewer.autoRefresh` (default: `true`)
controls automatic save-based and external-change refresh. Disable it to
use manual refresh only. In an embedded viewer, press **R** to request a
manual refresh.

This refreshes **KiCad Studio's embedded KiCanvas preview**, not a separate
KiCad PCB Editor or Schematic Editor process. It does not perform incremental
component-level rendering: KiCanvas reconstructs its view on a changed file,
so a large board can take longer than the notification debounce.

VS Code file event delivery can vary across workspaces, symlinks, remote and
network filesystems. A metadata check on viewer focus and the existing manual
refresh provide fallback paths. Source detection is based on file size and
modification time, not a continuous content hash, so an external writer that
deliberately preserves both metadata values may require manual refresh.

The implementation is event-driven and has no MCP protocol changes.
