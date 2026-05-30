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
  diagnosticPendingRunAction: 'Not run - Run {label}',
  diagnosticSummary: '{status} - {errors} errors, {warnings} warnings',
  diagnosticNotRun: '{label} has not been run yet.',
  diagnosticStatusTooltip: '{label}: {status}',
  diagnosticErrors: '{count} errors',
  diagnosticWarnings: '{count} warnings',
  diagnosticInfos: '{count} info',
  runValidation: 'Run {label}',
  qualityGateRunThis: 'Run This Quality Gate',
  qualityGateReady: 'Ready',
  qualityGatePendingSchematic: 'Run schematic checks',
  qualityGatePendingConnectivity: 'Run connectivity checks',
  qualityGatePendingPlacement: 'Run placement checks',
  qualityGatePendingTransfer: 'Run PCB transfer checks',
  qualityGatePendingManufacturing: 'Run manufacturing checks',
  qualityGatePendingDefault: 'Run this quality gate',
  qualityGateClickRunWhenReady:
    'Click to run this gate when the project is ready.',
  qualityGateClickRerun: 'Click to rerun this gate.',
  qualityGateRunningAll: 'Running all quality gates...',
  qualityGateRunning: 'Running {gate} quality gate...',
  qualityGateStdioWarning:
    'Quality Gates are not available when kicad-mcp-pro is connected via VS Code stdio. ' +
    'Start kicad-mcp-pro with the HTTP transport (port 27185) to enable this feature.',
  drcRulesNoFileLabel: 'No DRC rules file',
  drcRulesNoFileDescription: 'Create or open a .kicad_dru file',
  drcRulesNoFileDetail:
    'Add a KiCad design-rules file to this workspace, then refresh this view to inspect custom rule constraints.',
  drcRulesCreateOrOpenCommand: 'Create or Open DRC Rules',
  drcRulesNoCustomRulesLabel: 'No custom rules found',
  drcRulesNoCustomRulesDescription: 'Add rules to .kicad_dru',
  drcRulesNoCustomRulesDetail:
    'The workspace has a .kicad_dru file, but no readable KiCad rule blocks were found.',
  drcRulesLoadErrorLabel: 'DRC rules could not load',
  drcRulesLoadErrorDescription: 'Fix rule syntax and refresh',
  fixQueueUnavailableLabel: 'Fix Queue unavailable',
  fixQueueUnavailableDescription: 'Use HTTP MCP transport',
  fixQueueSetupMcpCommand: 'Setup MCP Integration',
  fixQueueEmptyLabel: 'No pending AI fixes',
  fixQueueEmptyDescription: 'Run DRC/ERC or refresh MCP',
  fixQueueEmptyDetail:
    'No queued fixes are available for the active project. Run validation or refresh MCP capabilities to populate suggested repairs.',
  fixQueueRefreshCommand: 'Refresh MCP Fix Queue',
  fixQueueRefreshErrorLabel: 'Fix Queue could not refresh',
  fixQueueRefreshErrorDescription: 'Retry MCP connection',
  fixQueueRetryCommand: 'Retry MCP Connection',
  fixQueueBlockStdio:
    'Fix Queue needs the HTTP MCP transport; VS Code stdio cannot serve queued repair actions.',
  fixQueueBlockIncompatible:
    'Upgrade kicad-mcp-pro before loading AI repair actions.',
  fixQueueBlockDegraded:
    'The MCP connection was interrupted or is in a degraded state. {message} Retry the connection or check the MCP server status.',
  fixQueueBlockDefault:
    'Connect kicad-mcp-pro over HTTP before loading AI repair actions.',
  pcmNoLibrariesLabel: 'No PCM libraries indexed',
  pcmNoLibrariesDescription: 'Refresh PCM repositories',
  pcmNoLibrariesDetail:
    'No KiCad Package and Content Manager packages are indexed yet. Refresh repositories or check the PCM repository settings.',
  pcmRefreshRepositoriesCommand: 'Refresh PCM Repositories',
  variantNoProjectLabel: 'No KiCad project file',
  variantNoProjectDescription: 'Open a .kicad_pro project',
  variantNoProjectDetail:
    'Variants are stored in the KiCad project file. Open or add a .kicad_pro file before creating assembly variants.',
  variantNoVariantsLabel: 'No variants configured',
  variantNoVariantsDescription: 'Create assembly variant',
  variantNoVariantsDetail:
    'This project does not define assembly variants yet. Create a named variant before comparing BOM outputs.',
  variantCreateCommand: 'Create Assembly Variant',
  settingsMigrationFailed:
    'KiCad Studio settings migration failed. Existing settings were left at the last successful schema version; check the KiCad Studio output for details.',
  settingsMigrationUpdatedDeprecatedSettings:
    'KiCad Studio updated deprecated settings to the current schema.',
  feedbackOpenFailed:
    'Could not open the feedback form automatically. You can access it manually at: {url}',
  boardReadyOpsNotConfigured:
    'BoardReadyOps is not configured. Enable it in the KiCad Studio settings to check board readiness.',
  boardReadyOpsOpenSettingsAction: 'Open Settings',
  boardReadyOpsRunning:
    'BoardReadyOps check queued. Results will appear when the service responds.',
  boardReadyOpsReportNotAvailable:
    'No BoardReadyOps report is available yet. Configure and run a readiness check first.',
  boardReadyOpsDocsOpenFailed:
    'Could not open the BoardReadyOps documentation automatically.'
} as const;

export type SourceMessageKey = keyof typeof SOURCE_MESSAGES;

export function localize(
  key: SourceMessageKey,
  args?: Record<string, string | number | boolean>
): string {
  const message = SOURCE_MESSAGES[key];
  return args ? vscode.l10n.t(message, args) : vscode.l10n.t(message);
}
