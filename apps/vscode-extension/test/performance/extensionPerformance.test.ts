jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('vscode', () => jest.requireActual('../unit/vscodeMock'), {
  virtual: true
});

import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as vscode from 'vscode';
import { BomParser } from '../../src/bom/bomParser';
import { KiCadCliRunner } from '../../src/cli/kicadCliRunner';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { createKiCanvasViewerHtml } from '../../src/providers/viewerHtml';
import { discoverKiCadProjects } from '../../src/workspace/projectContext';
import { __setConfiguration, Uri } from '../unit/vscodeMock';

interface PerformanceCatalogMetric {
  baseline: number;
  unit: 'ms' | 'MB';
  ciRequired: boolean;
  summary: string;
  source: string;
}

interface PerformanceCatalog {
  tolerance: {
    failureRatio: number;
  };
  metrics: Record<string, PerformanceCatalogMetric>;
}

interface PerformanceMeasurement {
  metric: string;
  value: number;
  unit: 'ms' | 'MB';
  statistic: 'p95';
  samples: number;
  sampleValues: number[];
}

type ChildProcessMock = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(EXTENSION_ROOT, '..', '..');
const FIXTURE_ROOT = path.join(EXTENSION_ROOT, 'test', 'fixtures', 'kicad');
const PERFORMANCE_CATALOG = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'performance', 'baselines.json'), 'utf8')
) as PerformanceCatalog;
const OUTPUT_PATH = process.env['KICAD_EXTENSION_PERFORMANCE_MEASUREMENTS_JSON']
  ? path.resolve(
      REPO_ROOT,
      process.env['KICAD_EXTENSION_PERFORMANCE_MEASUREMENTS_JSON']
    )
  : undefined;
const measurements: PerformanceMeasurement[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  __setConfiguration({});
});

afterAll(() => {
  if (!OUTPUT_PATH) {
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        source: 'apps/vscode-extension/test/performance/extensionPerformance.test.ts',
        measurements
      },
      null,
      2
    )}\n`,
    'utf8'
  );
});

describe('OASLANA-46 extension performance budgets', () => {
  it('measures activation manifest readiness', async () => {
    await recordMetric('extension.activation.cold.posix_ms', async () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(EXTENSION_ROOT, 'package.json'), 'utf8')
      ) as {
        activationEvents?: string[];
        contributes?: { commands?: unknown[]; views?: Record<string, unknown[]> };
      };

      expect(manifest.activationEvents?.length).toBeGreaterThan(0);
      expect(manifest.contributes?.commands?.length).toBeGreaterThan(0);
      expect(Object.keys(manifest.contributes?.views ?? {})).toContain(
        'kicadstudio-sidebar'
      );
    });
  });

  it('measures project discovery across small, medium, and large workspaces', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-perf-projects-')
    );
    try {
      writeProject(tempDir, 'single');
      const single = await recordMetric(
        'extension.project_scan.single_ms',
        () => discoverProjectCount(tempDir)
      );
      expect(single).toBe(1);

      for (const name of ['alpha', 'beta', 'gamma']) {
        writeProject(tempDir, name);
      }
      const medium = await recordMetric(
        'extension.project_scan.medium_ms',
        () => discoverProjectCount(tempDir)
      );
      expect(medium).toBe(4);

      for (let index = 0; index < 6; index += 1) {
        writeProject(tempDir, `large-${index}`, 14);
      }
      const large = await recordMetric(
        'extension.project_scan.large_ms',
        () => discoverProjectCount(tempDir)
      );
      expect(large).toBe(10);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('measures viewer first-render and reload HTML generation', async () => {
    const schematicText = readFixture(
      'clean-led-kicad10',
      'clean-led-kicad10.kicad_sch'
    );
    const pcbText = readFixture('clean-led-kicad10', 'clean-led-kicad10.kicad_pcb');
    const largePcbText = readFixture('large-board', 'large-board.kicad_pcb');

    await recordMetric('extension.viewer.schematic_first_render_ms', () => {
      expect(renderViewer('schematic', 'clean-led-kicad10.kicad_sch', schematicText)).toContain(
        'kicanvas-source'
      );
    });
    await recordMetric('extension.viewer.pcb_first_render_ms', () => {
      expect(renderViewer('board', 'clean-led-kicad10.kicad_pcb', pcbText)).toContain(
        'kicanvas-source'
      );
    });
    await recordMetric('extension.viewer.large_pcb_first_render_ms', () => {
      expect(renderViewer('board', 'large-board.kicad_pcb', largePcbText)).toContain(
        'kicanvas-source'
      );
    });
    await recordMetric('extension.viewer.reload_ms', () => {
      expect(
        renderViewer('board', 'clean-led-kicad10.kicad_pcb', pcbText, {
          zoom: 1.25,
          grid: true,
          theme: 'kicad'
        })
      ).toContain('"zoom":1.25');
    });
  });

  it('measures large BOM and netlist parsing', async () => {
    await recordMetric('extension.bom.large_parse_ms', () => {
      const parser = new BomParser(new SExpressionParser());
      expect(parser.parse(createLargeSchematic(1000), true)).toHaveLength(10);
    });

    await recordMetric('extension.netlist.large_parse_ms', () => {
      const parser = new SExpressionParser();
      const root = parser.parse(createLargeNetlist(1000));
      expect(parser.findAllNodes(root, 'net')).toHaveLength(1000);
    });
  });

  it('measures KiCad CLI cancellation for validation and export operations', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-perf-cli-')
    );
    try {
      await recordMetric('extension.validation.cancel_ms', () =>
        measureCliCancellation(tempDir, ['pcb', 'drc', 'board.kicad_pcb'])
      );
      await recordMetric('extension.export.command_cancel_ms', () =>
        measureCliCancellation(tempDir, [
          'pcb',
          'export',
          'gerbers',
          'board.kicad_pcb'
        ])
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

async function recordMetric<T>(
  metricId: string,
  operation: () => T | Promise<T>,
  sampleCount = 5
): Promise<T> {
  const metric = PERFORMANCE_CATALOG.metrics[metricId];
  if (!metric) {
    throw new Error(`Missing performance catalog metric: ${metricId}`);
  }
  expect(metric.unit).toBe('ms');

  let lastResult: T | undefined;
  const sampleValues: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    lastResult = await operation();
    sampleValues.push(Math.max(performance.now() - startedAt, 0.001));
  }

  const p95 = percentile(sampleValues, 0.95);
  const failureLimit = metric.baseline * PERFORMANCE_CATALOG.tolerance.failureRatio;
  expect(p95).toBeLessThanOrEqual(failureLimit);
  measurements.push({
    metric: metricId,
    value: Number(p95.toFixed(6)),
    unit: metric.unit,
    statistic: 'p95',
    samples: sampleValues.length,
    sampleValues: sampleValues.map((value) => Number(value.toFixed(6)))
  });
  return lastResult as T;
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentileValue) - 1
  );
  return sorted[index] ?? 0.001;
}

async function discoverProjectCount(workspaceRoot: string): Promise<number> {
  const projects = await discoverKiCadProjects([
    { uri: Uri.file(workspaceRoot) }
  ] as unknown as readonly vscode.WorkspaceFolder[]);
  return projects.length;
}

function writeProject(
  workspaceRoot: string,
  projectName: string,
  extraFiles = 0
): void {
  const projectRoot = path.join(workspaceRoot, projectName);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, `${projectName}.kicad_pro`),
    '{}',
    'utf8'
  );
  fs.writeFileSync(
    path.join(projectRoot, `${projectName}.kicad_sch`),
    '(kicad_sch)',
    'utf8'
  );
  fs.writeFileSync(
    path.join(projectRoot, `${projectName}.kicad_pcb`),
    '(kicad_pcb)',
    'utf8'
  );
  fs.writeFileSync(path.join(projectRoot, `${projectName}.kicad_dru`), '', 'utf8');
  for (let index = 0; index < extraFiles; index += 1) {
    fs.writeFileSync(
      path.join(projectRoot, `generated-${index}.kicad_sch`),
      '(kicad_sch)',
      'utf8'
    );
  }
}

function readFixture(fixtureName: string, fileName: string): string {
  return fs.readFileSync(path.join(FIXTURE_ROOT, fixtureName, fileName), 'utf8');
}

function renderViewer(
  fileType: 'schematic' | 'board',
  fileName: string,
  text: string,
  restoreState?: { zoom: number; grid: boolean; theme: string }
): string {
  return createKiCanvasViewerHtml({
    title:
      fileType === 'board'
        ? 'KiCad Studio PCB Viewer'
        : 'KiCad Studio Schematic Viewer',
    fileName,
    fileType,
    status: 'Opening interactive renderer...',
    cspSource: 'vscode-resource:',
    kicanvasUri: 'vscode-resource:/media/kicanvas.js',
    viewerCssUri: 'vscode-resource:/media/viewer.css',
    base64: Buffer.from(text, 'utf8').toString('base64'),
    disabledReason: '',
    theme: 'kicad',
    fallbackBackground: '#0f172a',
    ...(restoreState ? { restoreState } : {})
  });
}

function createLargeSchematic(symbolCount: number): string {
  const symbols = Array.from({ length: symbolCount }, (_unused, index) => {
    const group = index % 10;
    return `(symbol (property "Reference" "R${index + 1}") (property "Value" "${group}k") (property "Footprint" "R_0603"))`;
  }).join('\n');
  return `(kicad_sch ${symbols})`;
}

function createLargeNetlist(netCount: number): string {
  const nets = Array.from({ length: netCount }, (_unused, index) => {
    return `(net (code "${index + 1}") (name "/N${index + 1}") (node (ref "R${index + 1}") (pin "1")) (node (ref "C${index + 1}") (pin "2")))`;
  }).join('\n');
  return `(export (version "E") (design (source "generated.kicad_sch")) (components) (nets ${nets}))`;
}

async function measureCliCancellation(
  cwd: string,
  command: string[]
): Promise<void> {
  const spawnMock = childProcess.spawn as unknown as jest.Mock;
  let abortSignal: AbortSignal | undefined;
  spawnMock.mockImplementationOnce(
    (_command: string, _args: string[], options: { signal: AbortSignal }) => {
      abortSignal = options.signal;
      const child = createChildProcessMock();
      options.signal.addEventListener('abort', () => {
        child.emit(
          'error',
          Object.assign(new Error('aborted'), {
            name: 'AbortError',
            cause: options.signal.reason
          })
        );
      });
      return child;
    }
  );

  const detector = {
    detect: jest.fn().mockResolvedValue({
      path: '/usr/bin/kicad-cli',
      version: '10.0.1',
      versionLabel: 'KiCad 10.0.1',
      source: 'path'
    })
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const runner = new KiCadCliRunner(detector as never, logger as never);
  const pending = runner.run({
    command,
    cwd,
    progressTitle: 'Performance cancellation probe'
  });

  while (!abortSignal) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  runner.cancelAll();
  await expect(pending).rejects.toThrow('KiCad commands cancelled.');
}

function createChildProcessMock(): ChildProcessMock {
  const child = new EventEmitter() as ChildProcessMock;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}
