import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { readTextFileSync } from '../utils/fileUtils';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';

type SheetReference = {
  path: string;
  uuidPath: string;
};

type ParsedSheet = {
  file: string;
  root: SNode;
  schematic: SNode;
};

const MAX_SCHEMATIC_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_HIERARCHY_FILES = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve ERC item UUIDs to source positions through KiCad's real sheet UUID
 * hierarchy. Sheet display names are never interpreted as filenames.
 *
 * Unknown, ambiguous or outside-project references produce NO location.
 * They must not be represented as verified source navigation.
 */
export class ErcSourceLocations {
  private readonly projectDirectory: string | undefined;
  private readonly rootSheet: ParsedSheet | undefined;
  private reachableSheets: readonly ParsedSheet[] | undefined;
  private readonly sheets = new Map<string, ParsedSheet | null>();
  private readonly uuids = new Map<string, Map<string, SNode | null>>();

  constructor(
    rootFile: string,
    private readonly parser: SExpressionParser
  ) {
    try {
      const root = fs.realpathSync(rootFile);
      this.projectDirectory = fs.realpathSync(path.dirname(root));
      const parsed = this.readSchematic(root);
      this.rootSheet = parsed;
      this.sheets.set(root, parsed);
    } catch {
      this.projectDirectory = undefined;
      this.rootSheet = undefined;
    }
  }

  resolve(
    reference: SheetReference | undefined,
    items: unknown
  ): vscode.Location | undefined {
    if (!reference || !this.projectDirectory || !Array.isArray(items)) {
      return undefined;
    }

    const ids = reference.uuidPath.split('/').filter(Boolean);
    const names = reference.path.split('/').filter(Boolean);
    if (!ids.length || !ids.every((id) => UUID.test(id))) {
      return undefined;
    }
    if (ids.length !== names.length + 1) {
      return undefined;
    }

    let current = this.rootSheet;
    if (
      !current ||
      this.parser.getAtomValue(current.schematic, 'uuid') !== ids[0]
    ) {
      return undefined;
    }

    for (let i = 0; i < names.length; i += 1) {
      const sheetId = ids[i + 1];
      const sheetName = names[i];
      const candidates = directChildren(current.schematic, 'sheet').filter(
        (node) =>
          this.parser.getAtomValue(node, 'uuid') === sheetId &&
          sheetProperty(node, 'Sheetname') === sheetName
      );
      if (candidates.length !== 1) return undefined;
      const filename = sheetProperty(candidates[0]!, 'Sheetfile');
      if (
        !filename ||
        path.isAbsolute(filename) ||
        !filename.toLowerCase().endsWith('.kicad_sch')
      ) {
        return undefined;
      }
      const target = this.safeSchematicPath(current.file, filename);
      if (!target) return undefined;
      current = this.readCachedSchematic(target);
      if (!current) return undefined;
    }

    const index = this.indexUuids(current);
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const id = (item as Record<string, unknown>)['uuid'];
      if (typeof id !== 'string' || !UUID.test(id)) continue;
      const owner = index.get(id);
      if (!owner) continue;
      return {
        uri: vscode.Uri.file(current.file),
        range: this.parser.getPosition(owner)
      };
    }
    // KiCad reports some library-level ERC issues under root path '/' even
    // when the referenced component UUID belongs to a child sheet. Resolve
    // those only if the UUID exists in exactly ONE reachable source file.
    return names.length === 0
      ? this.findUniqueReferencedUuid(items)
      : undefined;
  }

  private findUniqueReferencedUuid(
    items: readonly unknown[]
  ): vscode.Location | undefined {
    const sources = this.walkReachableSheets();
    if (!sources.length) return undefined;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const id = (item as Record<string, unknown>)['uuid'];
      if (typeof id !== 'string' || !UUID.test(id)) continue;
      let only: vscode.Location | undefined;
      let ambiguous = false;
      for (const sheet of sources) {
        const index = this.indexUuids(sheet);
        if (!index.has(id)) continue;
        const node = index.get(id);
        if (!node || only) {
          ambiguous = true;
          break;
        }
        only = {
          uri: vscode.Uri.file(sheet.file),
          range: this.parser.getPosition(node)
        };
      }
      if (!ambiguous && only) return only;
    }
    return undefined;
  }

  private walkReachableSheets(): readonly ParsedSheet[] {
    if (this.reachableSheets) return this.reachableSheets;
    if (!this.rootSheet) return [];
    // Cache failures too: a malformed or oversized hierarchy must not cause
    // an expensive repeat traversal for every ERC catalog violation.
    const failClosed = (): readonly ParsedSheet[] => {
      this.reachableSheets = [];
      return this.reachableSheets;
    };
    const visited = new Set<string>([this.rootSheet.file]);
    const queue = [this.rootSheet];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      for (const sheet of directChildren(current.schematic, 'sheet')) {
        const filename = sheetProperty(sheet, 'Sheetfile');
        if (
          !filename ||
          path.isAbsolute(filename) ||
          !filename.toLowerCase().endsWith('.kicad_sch')
        )
          return failClosed();
        const target = this.safeSchematicPath(current.file, filename);
        if (!target) return failClosed();
        if (visited.has(target)) continue;
        if (visited.size >= MAX_HIERARCHY_FILES) return failClosed();
        visited.add(target);
        const parsed = this.readCachedSchematic(target);
        if (!parsed) return failClosed();
        queue.push(parsed);
      }
    }
    this.reachableSheets = queue;
    return queue;
  }

  private safeSchematicPath(
    currentFile: string,
    filename: string
  ): string | undefined {
    const absolute = path.resolve(path.dirname(currentFile), filename);
    try {
      const resolved = fs.realpathSync(absolute);
      const relative = path.relative(this.projectDirectory!, resolved);
      if (
        relative === '..' ||
        relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative) ||
        !resolved.toLowerCase().endsWith('.kicad_sch')
      ) {
        return undefined;
      }
      return resolved;
    } catch {
      return undefined;
    }
  }

  private readCachedSchematic(file: string): ParsedSheet | undefined {
    const cached = this.sheets.get(file);
    if (cached !== undefined) return cached ?? undefined;
    try {
      const parsed = this.readSchematic(file);
      this.sheets.set(file, parsed);
      return parsed;
    } catch {
      this.sheets.set(file, null);
      return undefined;
    }
  }

  private readSchematic(file: string): ParsedSheet {
    if (fs.statSync(file).size > MAX_SCHEMATIC_SOURCE_BYTES) {
      throw new Error('Schematic too large for exact UUID navigation.');
    }
    const root = this.parser.parse(readTextFileSync(file));
    const schematic = this.parser.findNode(root, 'kicad_sch');
    if (!schematic) throw new Error('Not a KiCad schematic.');
    return { file, root, schematic };
  }

  private indexUuids(sheet: ParsedSheet): Map<string, SNode | null> {
    const cached = this.uuids.get(sheet.file);
    if (cached) return cached;
    const found = new Map<string, SNode | null>();
    const visit = (node: SNode, parent?: SNode): void => {
      if (listTag(node) === 'uuid' && parent) {
        const id = node.children?.[1]?.value;
        if (typeof id === 'string' && UUID.test(id)) {
          // Conflicting UUID instances are deliberately not navigable.
          found.set(id, found.has(id) ? null : parent);
        }
      }
      for (const child of node.children ?? []) visit(child, node);
    };
    visit(sheet.schematic);
    this.uuids.set(sheet.file, found);
    return found;
  }
}

function listTag(node: SNode): string | undefined {
  if (node.type !== 'list') return undefined;
  const tag = node.children?.[0]?.value;
  return typeof tag === 'string' ? tag : undefined;
}

function directChildren(node: SNode, tag: string): SNode[] {
  return (node.children ?? []).filter((child) => listTag(child) === tag);
}

function sheetProperty(sheet: SNode, name: string): string | undefined {
  const values = directChildren(sheet, 'property')
    .filter((property) => property.children?.[1]?.value === name)
    .map((property) => property.children?.[2]?.value);
  return values.length === 1 && typeof values[0] === 'string'
    ? values[0]
    : undefined;
}
