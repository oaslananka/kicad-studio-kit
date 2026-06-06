import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import pathRegressionCases from '../../../../test-fixtures/path-regression-cases.json';
import { KiCadProjectTreeProvider } from '../../src/providers/projectTreeProvider';
import type { ProjectTreeNode } from '../../src/types';
import { toPosixPath } from '../../src/utils/pathUtils';
import { __setConfiguration, Uri, workspace } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

interface PathRegressionScenario {
  id: string;
  directoryName?: string;
  linkName?: string;
  fileBase?: string;
  rawRelativePath?: string;
  expectedPosixPath?: string;
  expectedNonWindowsError?: string;
  minimumPathLength?: number;
  expectedGroups?: Record<string, string[]>;
  tags: string[];
}

const scenarios = pathRegressionCases.scenarios as PathRegressionScenario[];
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const fixtureScenarios = scenarios.filter(
  (scenario) =>
    scenario.expectedGroups &&
    !scenario.minimumPathLength &&
    !scenario.tags.includes('symlink')
);

function childrenFor(
  root: ProjectTreeNode | undefined,
  label: string
): ProjectTreeNode[] {
  return root?.children?.find((node) => node.label === label)?.children ?? [];
}

function labelsFor(root: ProjectTreeNode | undefined, label: string): string[] {
  return childrenFor(root, label).map((node) => node.label);
}

function writeKiCadProject(projectRoot: string, fileBase: string): void {
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, `${fileBase}.kicad_pro`),
    '{}',
    'utf8'
  );
  fs.writeFileSync(path.join(projectRoot, `${fileBase}.kicad_sch`), '', 'utf8');
  fs.writeFileSync(path.join(projectRoot, `${fileBase}.kicad_pcb`), '', 'utf8');
  fs.writeFileSync(path.join(projectRoot, `${fileBase}.kicad_dru`), '', 'utf8');
}

async function buildWorkspace(
  projectRoot: string
): Promise<ProjectTreeNode | undefined> {
  workspace.workspaceFolders = [{ uri: Uri.file(projectRoot) }] as never;
  const provider = new KiCadProjectTreeProvider();
  const [root] = await provider.getChildren();
  return root;
}

function expectGoldenGroups(
  root: ProjectTreeNode | undefined,
  scenario: PathRegressionScenario
): void {
  for (const [group, expectedLabels] of Object.entries(
    scenario.expectedGroups ?? {}
  )) {
    expect(labelsFor(root, group)).toEqual(expectedLabels);
  }
}

describe('cross-platform path regression suite', () => {
  const originalWorkspaceFolders = workspace.workspaceFolders;
  let tempDir: string;

  beforeEach(() => {
    __setConfiguration({});
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-path-regression-'));
    workspace.workspaceFolders = originalWorkspaceFolders;
  });

  afterEach(() => {
    workspace.workspaceFolders = originalWorkspaceFolders;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps a fixture and golden expectation for every required path scenario', () => {
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'project-path-with-spaces',
      'unicode-project-path',
      'reserved-url-characters',
      'mixed-separators',
      'long-path',
      'symlinked-project-root',
      'windows-unc-path'
    ]);

    for (const scenario of scenarios) {
      expect(scenario.tags.length).toBeGreaterThan(0);
      expect(
        scenario.expectedGroups ??
          scenario.expectedPosixPath ??
          scenario.expectedNonWindowsError
      ).toBeDefined();
    }
  });

  it('is covered by the existing Linux, Windows, and macOS unit-test CI matrix', () => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'),
      'utf8'
    );

    expect(pathRegressionCases.ciMatrix).toEqual([
      'ubuntu-24.04',
      'windows-2025',
      'macos-15'
    ]);
    expect(workflow).toContain('os: [ubuntu-24.04, windows-2025, macos-15]');
    expect(workflow).toContain(
      'corepack pnpm --filter kicadstudiokit run test:unit:coverage'
    );
  });

  it.each(fixtureScenarios)(
    'discovers $id project fixtures with golden groups',
    async (scenario) => {
      const projectRoot = path.join(
        tempDir,
        scenario.directoryName ?? scenario.id
      );
      writeKiCadProject(projectRoot, scenario.fileBase ?? scenario.id);

      const root = await buildWorkspace(projectRoot);

      expect(root?.label).toBe(path.basename(projectRoot));
      expectGoldenGroups(root, scenario);
    }
  );

  it('normalizes mixed Windows and POSIX separators for UI-relative paths', () => {
    const mixed = scenarios.find(
      (scenario) => scenario.id === 'mixed-separators'
    );

    expect(mixed).toBeDefined();
    expect(toPosixPath(mixed!.rawRelativePath ?? '')).toBe(
      mixed!.expectedPosixPath
    );
  });

  it('discovers project files through symlinked workspace roots when the OS permits symlinks', async () => {
    const scenario = scenarios.find(
      (entry) => entry.id === 'symlinked-project-root'
    )!;
    const targetRoot = path.join(tempDir, scenario.directoryName ?? 'target');
    const linkRoot = path.join(tempDir, scenario.linkName ?? 'linked');
    writeKiCadProject(targetRoot, scenario.fileBase ?? scenario.id);

    try {
      fs.symlinkSync(
        targetRoot,
        linkRoot,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toMatch(
        /EPERM|EACCES|ENOTSUP|EINVAL/
      );
      return;
    }

    const root = await buildWorkspace(linkRoot);

    expect(root?.label).toBe(path.basename(linkRoot));
    expectGoldenGroups(root, scenario);
  });

  it('discovers long project paths or records the platform path-length limit as a graceful skip', async () => {
    const scenario = scenarios.find((entry) => entry.id === 'long-path')!;
    let projectRoot = path.join(tempDir, scenario.directoryName ?? 'long-path');
    while (
      path.join(projectRoot, `${scenario.fileBase ?? scenario.id}.kicad_pro`)
        .length <= (scenario.minimumPathLength ?? 260)
    ) {
      projectRoot = path.join(projectRoot, 'deep-segment-with-extra-length');
    }

    try {
      writeKiCadProject(projectRoot, scenario.fileBase ?? scenario.id);
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toMatch(
        /ENAMETOOLONG|ENOENT|EINVAL/
      );
      return;
    }

    const root = await buildWorkspace(projectRoot);

    expect(
      path.join(projectRoot, `${scenario.fileBase ?? scenario.id}.kicad_pro`)
        .length
    ).toBeGreaterThan(scenario.minimumPathLength ?? 260);
    expectGoldenGroups(root, scenario);
  });
});
