jest.mock('node:child_process', () => ({
  spawnSync: jest.fn()
}));

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { GitDiffDetector } from '../../src/git/gitDiffDetector';
import { SExpressionParser } from '../../src/language/sExpressionParser';

describe('GitDiffDetector', () => {
  it('classifies added, removed, and changed components', async () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const tempFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'gitdiff-temp.kicad_sch'
    );
    detector.readGitVersion = jest
      .fn()
      .mockImplementation((_root: string, _ref: string) => {
        return `(kicad_sch
        (symbol (property "Reference" "R1") (property "Value" "10k") (uuid "11111111-1111-1111-1111-111111111111"))
        (symbol (property "Reference" "R2") (property "Value" "10k") (uuid "22222222-2222-2222-2222-222222222222"))
      )`;
      });

    fs.writeFileSync(
      tempFile,
      `(kicad_sch
        (symbol (property "Reference" "R1") (property "Value" "22k") (uuid "11111111-1111-1111-1111-111111111111"))
        (symbol (property "Reference" "R3") (property "Value" "1k") (uuid "33333333-3333-3333-3333-333333333333"))
      )`,
      'utf8'
    );

    const diffs = await detector.getChangedComponents(tempFile);
    expect(
      diffs.some(
        (item: any) => item.type === 'changed' && item.reference === 'R1'
      )
    ).toBe(true);
    expect(
      diffs.some(
        (item: any) => item.type === 'removed' && item.reference === 'R2'
      )
    ).toBe(true);
    expect(
      diffs.some(
        (item: any) => item.type === 'added' && item.reference === 'R3'
      )
    ).toBe(true);
    fs.rmSync(tempFile, { force: true });
  });

  it('returns an empty array when there are no component differences', async () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const tempFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'gitdiff-same.kicad_sch'
    );
    const source = `(kicad_sch
      (symbol (property "Reference" "R1") (property "Value" "10k") (uuid "11111111-1111-1111-1111-111111111111"))
    )`;
    detector.readGitVersion = jest.fn().mockReturnValue(source);
    fs.writeFileSync(tempFile, source, 'utf8');

    await expect(detector.getChangedComponents(tempFile)).resolves.toEqual([]);
    fs.rmSync(tempFile, { force: true });
  });

  it('gracefully falls back when git show fails', async () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    detector.readGitVersion = jest.fn().mockReturnValue('');
    const tempFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'gitdiff-fallback.kicad_sch'
    );
    fs.writeFileSync(
      tempFile,
      `(kicad_sch (symbol (property "Reference" "R3") (property "Value" "1k") (uuid "33333333-3333-3333-3333-333333333333")))`,
      'utf8'
    );
    const diffs = await detector.getChangedComponents(tempFile);
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'added', reference: 'R3' })
      ])
    );
    fs.rmSync(tempFile, { force: true });
  });

  it('compares two git references without reading the working file', async () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const tempFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'gitdiff-ref.kicad_sch'
    );
    detector.readGitVersion = jest
      .fn()
      .mockImplementation((_root: string, ref: string) =>
        ref === 'HEAD'
          ? `(kicad_sch (symbol (property "Reference" "R1") (property "Value" "10k") (uuid "11111111-1111-1111-1111-111111111111")))`
          : `(kicad_sch (symbol (property "Reference" "R1") (property "Value" "22k") (uuid "11111111-1111-1111-1111-111111111111")))`
      );

    const diffs = await detector.getChangedComponents(
      tempFile,
      'HEAD',
      'feature'
    );

    expect(diffs).toEqual([
      expect.objectContaining({ type: 'changed', reference: 'R1' })
    ]);
    expect(detector.readGitVersion).toHaveBeenCalledWith(
      expect.any(String),
      'feature',
      expect.stringContaining('gitdiff-ref.kicad_sch')
    );
  });

  it('returns before and after text for explicit file-version reads', () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const tempFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'gitdiff-versions.kicad_sch'
    );
    detector.readGitVersion = jest.fn().mockReturnValue('before');
    fs.writeFileSync(tempFile, 'after', 'utf8');

    expect(detector.readFileVersions(tempFile, 'BASE')).toEqual({
      beforeText: 'before',
      afterText: 'after'
    });
    expect(detector.readGitVersion).toHaveBeenCalledWith(
      expect.any(String),
      'BASE',
      expect.stringContaining('gitdiff-versions.kicad_sch')
    );
    fs.rmSync(tempFile, { force: true });
  });

  it('throws when bounded git show fails before completion', () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;
    spawnSyncMock.mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawn timed out')
    });

    expect(() =>
      detector.readGitVersion(process.cwd(), 'HEAD', 'board.kicad_sch')
    ).toThrow('spawn timed out');
  });

  it('returns empty text only when the file is missing from the ref', () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;
    spawnSyncMock.mockReturnValue({
      status: 128,
      stdout: '',
      stderr: "fatal: Path 'board.kicad_sch' does not exist in 'HEAD'"
    });

    expect(
      detector.readGitVersion(process.cwd(), 'HEAD', 'board.kicad_sch')
    ).toBe('');
  });

  it('returns stdout for successful git show and rejects non-missing failures', () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;

    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: '(kicad_sch)',
      stderr: ''
    });
    expect(
      detector.readGitVersion(process.cwd(), 'HEAD', 'board.kicad_sch')
    ).toBe('(kicad_sch)');

    spawnSyncMock.mockReturnValueOnce({
      status: 128,
      stdout: '',
      stderr: 'fatal: not a git repository'
    });
    expect(() =>
      detector.readGitVersion(process.cwd(), 'HEAD', 'board.kicad_sch')
    ).toThrow('not a git repository');
  });

  it('ignores malformed component nodes without identifiers', async () => {
    const detector = new GitDiffDetector(new SExpressionParser()) as any;
    const tempFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'gitdiff-malformed.kicad_sch'
    );
    detector.readGitVersion = jest.fn().mockReturnValue('(kicad_sch)');
    fs.writeFileSync(
      tempFile,
      '(kicad_sch (symbol (property "Value" "10k")))',
      'utf8'
    );

    await expect(detector.getChangedComponents(tempFile)).resolves.toEqual([]);
    fs.rmSync(tempFile, { force: true });
  });
});
