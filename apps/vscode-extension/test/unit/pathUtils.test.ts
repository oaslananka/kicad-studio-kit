import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  findSiblingProjectFile,
  getWorkspaceRoot,
  isKiCadFile,
  normalizeUserPath,
  pathExistsOnAnyPlatform,
  relativeToWorkspace,
  resolveWorkspaceOutputDir,
  toPosixPath
} from '../../src/utils/pathUtils';

describe('pathUtils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-path-utils-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects KiCad files from strings and Uris', () => {
    expect(isKiCadFile('board.kicad_pcb')).toBe(true);
    expect(isKiCadFile(vscode.Uri.file('/tmp/schematic.kicad_sch'))).toBe(true);
    expect(isKiCadFile('notes.txt')).toBe(false);
  });

  it('returns the workspace root for an explicit uri or the first folder', () => {
    const explicit = getWorkspaceRoot(
      vscode.Uri.file('/workspace/demo/board.kicad_pcb')
    );
    const implicit = getWorkspaceRoot();

    expect(explicit).toBe(process.cwd());
    expect(implicit).toBe(process.cwd());
  });

  it('normalizes workspace-relative and posix paths', () => {
    const sample = ['folder', 'child', 'file.kicad_pcb'].join(path.sep);

    expect(toPosixPath(sample)).toBe('folder/child/file.kicad_pcb');
    expect(
      relativeToWorkspace(
        path.join(process.cwd(), 'folder', 'board.kicad_pcb'),
        process.cwd()
      )
    ).toBe('folder/board.kicad_pcb');
    expect(relativeToWorkspace('/tmp/board.kicad_pcb', '')).toBe(
      '/tmp/board.kicad_pcb'
    );
  });

  it('checks path existence for present and missing files', () => {
    const existing = path.join(tempDir, 'exists.txt');
    fs.writeFileSync(existing, 'ok', 'utf8');

    expect(pathExistsOnAnyPlatform(existing)).toBe(true);
    expect(pathExistsOnAnyPlatform(path.join(tempDir, 'missing.txt'))).toBe(
      false
    );
  });

  it('expands home-relative user paths', () => {
    const expanded = normalizeUserPath('~/kicad/config');
    const homeOnly = normalizeUserPath('~');
    const normalized = normalizeUserPath('folder/../board.kicad_pcb');
    const quoted = normalizeUserPath(
      '"C:\\Program Files\\KiCad\\kicad-cli.exe"'
    );

    expect(expanded).toContain('kicad');
    expect(homeOnly).toBe(os.homedir());
    expect(normalized.endsWith(`board.kicad_pcb`)).toBe(true);
    expect(quoted).not.toContain('"');
    expect(quoted).toContain('Program Files');
    expect(normalizeUserPath('   ')).toBe('');
    expect(normalizeUserPath('""')).toBe('');
  });

  it('keeps configured output directories inside the workspace', () => {
    const workspaceFile = path.join(process.cwd(), 'package.json');
    const resolved = resolveWorkspaceOutputDir(workspaceFile, 'fab');
    const blank = resolveWorkspaceOutputDir(workspaceFile, '   ');

    expect(resolved).toBe(path.join(process.cwd(), 'fab'));
    expect(blank).toBe(path.join(process.cwd(), 'fab'));
    expect(() => resolveWorkspaceOutputDir(workspaceFile, '..')).toThrow(
      'Output directory must stay inside the workspace'
    );
    expect(() => resolveWorkspaceOutputDir(workspaceFile, tempDir)).toThrow(
      'Output directory must stay inside the workspace'
    );
    expect(resolveWorkspaceOutputDir(workspaceFile, 'fab/nested/output')).toBe(
      path.join(process.cwd(), 'fab', 'nested', 'output')
    );
  });

  it('rejects output paths that escape through symlinked parents', () => {
    const workspaceFile = path.join(process.cwd(), 'package.json');
    const outside = path.join(tempDir, 'outside');
    const link = path.join(process.cwd(), '.tmp-kicadstudio-outside-link');
    fs.mkdirSync(outside, { recursive: true });

    try {
      fs.symlinkSync(
        outside,
        link,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } catch {
      return;
    }

    try {
      expect(() =>
        resolveWorkspaceOutputDir(workspaceFile, path.basename(link))
      ).toThrow('Output directory must stay inside the workspace');
    } finally {
      fs.rmSync(link, { recursive: true, force: true });
    }
  });

  it('finds sibling project files and handles unreadable directories', () => {
    const boardFile = path.join(tempDir, 'board.kicad_pcb');
    const exactProject = path.join(tempDir, 'board.kicad_pro');
    const fallbackProject = path.join(tempDir, 'fallback.kicad_pro');

    fs.writeFileSync(exactProject, '{}', 'utf8');
    expect(findSiblingProjectFile(boardFile)).toBe(exactProject);

    fs.rmSync(exactProject, { force: true });
    fs.writeFileSync(fallbackProject, '{}', 'utf8');
    expect(findSiblingProjectFile(boardFile)).toBe(fallbackProject);
    expect(
      findSiblingProjectFile(path.join(tempDir, 'missing', 'board.kicad_pcb'))
    ).toBeUndefined();
  });
});
