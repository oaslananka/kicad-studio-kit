import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  bufferToBase64,
  decodeBase64ToUtf8,
  ensureDirectory,
  fileExists,
  findWorkspaceFileByExtension,
  inferOutputPath,
  listWorkspaceKiCadFiles,
  readTextFile,
  readTextFileSync,
  safeReadJson
} from '../../src/utils/fileUtils';

describe('fileUtils', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-file-utils-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads text files via VS Code workspace fs', async () => {
    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValueOnce(
      Uint8Array.from(Buffer.from('hello'))
    );

    await expect(readTextFile(vscode.Uri.file('/tmp/file.txt'))).resolves.toBe(
      'hello'
    );
  });

  it('reads text files synchronously and detects file existence', async () => {
    const filePath = path.join(tempDir, 'demo.txt');
    fs.writeFileSync(filePath, 'sync read', 'utf8');

    expect(readTextFileSync(filePath)).toBe('sync read');
    await expect(fileExists(filePath)).resolves.toBe(true);
    await expect(fileExists(path.join(tempDir, 'missing.txt'))).resolves.toBe(
      false
    );
  });

  it('creates directories recursively', () => {
    const nested = path.join(tempDir, 'a', 'b', 'c');

    ensureDirectory(nested);

    expect(fs.existsSync(nested)).toBe(true);
  });

  it('delegates workspace file search helpers with KiCad patterns', async () => {
    const found = [vscode.Uri.file('/workspace/board.kicad_pcb')];
    (vscode.workspace.findFiles as jest.Mock)
      .mockResolvedValueOnce(found)
      .mockResolvedValueOnce(found);

    await expect(listWorkspaceKiCadFiles()).resolves.toEqual(found);
    await expect(findWorkspaceFileByExtension('.kicad_sch')).resolves.toEqual(
      found[0]
    );

    expect(
      (vscode.workspace.findFiles as jest.Mock).mock.calls[0]?.[0]
    ).toContain('kicad_pcb');
    expect((vscode.workspace.findFiles as jest.Mock).mock.calls[1]?.[0]).toBe(
      '**/*.kicad_sch'
    );
  });

  it('reads JSON safely and handles invalid files', () => {
    const goodFile = path.join(tempDir, 'good.json');
    const badFile = path.join(tempDir, 'bad.json');
    fs.writeFileSync(goodFile, JSON.stringify({ ok: true }), 'utf8');
    fs.writeFileSync(badFile, '{oops', 'utf8');

    expect(safeReadJson<{ ok: boolean }>(goodFile)).toEqual({ ok: true });
    expect(safeReadJson<{ ok: boolean }>(badFile)).toBeUndefined();
  });

  it('encodes and decodes base64 payloads and infers output paths', () => {
    const encoded = bufferToBase64(Buffer.from('KiCad'));

    expect(decodeBase64ToUtf8(encoded)).toBe('KiCad');
    expect(
      inferOutputPath(
        '/workspace/project/board.kicad_pcb',
        '/workspace/out',
        '-fab',
        '.zip'
      )
    ).toBe(path.join('/workspace/out', 'board-fab.zip'));
  });
});
