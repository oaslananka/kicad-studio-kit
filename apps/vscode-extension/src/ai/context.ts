import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { DiagnosticSummary } from '../types';
import type { KiCadContext } from './prompts';
import { findSiblingProjectFile } from '../utils/pathUtils';

export interface ActiveAiContext {
  fileName: string | undefined;
  fileType?: 'schematic' | 'pcb' | 'other';
  documentPreview: string;
  projectContext: KiCadContext;
  description: string;
}

export function getActiveAiContext(): ActiveAiContext {
  const editor = vscode.window.activeTextEditor;
  const fileName = editor?.document.fileName;
  const documentPreview =
    editor?.document.getText().split(/\r?\n/).slice(0, 50).join('\n') ?? '';
  const fileType = detectFileType(fileName);
  const projectContext = resolveProjectContext(fileName);
  const description = [
    `Active file: ${fileName ? path.basename(fileName) : 'none'}`,
    `Active file type: ${fileType}`,
    projectContext.projectName ? `Project: ${projectContext.projectName}` : '',
    projectContext.kicadVersion
      ? `KiCad version: ${projectContext.kicadVersion}`
      : '',
    typeof projectContext.boardLayers === 'number'
      ? `Board layers: ${projectContext.boardLayers}`
      : ''
  ]
    .filter(Boolean)
    .join('\n');

  return {
    fileName,
    fileType,
    documentPreview,
    projectContext,
    description
  };
}

export function formatDiagnosticSummary(summary: DiagnosticSummary): string {
  return `${summary.source.toUpperCase()} summary for ${path.basename(summary.file)}: ${summary.errors} errors, ${summary.warnings} warnings, ${summary.infos} infos.`;
}

function detectFileType(
  fileName: string | undefined
): 'schematic' | 'pcb' | 'other' {
  if (!fileName) {
    return 'other';
  }
  if (fileName.endsWith('.kicad_sch')) {
    return 'schematic';
  }
  if (fileName.endsWith('.kicad_pcb')) {
    return 'pcb';
  }
  return 'other';
}

function resolveProjectContext(fileName: string | undefined): KiCadContext {
  if (!fileName) {
    return {};
  }

  const projectFile = findSiblingProjectFile(fileName);
  const projectName = projectFile ? path.parse(projectFile).name : undefined;
  const kicadVersion = readProjectVersion(projectFile);
  const boardLayers = fileName.endsWith('.kicad_pcb')
    ? readBoardLayers(fileName)
    : undefined;
  const activeVariant = readActiveVariant(projectFile);

  const result: KiCadContext = {};
  if (projectName) {
    result.projectName = projectName;
  }
  if (kicadVersion) {
    result.kicadVersion = kicadVersion;
  }
  if (typeof boardLayers === 'number') {
    result.boardLayers = boardLayers;
  }
  if (activeVariant) {
    result.activeVariant = activeVariant;
  }
  return result;
}

function readProjectVersion(
  projectFile: string | undefined
): string | undefined {
  if (!projectFile || !fs.existsSync(projectFile)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(projectFile, 'utf8');
    try {
      const parsed = JSON.parse(raw) as {
        meta?: { filename?: string };
        version?: string;
      };
      return typeof parsed.version === 'string'
        ? parsed.version
        : parsed.meta?.filename;
    } catch {
      const match = raw.match(/"version"\s*:\s*"([^"]+)"/);
      return match?.[1];
    }
  } catch {
    return undefined;
  }
}

function readBoardLayers(boardFile: string): number | undefined {
  if (!fs.existsSync(boardFile)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(boardFile, 'utf8');
    const matches = [
      ...raw.matchAll(
        /\(\s*(\d+)\s+"[^"]+"\s+(?:signal|jumper|mixed|power)\s*\)/g
      )
    ];
    return matches.length || undefined;
  } catch {
    return undefined;
  }
}

function readActiveVariant(
  projectFile: string | undefined
): string | undefined {
  if (!projectFile || !fs.existsSync(projectFile)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as {
      activeVariant?: string;
      variants?: Array<{ name?: string; isDefault?: boolean }>;
    };
    if (typeof parsed.activeVariant === 'string') {
      return parsed.activeVariant;
    }
    return parsed.variants?.find((variant) => variant.isDefault)?.name;
  } catch {
    return undefined;
  }
}
