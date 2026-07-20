import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as vscode from 'vscode';
import {
  CLI_CAPABILITY_COMMANDS,
  CLI_CAPABILITY_METADATA,
  SETTINGS
} from '../constants';
import { DOCUMENTATION_URLS } from '../documentation/documentationUrls';
import { parseKiCadMajor } from './kicadCliSupport';
import type { DetectedKiCadCli } from '../types';
import { normalizeUserPath } from '../utils/pathUtils';

const SYNC_PROBE_TIMEOUT_MS = 5_000;
const SYNC_PROBE_MAX_BUFFER = 1024 * 1024;
const STATUS_MENU_CAPABILITY_COMMANDS = [
  'drc',
  'erc',
  'bom',
  'netlist',
  'gerbers',
  'drill',
  'jobset',
  'pdf3d',
  'odb',
  'step',
  'stats',
  // 2D exports
  'pdfSch',
  'pdfPcb',
  'svgSch',
  'svgPcb',
  'dxf',
  'psPcb',
  'psSch',
  // 3D formats
  'stpz',
  'xao',
  'stl',
  'u3d',
  'vrml',
  'glb',
  'brep',
  'ply',
  // manufacturing
  'ipc2581',
  'gencad',
  'ipcd356',
  'pos',
  // footprint / symbol
  'fpSvg',
  'symSvg',
  // import
  'pcbImport'
] as const satisfies ReadonlyArray<keyof typeof CLI_CAPABILITY_COMMANDS>;

export type KiCadCliCapabilityName = keyof typeof CLI_CAPABILITY_COMMANDS;
export type KiCadCliCapabilitySnapshot = Partial<
  Record<KiCadCliCapabilityName, boolean>
> & {
  variantOption?: boolean;
  allegroImport?: boolean;
  /** The detected KiCad version string. */
  version?: string;
  /** Support state label: primary | deprecated | preview | unknown */
  versionStatus?: string;
  /** Absolute path to the detected kicad-cli binary. */
  kicadCliPath?: string;
  /** How the CLI was discovered: settings | common-path | path */
  detectionSource?: string;
  /** ISO timestamp of the last successful probe. */
  lastProbeAt?: string;
  /** Non-functional upstream CLI surfaces that are documented but not usable. */
  nonFunctionalUpstream?: string[];
  /** Probe errors or warnings. */
  errors?: string[];
  /** Per-command minimum KiCad major version from the metadata registry. */
  commandMinVersion?: Partial<Record<KiCadCliCapabilityName, number>>;
  /** Per-command version eligibility for the detected KiCad version line. */
  commandVersionStatus?: Partial<Record<KiCadCliCapabilityName, string>>;
};

export function getCliCandidates(
  platform = process.platform,
  configuredPath = ''
): string[] {
  const candidates: string[] = [];
  if (configuredPath) {
    candidates.push(configuredPath);
  }

  if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const programFilesX86 =
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] ?? '';
    for (const version of [
      '10.0',
      '10',
      '9.0',
      '9',
      '8.0',
      '8',
      '7.0',
      '7',
      '6.0',
      '6'
    ]) {
      candidates.push(
        path.win32.join(programFiles, 'KiCad', version, 'bin', 'kicad-cli.exe')
      );
      candidates.push(
        path.win32.join(
          programFilesX86,
          'KiCad',
          version,
          'bin',
          'kicad-cli.exe'
        )
      );
      if (localAppData) {
        candidates.push(
          path.win32.join(
            localAppData,
            'Programs',
            'KiCad',
            version,
            'bin',
            'kicad-cli.exe'
          )
        );
      }
    }
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
      '/usr/local/bin/kicad-cli',
      '/opt/homebrew/bin/kicad-cli'
    );
  } else {
    candidates.push(
      '/usr/bin/kicad-cli',
      '/usr/local/bin/kicad-cli',
      '/snap/bin/kicad-cli',
      'flatpak run --command=kicad-cli org.kicad.KiCad',
      path.join(os.homedir(), '.local', 'bin', 'kicad-cli'),
      path.join(
        os.homedir(),
        '.var',
        'app',
        'org.kicad.KiCad',
        'data',
        'bin',
        'kicad-cli'
      )
    );
  }

  return [...new Set(candidates)];
}

export class KiCadCliDetector {
  private detected: DetectedKiCadCli | undefined;
  private readonly capabilityCache = new Map<string, boolean>();
  private readonly helpCache = new Map<string, string | undefined>();
  private warnedWorkspaceConfiguredPath = false;

  async detect(notifyOnMissing = false): Promise<DetectedKiCadCli | undefined> {
    if (this.detected) {
      return this.detected;
    }

    const configuredPath = vscode.workspace
      .getConfiguration()
      .get<string>(SETTINGS.cliPath, '')
      .trim();
    this.warnIfWorkspaceConfiguredPath(configuredPath);

    const candidates = getCliCandidates(process.platform, configuredPath);
    for (const candidate of candidates) {
      const resolved = await this.validateCandidate(
        candidate,
        candidate === configuredPath ? 'settings' : 'common-path'
      );
      if (resolved) {
        this.detected = resolved;
        return resolved;
      }
    }

    const fromPath = this.findOnPath();
    if (fromPath) {
      const resolved = await this.validateCandidate(fromPath, 'path');
      if (resolved) {
        this.detected = resolved;
        return resolved;
      }
    }

    if (notifyOnMissing) {
      const selected = await vscode.window.showErrorMessage(
        'KiCad CLI (kicad-cli) was not found.',
        'Download KiCad',
        'Set Manual Path',
        'Help'
      );
      if (selected === 'Download KiCad') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://www.kicad.org/download/')
        );
      } else if (selected === 'Set Manual Path') {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          SETTINGS.cliPath
        );
      } else if (selected === 'Help') {
        await vscode.env.openExternal(
          vscode.Uri.parse(DOCUMENTATION_URLS.kicadCliInstallation)
        );
      }
    }

    return undefined;
  }

  clearCache(): void {
    this.detected = undefined;
    this.capabilityCache.clear();
    this.helpCache.clear();
  }

  getVersion(): number | undefined {
    if (!this.detected) {
      return undefined;
    }
    return (
      Number.parseInt(this.detected.version.split('.')[0] ?? '', 10) ||
      undefined
    );
  }

  async hasCapability(
    command: keyof typeof CLI_CAPABILITY_COMMANDS
  ): Promise<boolean> {
    const detected = await this.detect();
    if (!detected) {
      return false;
    }

    if (this.capabilityCache.has(command)) {
      return this.capabilityCache.get(command) ?? false;
    }

    const args = [
      ...(detected.args ?? []),
      ...CLI_CAPABILITY_COMMANDS[command],
      '--help'
    ];
    const result = spawnSync(detected.path, args, syncProbeOptions());
    const supported =
      result.status === 0 ||
      /Usage:/i.test(`${result.stdout}\n${result.stderr}`);
    this.capabilityCache.set(command, supported);
    return supported;
  }

  async commandHelpIncludes(
    command: readonly string[],
    pattern: RegExp
  ): Promise<boolean> {
    const help = await this.getCommandHelp(command);
    return Boolean(help && pattern.test(help));
  }

  async getCommandHelp(
    command: readonly string[]
  ): Promise<string | undefined> {
    const detected = await this.detect();
    if (!detected) {
      return undefined;
    }

    const key = command.join('\0');
    if (this.helpCache.has(key)) {
      return this.helpCache.get(key);
    }

    const result = spawnSync(
      detected.path,
      [...(detected.args ?? []), ...command, '--help'],
      syncProbeOptions()
    );
    const help = `${result.stdout}\n${result.stderr}`;
    const supported = result.status === 0 || /Usage:/i.test(help);
    const normalized = supported ? help : undefined;
    this.helpCache.set(key, normalized);
    return normalized;
  }

  async getCapabilitySnapshot(): Promise<
    KiCadCliCapabilitySnapshot | undefined
  > {
    const detected = await this.detect();
    if (!detected) {
      return undefined;
    }

    const [commandResults, variantOption, allegroImport] = await Promise.all([
      Promise.all(
        STATUS_MENU_CAPABILITY_COMMANDS.map(
          async (command) =>
            [command, await this.hasCapability(command)] as const
        )
      ),
      this.commandHelpIncludes(['sch', 'export', 'pdf'], /--variant\b/),
      this.commandHelpIncludes(['pcb', 'import'], /\ballegro\b/i)
    ]);

    const major = parseKiCadMajor(detected);
    let versionStatus: string = 'unknown';
    if (typeof major === 'number') {
      if (major === 10) versionStatus = 'primary';
      else if (major >= 11) versionStatus = 'preview';
      else if (major >= 8) versionStatus = 'deprecated';
      else versionStatus = 'unsupported';
    }

    const snapshot: KiCadCliCapabilitySnapshot = {
      ...(Object.fromEntries(commandResults) as KiCadCliCapabilitySnapshot),
      variantOption,
      allegroImport,
      version: detected.version,
      versionStatus,
      kicadCliPath: detected.path,
      detectionSource: detected.source,
      lastProbeAt: new Date().toISOString()
    };

    if (major === 10) {
      snapshot.nonFunctionalUpstream = ['pcb export hpgl'];
    }

    // Enrich with per-command metadata
    if (typeof major === 'number') {
      const commandMinVersion: Record<string, number> = {};
      const commandVersionStatus: Record<string, string> = {};
      for (const cmd of STATUS_MENU_CAPABILITY_COMMANDS) {
        const meta = CLI_CAPABILITY_METADATA[cmd];
        if (!meta) continue;
        commandMinVersion[cmd] = meta.minimumMajor;
        commandVersionStatus[cmd] = deriveCommandVersionStatus(
          major,
          meta.minimumMajor
        );
      }
      snapshot.commandMinVersion = commandMinVersion;
      snapshot.commandVersionStatus = commandVersionStatus;
    }

    return snapshot;
  }

  private async validateCandidate(
    candidate: string,
    source: DetectedKiCadCli['source']
  ): Promise<DetectedKiCadCli | undefined> {
    if (!candidate) {
      return undefined;
    }

    let resolvedPath: string;
    let extraArgs: string[] | undefined;

    const trimmed = candidate.trim();
    if (
      (trimmed.includes(' ') ||
        trimmed.includes('"') ||
        trimmed.includes("'")) &&
      !fs.existsSync(trimmed)
    ) {
      const parts = this.splitCommand(trimmed);
      resolvedPath = parts[0] ?? '';
      extraArgs = parts.slice(1);
    } else {
      resolvedPath = this.normalizeCandidate(trimmed);
      if (!fs.existsSync(resolvedPath)) {
        return undefined;
      }
    }

    const result = spawnSync(
      resolvedPath,
      [...(extraArgs ?? []), '--version'],
      syncProbeOptions()
    );
    if (result.status !== 0) {
      return undefined;
    }

    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (!this.looksLikeKiCadCli(output, resolvedPath)) {
      return undefined;
    }

    const versionMatch = output.match(/(\d+\.\d+(?:\.\d+)?)/);
    const version = versionMatch?.[1] ?? 'unknown';
    return {
      path: resolvedPath,
      ...(extraArgs ? { args: extraArgs } : {}),
      version,
      versionLabel: `KiCad ${version}`,
      source
    };
  }

  private findOnPath(): string | undefined {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(finder, ['kicad-cli'], syncProbeOptions());
    if (result.status !== 0) {
      return undefined;
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  }

  private normalizeCandidate(candidate: string): string {
    const normalized = path.resolve(normalizeUserPath(candidate.trim()));
    try {
      return fs.realpathSync.native(normalized);
    } catch {
      return normalized;
    }
  }

  private looksLikeKiCadCli(versionOutput: string, candidate: string): boolean {
    return (
      /\bkicad(?:-cli)?\b/i.test(versionOutput) ||
      /kicad-cli(?:\.exe)?$/i.test(path.basename(candidate))
    );
  }

  private splitCommand(cmd: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (const char of cmd) {
      if (inQuotes) {
        if (char === quoteChar) {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
        } else if (/\s/.test(char)) {
          if (current.length > 0) {
            args.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }
    if (current.length > 0) {
      args.push(current);
    }
    return args;
  }

  private warnIfWorkspaceConfiguredPath(configuredPath: string): void {
    if (!configuredPath || this.warnedWorkspaceConfiguredPath) {
      return;
    }

    const inspect = vscode.workspace
      .getConfiguration()
      .inspect<string>(SETTINGS.cliPath);
    if (!inspect?.workspaceValue && !inspect?.workspaceFolderValue) {
      return;
    }

    this.warnedWorkspaceConfiguredPath = true;
    void vscode.window.showWarningMessage(
      'KiCad Studio is using a workspace-level kicad-cli path override. Only use workspace overrides for repositories you trust.'
    );
  }
}

function syncProbeOptions(): {
  encoding: BufferEncoding;
  timeout: number;
  maxBuffer: number;
} {
  return {
    encoding: 'utf8',
    timeout: SYNC_PROBE_TIMEOUT_MS,
    maxBuffer: SYNC_PROBE_MAX_BUFFER
  };
}

/** Derive the per-command version status from the detected KiCad major version
 *  and the command's minimum required major version. */
export function deriveCommandVersionStatus(
  detectedMajor: number,
  commandMinimumMajor: number
): string {
  if (detectedMajor < commandMinimumMajor) {
    return 'unsupported';
  }
  if (detectedMajor === 10) {
    return 'primary';
  }
  if (detectedMajor >= 11) {
    return 'preview';
  }
  if (detectedMajor >= 8) {
    return 'deprecated';
  }
  return 'unknown';
}
