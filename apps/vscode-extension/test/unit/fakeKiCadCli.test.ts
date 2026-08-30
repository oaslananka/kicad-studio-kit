import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { installFakeKiCadCli } from '../e2e/fakeKiCadCli';

describe('fake KiCad CLI E2E fixture', () => {
  it('reports a KiCad 9 version and writes the requested PCB SVG output', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-kicad-cli-'));
    try {
      const cli = installFakeKiCadCli(root);
      expect(
        execFileSync(cli.executablePath, [...cli.args, '--version'], {
          encoding: 'utf8'
        })
      ).toContain(
        'KiCad CLI 9.0.0'
      );

      const output = path.join(root, 'out', 'board-viewer.svg');
      execFileSync(
        cli.executablePath,
        [
          ...cli.args,
          'pcb',
          'export',
          'svg',
          '--output',
          output,
          '--layers',
          'F.Cu,Edge.Cuts',
          '--mode-single',
          '--page-size-mode',
          '0',
          '--drill-shape-opt',
          '0',
          path.join(root, 'sample.kicad_pcb')
        ],
        { encoding: 'utf8' }
      );

      expect(fs.readFileSync(output, 'utf8')).toContain('<svg');
      expect(fs.readFileSync(output, 'utf8')).toContain('viewBox="0 0 800 600"');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
