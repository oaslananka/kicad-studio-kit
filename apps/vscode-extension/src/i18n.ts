import * as vscode from 'vscode';

export const SOURCE_MESSAGES = {
  workspaceTrustRequired:
    '{feature} requires a trusted workspace. Trust this workspace to run KiCad CLI, external KiCad, import, or export tooling.',
  selectMcpProfile: 'Select kicad-mcp-pro profile',
  chooseMcpProfile: 'Choose the MCP profile to use for this workspace',
  mcpProfileDetail: '{blurb} (as of MCP 1.0.0)',
  mcpProfileSetRestart:
    'MCP profile set to {profile}. Restart the MCP connection now?',
  restart: 'Restart',
  later: 'Later',
  diagnosticPendingNoCachedResult: 'PENDING - no cached result',
  diagnosticSummary: '{status} - {errors} errors, {warnings} warnings',
  diagnosticNotRun: '{label} has not been run yet.',
  diagnosticStatusTooltip: '{label}: {status}',
  diagnosticErrors: '{count} errors',
  diagnosticWarnings: '{count} warnings',
  diagnosticInfos: '{count} info',
  runValidation: 'Run {label}',
  settingsMigrationFailed:
    'KiCad Studio settings migration failed. Existing settings were left at the last successful schema version; check the KiCad Studio output for details.',
  settingsMigrationUpdatedDeprecatedSettings:
    'KiCad Studio updated deprecated settings to the current schema.'
} as const;

export type SourceMessageKey = keyof typeof SOURCE_MESSAGES;

export function localize(
  key: SourceMessageKey,
  args?: Record<string, string | number | boolean>
): string {
  const message = SOURCE_MESSAGES[key];
  return args ? vscode.l10n.t(message, args) : vscode.l10n.t(message);
}
