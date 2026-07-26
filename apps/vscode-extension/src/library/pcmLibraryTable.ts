import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PcmPackage } from './pcmCatalog';

export class PcmLibraryTablePersistence {
  constructor(private readonly getConfigDir: () => string) {}

  refresh(pkg: PcmPackage, installPath: string): void {
    const symbolLibraries = collectPaths(installPath, (entry) =>
      entry.endsWith('.kicad_sym')
    );
    const footprintLibraries = collectDirectories(installPath, (entry) =>
      entry.endsWith('.pretty')
    );
    const prefix = managedLibraryPrefix(pkg.metadata.identifier);
    const configDir = this.getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });

    upsertLibraryTable({
      filePath: path.join(configDir, 'sym-lib-table'),
      rootName: 'sym_lib_table',
      namePrefix: prefix,
      entries: symbolLibraries.map((libraryPath) => ({
        name: `${prefix}_${path.basename(libraryPath, '.kicad_sym')}`,
        uri: libraryPath,
        description: `Installed by KiCad Studio PCM: ${pkg.metadata.name}`
      }))
    });
    upsertLibraryTable({
      filePath: path.join(configDir, 'fp-lib-table'),
      rootName: 'fp_lib_table',
      namePrefix: prefix,
      entries: footprintLibraries.map((libraryPath) => ({
        name: `${prefix}_${path.basename(libraryPath, '.pretty')}`,
        uri: libraryPath,
        description: `Installed by KiCad Studio PCM: ${pkg.metadata.name}`
      }))
    });
  }

  remove(identifier: string): void {
    const configDir = this.getConfigDir();
    const prefix = managedLibraryPrefix(identifier);
    for (const [fileName, rootName] of [
      ['sym-lib-table', 'sym_lib_table'],
      ['fp-lib-table', 'fp_lib_table']
    ] as const) {
      upsertLibraryTable({
        filePath: path.join(configDir, fileName),
        rootName,
        namePrefix: prefix,
        entries: []
      });
    }
  }
}

function sanitizeIdentifier(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9._-]+/gu, '_').replace(/\./gu, '_');
}

function managedLibraryPrefix(identifier: string): string {
  return `PCM_${sanitizeIdentifier(identifier)}`;
}

function collectPaths(
  root: string,
  predicate: (entry: string) => boolean
): string[] {
  const results: string[] = [];
  walk(root, (entry, stat) => {
    if (stat.isFile() && predicate(entry)) {
      results.push(entry);
    }
  });
  return results;
}

function collectDirectories(
  root: string,
  predicate: (entry: string) => boolean
): string[] {
  const results: string[] = [];
  walk(root, (entry, stat) => {
    if (stat.isDirectory() && predicate(entry)) {
      results.push(entry);
    }
  });
  return results;
}

function walk(
  root: string,
  visit: (entry: string, stat: fs.Stats) => void
): void {
  if (!fs.existsSync(root)) {
    return;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    const stat = fs.statSync(fullPath);
    visit(fullPath, stat);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
    }
  }
}

function upsertLibraryTable(options: {
  filePath: string;
  rootName: 'sym_lib_table' | 'fp_lib_table';
  namePrefix: string;
  entries: Array<{ name: string; uri: string; description: string }>;
}): void {
  const existing = fs.existsSync(options.filePath)
    ? fs.readFileSync(options.filePath, 'utf8')
    : `(${options.rootName}\n)\n`;
  const filteredLines = existing
    .split(/\r?\n/u)
    .filter((line) => !line.includes(`(name "${options.namePrefix}`));
  const entryLines = options.entries.map(
    (entry) =>
      `  (lib (name "${escapeTableString(entry.name)}")(type "KiCad")(uri "${escapeTableString(entry.uri)}")(options "")(descr "${escapeTableString(entry.description)}"))`
  );
  let closeIndex = -1;
  for (let index = filteredLines.length - 1; index >= 0; index -= 1) {
    if (filteredLines[index]?.trim() === ')') {
      closeIndex = index;
      break;
    }
  }
  const nextLines =
    closeIndex >= 0
      ? [
          ...filteredLines.slice(0, closeIndex),
          ...entryLines,
          ...filteredLines.slice(closeIndex)
        ]
      : [`(${options.rootName}`, ...entryLines, ')'];
  fs.mkdirSync(path.dirname(options.filePath), { recursive: true });
  fs.writeFileSync(
    options.filePath,
    `${nextLines.join('\n').trimEnd()}\n`,
    'utf8'
  );
}

function escapeTableString(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}
