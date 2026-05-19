import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface LibrarySymbol {
  name: string;
  description: string;
  keywords: string[];
  libraryName: string;
  libraryPath: string;
  value: string;
  footprintFilters: string[];
}

export interface LibraryFootprint {
  name: string;
  description: string;
  tags: string[];
  libraryName: string;
  libraryPath: string;
}

interface SerializedLibraryIndex {
  symbols: LibrarySymbol[];
  footprints: LibraryFootprint[];
  indexedAt: number;
}

const LIBRARY_INDEX_KEY = 'kicadstudio.libraryIndex';

/**
 * Indexes local KiCad symbol and footprint libraries for fast search.
 */
export class KiCadLibraryIndexer implements vscode.Disposable {
  private symbols: LibrarySymbol[] = [];
  private footprints: LibraryFootprint[] = [];
  private indexedAt = 0;
  private readonly INDEX_STALE_MS = 5 * 60 * 1000;

  constructor(private readonly context: vscode.ExtensionContext) {
    const cached =
      this.context.globalState.get<SerializedLibraryIndex>(LIBRARY_INDEX_KEY);
    if (cached) {
      this.symbols = cached.symbols;
      this.footprints = cached.footprints;
      this.indexedAt = cached.indexedAt;
    }
  }

  isIndexed(): boolean {
    return this.symbols.length > 0 || this.footprints.length > 0;
  }

  isStale(): boolean {
    return !this.indexedAt || Date.now() - this.indexedAt > this.INDEX_STALE_MS;
  }

  async indexAll(
    progress?: vscode.Progress<{ message: string }>
  ): Promise<void> {
    const symbolLibPaths = this.findSymbolLibraries();
    const footprintLibPaths = this.findFootprintLibraries();

    progress?.report({
      message: `${symbolLibPaths.length} symbol libraries are being indexed...`
    });
    this.symbols = this.parseSymbolLibraries(symbolLibPaths);

    progress?.report({
      message: `${footprintLibPaths.length} footprint libraries are being indexed...`
    });
    this.footprints = this.parseFootprintLibraries(footprintLibPaths);

    this.indexedAt = Date.now();
    await this.context.globalState.update(LIBRARY_INDEX_KEY, {
      symbols: this.symbols,
      footprints: this.footprints,
      indexedAt: this.indexedAt
    } satisfies SerializedLibraryIndex);
  }

  searchSymbols(query: string): LibrarySymbol[] {
    const q = query.toLowerCase().trim();
    return this.symbols
      .filter(
        (symbol) =>
          !q ||
          symbol.name.toLowerCase().includes(q) ||
          symbol.description.toLowerCase().includes(q) ||
          symbol.keywords.some((keyword) => keyword.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }

  searchFootprints(query: string): LibraryFootprint[] {
    const q = query.toLowerCase().trim();
    return this.footprints
      .filter(
        (footprint) =>
          !q ||
          footprint.name.toLowerCase().includes(q) ||
          footprint.description.toLowerCase().includes(q) ||
          footprint.tags.some((tag) => tag.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }

  dispose(): void {
    this.symbols = [];
    this.footprints = [];
  }

  private findSymbolLibraries(): string[] {
    return this.collectFiles('.kicad_sym', [
      process.env['KICAD_SYMBOL_DIR'],
      process.env['PROGRAMFILES']
        ? path.join(process.env['PROGRAMFILES'], 'KiCad')
        : undefined,
      '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols',
      '/usr/share/kicad/symbols',
      '/usr/local/share/kicad/symbols',
      ...(vscode.workspace.workspaceFolders?.map(
        (folder) => folder.uri.fsPath
      ) ?? [])
    ]);
  }

  private findFootprintLibraries(): string[] {
    return this.collectFiles('.kicad_mod', [
      process.env['KICAD_FOOTPRINT_DIR'],
      process.env['PROGRAMFILES']
        ? path.join(process.env['PROGRAMFILES'], 'KiCad')
        : undefined,
      '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints',
      '/usr/share/kicad/footprints',
      '/usr/local/share/kicad/footprints',
      ...(vscode.workspace.workspaceFolders?.map(
        (folder) => folder.uri.fsPath
      ) ?? [])
    ]);
  }

  private collectFiles(
    extension: string,
    roots: Array<string | undefined>
  ): string[] {
    const results = new Set<string>();
    for (const root of roots) {
      if (!root || !fs.existsSync(root)) {
        continue;
      }
      this.walk(root, extension, results, 3);
    }
    return [...results];
  }

  private walk(
    root: string,
    extension: string,
    results: Set<string>,
    depth: number
  ): void {
    if (depth < 0) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        this.walk(fullPath, extension, results, depth - 1);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        results.add(fullPath);
      }
    }
  }

  private parseSymbolLibraries(files: string[]): LibrarySymbol[] {
    const symbols: LibrarySymbol[] = [];
    for (const file of files) {
      const raw = (() => {
        try {
          return fs.readFileSync(file, 'utf8');
        } catch {
          return undefined;
        }
      })();
      if (!raw) {
        continue;
      }
      const matches = raw.matchAll(/\(\s*symbol\s+"([^"]+)"([\s\S]*?)\n\s*\)/g);
      for (const match of matches) {
        const body = match[2] ?? '';
        symbols.push({
          name: match[1] ?? path.parse(file).name,
          description: extractString(body, 'ki_description') ?? '',
          keywords: splitKeywords(extractString(body, 'ki_keywords')),
          libraryName: path.parse(file).name,
          libraryPath: file,
          value: extractString(body, 'Value') ?? '',
          footprintFilters: extractManyStrings(body, 'fp_filters')
        });
      }
    }
    return symbols;
  }

  private parseFootprintLibraries(files: string[]): LibraryFootprint[] {
    return files.map((file) => {
      const raw = (() => {
        try {
          return fs.readFileSync(file, 'utf8');
        } catch {
          return '';
        }
      })();
      return {
        name: path.parse(file).name,
        description: extractNodeValue(raw, 'descr') ?? '',
        tags: splitKeywords(extractNodeValue(raw, 'tags')),
        libraryName: path.basename(path.dirname(file)),
        libraryPath: file
      };
    });
  }
}

function extractString(body: string, key: string): string | undefined {
  const propertyRegex = new RegExp(
    `\\(\\s*property\\s+"${escapeRegExp(key)}"\\s+"([^"]*)"`,
    'i'
  );
  return body.match(propertyRegex)?.[1];
}

function extractManyStrings(body: string, key: string): string[] {
  const match = body.match(
    new RegExp(`\\(\\s*${escapeRegExp(key)}\\s+([^\\)]*)\\)`, 'i')
  );
  if (!match?.[1]) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)]
    .map((item) => item[1])
    .filter(Boolean) as string[];
}

function extractNodeValue(body: string, key: string): string | undefined {
  return body.match(
    new RegExp(`\\(\\s*${escapeRegExp(key)}\\s+"([^"]*)"\\s*\\)`, 'i')
  )?.[1];
}

function splitKeywords(value: string | undefined): string[] {
  return value
    ? value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
