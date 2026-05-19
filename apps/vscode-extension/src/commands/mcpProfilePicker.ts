import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import {
  KICAD_MCP_PROFILES,
  type KicadMcpProfileId
} from '../mcp/profileCatalog';
import type { CommandServices } from './types';

export async function pickMcpProfile(
  services: Pick<CommandServices, 'refreshMcpState' | 'mcpClient'>
): Promise<KicadMcpProfileId | undefined> {
  const choice = await vscode.window.showQuickPick(
    KICAD_MCP_PROFILES.map((profile) => ({
      label: profile.label,
      description: profile.id,
      detail: `${profile.blurb} (as of MCP 1.0.0)`,
      profile
    })),
    {
      title: 'Select kicad-mcp-pro profile',
      placeHolder: 'Choose the MCP profile to use for this workspace'
    }
  );
  if (!choice) {
    return undefined;
  }

  await writeProfile(choice.profile.id);
  const restart = await vscode.window.showInformationMessage(
    `MCP profile set to ${choice.profile.id}. Restart the MCP connection now?`,
    'Restart',
    'Later'
  );
  if (restart === 'Restart') {
    await services.mcpClient.retryNow();
    await services.refreshMcpState();
  }
  return choice.profile.id;
}

export function readConfiguredMcpProfile(): string | undefined {
  const fromWorkspace = readProfileFromMcpJson();
  if (fromWorkspace) {
    return fromWorkspace;
  }
  return vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.mcpProfile, 'full');
}

async function writeProfile(profile: KicadMcpProfileId): Promise<void> {
  const mcpJsonPath = getWorkspaceMcpJsonPath();
  if (mcpJsonPath && fs.existsSync(mcpJsonPath)) {
    const raw = fs.readFileSync(mcpJsonPath, 'utf8');
    const config = parseJsonObject(raw);
    const servers = ensureRecord(config, 'servers');
    const kicad = ensureRecord(servers, 'kicad');
    const env = ensureRecord(kicad, 'env');
    env['KICAD_MCP_PROFILE'] = profile;
    fs.writeFileSync(
      mcpJsonPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8'
    );
    return;
  }

  await vscode.workspace
    .getConfiguration()
    .update(SETTINGS.mcpProfile, profile, vscode.ConfigurationTarget.Global);
}

function readProfileFromMcpJson(): string | undefined {
  const mcpJsonPath = getWorkspaceMcpJsonPath();
  if (!mcpJsonPath || !fs.existsSync(mcpJsonPath)) {
    return undefined;
  }
  try {
    const config = parseJsonObject(fs.readFileSync(mcpJsonPath, 'utf8'));
    const servers = config['servers'];
    const kicad = isRecord(servers) ? servers['kicad'] : undefined;
    const env = isRecord(kicad) ? kicad['env'] : undefined;
    const profile = isRecord(env) ? env['KICAD_MCP_PROFILE'] : undefined;
    return typeof profile === 'string' ? profile : undefined;
  } catch {
    return undefined;
  }
}

function getWorkspaceMcpJsonPath(): string | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return root ? path.join(root, '.vscode', 'mcp.json') : undefined;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function ensureRecord(
  parent: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const existing = parent[key];
  if (isRecord(existing)) {
    return existing;
  }
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
