import { COMMANDS, SETTINGS } from '../constants';
import type { DetectedKiCadCli, DiagnosticSummary } from '../types';

export interface StatusBarSnapshot {
  drc?: DiagnosticSummary | undefined;
  erc?: DiagnosticSummary | undefined;
}

export interface StatusMenuItem {
  label: string;
  description?: string;
  detail?: string;
  command?: string;
  args?: unknown[];
  kind?: number;
}

const QUICK_PICK_SEPARATOR = -1;

export function buildStatusMenuItems(options: {
  trusted: boolean;
  cli?: DetectedKiCadCli | undefined;
  snapshot: StatusBarSnapshot;
}): StatusMenuItem[] {
  const { trusted, cli, snapshot } = options;
  const drcDetail = snapshot.drc
    ? `${snapshot.drc.errors} errors, ${snapshot.drc.warnings} warnings, ${snapshot.drc.infos} info - ${formatTimestamp(snapshot.drc.capturedAt)}`
    : 'No DRC result yet';
  const ercDetail = snapshot.erc
    ? `${snapshot.erc.errors} errors, ${snapshot.erc.warnings} warnings, ${snapshot.erc.infos} info - ${formatTimestamp(snapshot.erc.capturedAt)}`
    : 'No ERC result yet';

  const statusItem = trusted
    ? cli
      ? {
          label: '$(circuit-board) KiCad detected',
          description: cli.versionLabel,
          detail: `${cli.path} (${cli.source})`
        }
      : {
          label: '$(warning) kicad-cli not detected',
          description: 'configure required',
          detail: 'Install KiCad or configure kicadstudio.kicadCliPath.'
        }
    : {
        label: '$(shield) Restricted Mode',
        description: 'workspace trust required',
        detail:
          'Trust this workspace before detecting kicad-cli or launching KiCad tooling.'
      };

  const items: StatusMenuItem[] = [
    separator('Status'),
    statusItem,
    separator('Validate'),
    {
      label: '$(beaker) Run board DRC',
      description: drcDetail,
      detail: diagnosticScope(snapshot.drc, 'Board design rules'),
      command: COMMANDS.runDRC
    },
    {
      label: '$(pulse) Run schematic ERC',
      description: ercDetail,
      detail: diagnosticScope(snapshot.erc, 'Schematic electrical rules'),
      command: COMMANDS.runERC
    },
    separator('Export'),
    { label: '$(package) Export Gerbers', command: COMMANDS.exportGerbers },
    {
      label: '$(archive) Export Manufacturing Package',
      command: COMMANDS.exportManufacturingPackage
    },
    { label: '$(file-pdf) Export PDF', command: COMMANDS.exportPDF },
    {
      label: '$(plug) Setup MCP Integration',
      command: COMMANDS.setupMcpIntegration
    },
    separator('Libraries'),
    { label: '$(search) Search Component', command: COMMANDS.searchComponent },
    {
      label: '$(search) Search Library Symbol',
      command: COMMANDS.searchLibrarySymbol
    },
    { label: '$(git-compare) Show Visual Diff', command: COMMANDS.showDiff },
    separator('AI & MCP'),
    {
      label: '$(comment-discussion) Open AI Chat',
      command: COMMANDS.openAiChat
    },
    separator('Settings'),
    trusted
      ? cli
        ? {
            label: '$(refresh) Re-detect kicad-cli',
            description: cli.source,
            command: COMMANDS.detectCli
          }
        : {
            label: '$(settings-gear) Configure kicad-cli path',
            description: 'required before KiCad commands can run',
            command: 'workbench.action.openSettings',
            args: [SETTINGS.cliPath]
          }
      : {
          label: '$(shield) Manage Workspace Trust',
          description: 'required before KiCad commands can run',
          command: 'workbench.trust.manage',
          args: []
        },
    {
      label: '$(settings-gear) Open KiCad Studio Settings',
      command: COMMANDS.openSettings
    }
  ];

  return items;
}

function separator(label: string): StatusMenuItem {
  return { label, kind: QUICK_PICK_SEPARATOR };
}

function diagnosticScope(
  summary: DiagnosticSummary | undefined,
  fallback: string
): string {
  if (!summary) {
    return `${fallback}: no cached result yet.`;
  }
  return `${fallback}: ${summary.file} - updated ${formatTimestamp(summary.capturedAt)}`;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return 'not recorded';
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return timestamp.toLocaleString();
}
