import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import { normalizeUserPath } from '../utils/pathUtils';

const SYNC_PROBE_TIMEOUT_MS = 5_000;
const SYNC_PROBE_MAX_BUFFER = 1024 * 1024;

/**
 * Resolve the KiCad GUI executable for a given file type. Checks configured
 * paths, common install locations, and PATH in order.
 */
export function resolveKiCadExecutable(filePath: string): {
  command: string;
  args: string[];
} {
  const configured = vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.kicadPath, '')
    .trim();

  const candidates = getKiCadExecutableCandidates(filePath, configured);
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return { command: candidate, args: [] };
    }
  }

  for (const name of getPreferredKiCadExecutableNames(filePath)) {
    const fromPath = findExecutableOnPath(name);
    if (fromPath) {
      return { command: fromPath, args: [] };
    }
  }

  throw new Error(
    `No KiCad executable was found for ${path.basename(filePath)}. Checked common KiCad install paths and PATH.`
  );
}

/**
 * Launch a process detached from the extension host so it keeps running
 * after VS Code closes.
 */
export function launchDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
    child.once('error', reject);
  });
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function getKiCadExecutableCandidates(
  filePath: string,
  configured: string
): string[] {
  const names = getPreferredKiCadExecutableNames(filePath);
  const candidates: string[] = [];
  if (configured) {
    candidates.push(...expandConfiguredKiCadPath(configured, names));
  }

  if (process.platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const programFilesX86 =
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    for (const root of [programFiles, programFilesX86]) {
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
        for (const name of names) {
          candidates.push(path.join(root, 'KiCad', version, 'bin', name));
        }
      }
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad',
      '/usr/local/bin/kicad',
      '/opt/homebrew/bin/kicad'
    );
  } else {
    for (const name of names) {
      candidates.push(
        path.join('/usr/bin', name),
        path.join('/usr/local/bin', name),
        path.join('/snap/bin', name)
      );
    }
  }

  return [...new Set(candidates)];
}

function expandConfiguredKiCadPath(
  configured: string,
  names: string[]
): string[] {
  const normalized = normalizeUserPath(configured);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(normalized);
  } catch {
    return [normalized];
  }
  if (!stat.isDirectory()) {
    return [normalized];
  }
  if (process.platform === 'darwin' && normalized.endsWith('.app')) {
    return [path.join(normalized, 'Contents', 'MacOS', 'kicad')];
  }
  return names.flatMap((name) => [
    path.join(normalized, name),
    path.join(normalized, 'bin', name)
  ]);
}

function getPreferredKiCadExecutableNames(filePath: string): string[] {
  const extension = path.extname(filePath).toLowerCase();
  if (process.platform === 'win32') {
    if (extension === '.kicad_sch') {
      return ['eeschema.exe', 'kicad.exe'];
    }
    if (extension === '.kicad_pcb') {
      return ['pcbnew.exe', 'kicad.exe'];
    }
    return ['kicad.exe'];
  }
  if (process.platform === 'darwin') {
    return ['kicad'];
  }
  if (extension === '.kicad_sch') {
    return ['eeschema', 'kicad'];
  }
  if (extension === '.kicad_pcb') {
    return ['pcbnew', 'kicad'];
  }
  return ['kicad'];
}

function findExecutableOnPath(name: string): string | undefined {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [name], {
    encoding: 'utf8',
    timeout: SYNC_PROBE_TIMEOUT_MS,
    maxBuffer: SYNC_PROBE_MAX_BUFFER
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}
