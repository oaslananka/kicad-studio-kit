import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import { localize } from '../i18n';
import {
  KICAD_MCP_ADVANCED_PROFILES,
  KICAD_MCP_PRIMARY_PROFILES,
  resolveKicadMcpProfile,
  type KicadMcpProfileId
} from '../mcp/profileCatalog';
import type { CommandServices } from './types';

export async function pickMcpProfile(
  services: Pick<CommandServices, 'refreshMcpState' | 'mcpClient'>
): Promise<KicadMcpProfileId | undefined> {
  const advertisedProfiles =
    services.mcpClient.getState().server?.capabilities.profiles;
  const supports = (profile: { id: string }): boolean =>
    advertisedProfiles === undefined || advertisedProfiles.includes(profile.id);
  const primary = KICAD_MCP_PRIMARY_PROFILES.filter(supports);
  const advanced = KICAD_MCP_ADVANCED_PROFILES.filter(supports);
  const choice = await vscode.window.showQuickPick(
    [
      ...primary.map((profile) => profileItem(profile)),
      ...(advanced.length
        ? [
            {
              label: localize('advancedMcpProfiles'),
              detail: localize('advancedMcpProfilesDetail'),
              advanced: true as const
            }
          ]
        : [])
    ],
    {
      title: localize('selectMcpProfile'),
      placeHolder: localize('chooseMcpProfile')
    }
  );
  if (!choice) {
    return undefined;
  }

  const profileChoice =
    'advanced' in choice
      ? await vscode.window.showQuickPick(
          advanced.map((profile) => profileItem(profile)),
          {
            title: localize('selectMcpProfile'),
            placeHolder: localize('chooseAdvancedMcpProfile')
          }
        )
      : choice;
  if (!profileChoice || !('profile' in profileChoice)) {
    return undefined;
  }

  await writeProfile(profileChoice.profile.id);
  const restart = await vscode.window.showInformationMessage(
    localize('mcpProfileSetRestart', { profile: profileChoice.profile.id }),
    localize('restart'),
    localize('later')
  );
  if (restart === localize('restart')) {
    await services.mcpClient.retryNow();
    await services.refreshMcpState();
  }
  return profileChoice.profile.id;
}

function profileItem(
  profile:
    | (typeof KICAD_MCP_PRIMARY_PROFILES)[number]
    | (typeof KICAD_MCP_ADVANCED_PROFILES)[number]
) {
  return {
    label: profile.label,
    description: profile.id,
    detail: localize('mcpProfileDetail', { blurb: profile.blurb }),
    profile
  };
}

export function readConfiguredMcpProfile(): KicadMcpProfileId {
  const fromWorkspace = readProfileFromMcpJson();
  if (fromWorkspace) {
    return resolveKicadMcpProfile(fromWorkspace);
  }
  return resolveKicadMcpProfile(
    vscode.workspace
      .getConfiguration()
      .get<string>(SETTINGS.mcpProfile, 'review')
  );
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
