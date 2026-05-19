import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  formatDiagnosticSummary,
  getActiveAiContext
} from '../../src/ai/context';

function createEditor(fileName: string, text: string) {
  return {
    document: {
      fileName,
      getText: () => text
    }
  };
}

describe('AI context helpers', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-ai-context-'));
    (vscode.window as typeof vscode.window).activeTextEditor = undefined;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    (vscode.window as typeof vscode.window).activeTextEditor = undefined;
  });

  it('returns an empty context when no editor is active', () => {
    const context = getActiveAiContext();

    expect(context.fileName).toBeUndefined();
    expect(context.fileType).toBe('other');
    expect(context.documentPreview).toBe('');
    expect(context.description).toContain('Active file: none');
  });

  it('reads project metadata and truncates the preview for schematics', () => {
    const schematicFile = path.join(tempDir, 'demo.kicad_sch');
    const projectFile = path.join(tempDir, 'demo.kicad_pro');
    const text = Array.from(
      { length: 60 },
      (_, index) => `Line ${index + 1}`
    ).join('\n');

    fs.writeFileSync(schematicFile, text, 'utf8');
    fs.writeFileSync(projectFile, JSON.stringify({ version: '9.0.2' }), 'utf8');
    (vscode.window as typeof vscode.window).activeTextEditor = createEditor(
      schematicFile,
      text
    ) as never;

    const context = getActiveAiContext();

    expect(context.fileType).toBe('schematic');
    expect(context.projectContext.projectName).toBe('demo');
    expect(context.projectContext.kicadVersion).toBe('9.0.2');
    expect(context.documentPreview.split('\n')).toHaveLength(50);
    expect(context.description).toContain('Project: demo');
  });

  it('falls back to directory project discovery and regex version parsing for pcb files', () => {
    const boardFile = path.join(tempDir, 'board.kicad_pcb');
    const projectFile = path.join(tempDir, 'fallback.kicad_pro');
    const boardText = [
      '(kicad_pcb',
      '  (0 "F.Cu" signal)',
      '  (31 "B.Cu" signal)',
      '  (32 "User.Drawings" user)',
      ')'
    ].join('\n');

    fs.writeFileSync(boardFile, boardText, 'utf8');
    fs.writeFileSync(projectFile, '{\n  "version": "8.0.1"\n', 'utf8');
    (vscode.window as typeof vscode.window).activeTextEditor = createEditor(
      boardFile,
      boardText
    ) as never;

    const context = getActiveAiContext();

    expect(context.fileType).toBe('pcb');
    expect(context.projectContext.projectName).toBe('fallback');
    expect(context.projectContext.kicadVersion).toBe('8.0.1');
    expect(context.projectContext.boardLayers).toBe(2);
    expect(context.description).toContain('Board layers: 2');
  });

  it('reads the default variant when no active variant field is present', () => {
    const schematicFile = path.join(tempDir, 'variant.kicad_sch');
    const projectFile = path.join(tempDir, 'variant.kicad_pro');
    const text = '(kicad_sch)';

    fs.writeFileSync(schematicFile, text, 'utf8');
    fs.writeFileSync(
      projectFile,
      JSON.stringify({
        version: '10.0.0',
        variants: [{ name: 'Assembly-A', isDefault: true }]
      }),
      'utf8'
    );
    (vscode.window as typeof vscode.window).activeTextEditor = createEditor(
      schematicFile,
      text
    ) as never;

    const context = getActiveAiContext();

    expect(context.projectContext.activeVariant).toBe('Assembly-A');
  });

  it('formats diagnostic summaries consistently', () => {
    expect(
      formatDiagnosticSummary({
        file: '/workspace/board.kicad_pcb',
        errors: 3,
        warnings: 2,
        infos: 1,
        source: 'drc'
      })
    ).toBe('DRC summary for board.kicad_pcb: 3 errors, 2 warnings, 1 infos.');
  });
});
