import * as fs from 'node:fs';
import * as path from 'node:path';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';

const MAX_SHEETS = 32;
const MAX_SHEET_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export interface DiffSheet {
  name: string;
  text: string;
}

type Versions = (filename: string) => {
  beforeText: string;
  afterText: string;
};

function directChildren(node: SNode, tag: string): SNode[] {
  return (node.children ?? []).filter(
    (child) => child.children?.[0]?.value === tag
  );
}

/**
 * Resolve linked sheets inside the design folder, never arbitrary paths
 * from user-provided Sheetfile properties. Keep Git versions independent.
 */
export function collectDiffSchematicSheets(
  mainFile: string,
  rootText: string,
  snapshot: 'beforeText' | 'afterText',
  readVersions: Versions
): DiffSheet[] {
  if (!rootText) return [];

  const parser = new SExpressionParser();
  const rootDir = fs.realpathSync(path.dirname(mainFile));
  const visited = new Set<string>([fs.realpathSync(mainFile)]);
  const queue: Array<{ file: string; text: string }> = [
    { file: mainFile, text: rootText }
  ];
  const sheets: DiffSheet[] = [];
  let totalBytes = Buffer.byteLength(rootText, 'utf8');

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const top = parser.findNode(parser.parse(current.text), 'kicad_sch');
    if (!top)
      throw new Error('Cannot resolve nested sheets in an invalid schematic.');

    for (const sheet of directChildren(top, 'sheet')) {
      const filenames = directChildren(sheet, 'property')
        .filter((property) => property.children?.[1]?.value === 'Sheetfile')
        .map((property) => property.children?.[2]?.value);
      if (filenames.length !== 1 || typeof filenames[0] !== 'string') {
        throw new Error(
          'A schematic child sheet has no valid Sheetfile property.'
        );
      }
      const name = filenames[0];
      if (
        !name ||
        path.isAbsolute(name) ||
        !name.toLowerCase().endsWith('.kicad_sch')
      ) {
        throw new Error(
          'A schematic child sheet uses an unsupported source path.'
        );
      }
      const child = fs.realpathSync(
        path.resolve(path.dirname(current.file), name)
      );
      const relative = path.relative(rootDir, child);
      if (
        !relative ||
        relative === '..' ||
        relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative)
      ) {
        throw new Error(
          'A schematic child sheet resolves outside its design folder.'
        );
      }
      if (visited.has(child)) continue;
      if (visited.size >= MAX_SHEETS) {
        throw new Error(
          'The schematic exceeds the 32-sheet diff rendering limit.'
        );
      }
      if (fs.statSync(child).size > MAX_SHEET_BYTES) {
        throw new Error(
          'A schematic child sheet exceeds the diff rendering size limit.'
        );
      }
      const childText = readVersions(child)[snapshot];
      if (!childText) {
        throw new Error(
          'A referenced schematic sheet is missing in the selected Git revision.'
        );
      }
      totalBytes += Buffer.byteLength(childText, 'utf8');
      if (totalBytes > MAX_SNAPSHOT_BYTES) {
        throw new Error(
          'The schematic hierarchy exceeds the 8 MiB diff rendering limit.'
        );
      }
      visited.add(child);
      queue.push({ file: child, text: childText });
      sheets.push({
        name: relative.split(path.sep).join('/'),
        text: childText
      });
    }
  }

  return sheets;
}
