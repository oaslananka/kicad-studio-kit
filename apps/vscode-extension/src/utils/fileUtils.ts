import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KICAD_FILE_EXTENSIONS } from '../constants';

export async function readTextFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

export function readTextFileSync(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function ensureDirectory(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

export async function listWorkspaceKiCadFiles(): Promise<vscode.Uri[]> {
  const pattern = `**/*.{${KICAD_FILE_EXTENSIONS.map((ext) => ext.slice(1)).join(',')}}`;
  return vscode.workspace.findFiles(pattern, '**/node_modules/**');
}

export async function findWorkspaceFileByExtension(
  extname: string
): Promise<vscode.Uri | undefined> {
  const files = await vscode.workspace.findFiles(
    `**/*${extname}`,
    '**/node_modules/**',
    1
  );
  return files[0];
}

export function safeReadJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function bufferToBase64(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString('base64');
}

export function decodeBase64ToUtf8(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

export function inferOutputPath(
  sourceFile: string,
  outputDir: string,
  suffix: string,
  extname: string
): string {
  const parsed = path.parse(sourceFile);
  return path.join(outputDir, `${parsed.name}${suffix}${extname}`);
}
