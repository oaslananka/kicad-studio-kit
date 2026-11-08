import * as vscode from 'vscode';
import { getActiveResourceUri } from '../../src/utils/workspaceUtils';

interface MutableWindow {
  activeTextEditor: { document: { uri: vscode.Uri } } | undefined;
  tabGroups: {
    activeTabGroup: {
      activeTab: { input: { uri?: vscode.Uri } } | undefined;
    };
  };
}

describe('active KiCad document resolution for custom editor tabs', () => {
  const window = vscode.window as unknown as MutableWindow;
  const initialEditor = window.activeTextEditor;
  const initialTab = window.tabGroups.activeTabGroup.activeTab;

  afterEach(() => {
    window.activeTextEditor = initialEditor;
    window.tabGroups.activeTabGroup.activeTab = initialTab;
  });

  it('uses the active custom schematic tab even if an older text editor remains available', () => {
    const staleEditor = vscode.Uri.file('/workspace/old.kicad_pcb');
    const activeSchematic = vscode.Uri.file('/workspace/current.kicad_sch');
    window.activeTextEditor = { document: { uri: staleEditor } };
    window.tabGroups.activeTabGroup.activeTab = {
      input: { uri: activeSchematic }
    };
    expect(getActiveResourceUri()?.fsPath).toBe(activeSchematic.fsPath);
  });

  it('uses the active PCB tab instead of a stale schematic editor', () => {
    const staleEditor = vscode.Uri.file('/workspace/old.kicad_sch');
    const activeBoard = vscode.Uri.file('/workspace/current.kicad_pcb');
    window.activeTextEditor = { document: { uri: staleEditor } };
    window.tabGroups.activeTabGroup.activeTab = {
      input: { uri: activeBoard }
    };
    expect(getActiveResourceUri()?.fsPath).toBe(activeBoard.fsPath);
  });

  it('falls back to the focused text editor for a URI-less active tab', () => {
    const textFile = vscode.Uri.file('/workspace/design.kicad_sch');
    window.activeTextEditor = { document: { uri: textFile } };
    window.tabGroups.activeTabGroup.activeTab = { input: {} };
    expect(getActiveResourceUri()?.fsPath).toBe(textFile.fsPath);
  });

  it('returns undefined without a resource-bearing active tab or editor', () => {
    window.activeTextEditor = undefined;
    window.tabGroups.activeTabGroup.activeTab = undefined;
    expect(getActiveResourceUri()).toBeUndefined();
  });
});
