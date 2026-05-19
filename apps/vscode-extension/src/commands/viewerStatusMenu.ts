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
  command: string;
  args?: unknown[];
}

export function buildStatusMenuItems(options: {
  trusted: boolean;
  cli?: DetectedKiCadCli | undefined;
  snapshot: StatusBarSnapshot;
}): StatusMenuItem[] {
  const { trusted, cli, snapshot } = options;
  const drcDetail = snapshot.drc
    ? `${snapshot.drc.errors} errors, ${snapshot.drc.warnings} warnings, ${snapshot.drc.infos} info`
    : 'No DRC result yet';
  const ercDetail = snapshot.erc
    ? `${snapshot.erc.errors} errors, ${snapshot.erc.warnings} warnings, ${snapshot.erc.infos} info`
    : 'No ERC result yet';

  return [
    {
      label: trusted
        ? cli
          ? `$(check) ${cli.versionLabel}`
          : '$(warning) kicad-cli not found'
        : '$(shield) Restricted Mode',
      description: trusted
        ? (cli?.source ?? 'configure')
        : 'workspace trust required',
      detail: trusted
        ? (cli?.path ?? 'Install KiCad or configure kicadstudio.kicadCliPath.')
        : 'Trust this workspace before detecting kicad-cli or launching KiCad tooling.',
      command: trusted
        ? cli
          ? COMMANDS.detectCli
          : 'workbench.action.openSettings'
        : 'workbench.trust.manage',
      args: trusted ? (cli ? [] : [SETTINGS.cliPath]) : []
    },
    {
      label: '$(beaker) Run DRC',
      description: drcDetail,
      command: COMMANDS.runDRC
    },
    {
      label: '$(pulse) Run ERC',
      description: ercDetail,
      command: COMMANDS.runERC
    },
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
    { label: '$(search) Search Component', command: COMMANDS.searchComponent },
    {
      label: '$(comment-discussion) Open AI Chat',
      command: COMMANDS.openAiChat
    },
    {
      label: '$(search) Search Library Symbol',
      command: COMMANDS.searchLibrarySymbol
    },
    { label: '$(git-compare) Show Visual Diff', command: COMMANDS.showDiff },
    {
      label: '$(settings-gear) Open KiCad Studio Settings',
      command: COMMANDS.openSettings
    }
  ];
}
