import { COMMANDS } from '../constants';

export type TaskGroupId =
  'review' | 'validate' | 'release' | 'automate' | 'maintain';

type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

export interface TaskHubContext {
  readonly hasProject: boolean;
  readonly workspaceTrusted: boolean;
  readonly schematicOpen: boolean;
  readonly pcbOpen: boolean;
  readonly jobsetOpen: boolean;
  readonly hasVariants: boolean;
  readonly aiEnabled: boolean;
  readonly mcpAvailable: boolean;
  readonly mcpConnected: boolean;
  readonly mcpRetryAvailable: boolean;
  readonly mcpManufacturingMode: boolean;
}

export type TaskContextKey = keyof TaskHubContext;

export interface TaskRequirements {
  readonly all?: readonly TaskContextKey[];
  readonly any?: readonly TaskContextKey[];
}

export type TaskAvailability =
  'always' | 'project' | 'trusted' | 'trustedProject';

export interface TaskAction {
  readonly label: string;
  readonly description: string;
  readonly command: CommandId;
  readonly availability?: TaskAvailability;
  readonly requirements?: TaskRequirements;
}

export interface TaskGroup {
  readonly id: TaskGroupId;
  readonly command: CommandId;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  readonly placeholder: string;
  readonly availability: TaskAvailability;
  readonly actions: readonly TaskAction[];
}

export const TASK_GROUPS: readonly TaskGroup[] = [
  {
    id: 'review',
    command: COMMANDS.openReviewTasks,
    icon: '$(search)',
    label: 'Review',
    description: 'Inspect the active project, viewers, variants, and diffs',
    placeholder: 'Review — choose a project inspection action',
    availability: 'project',
    actions: [
      {
        label: 'Show project status',
        description: 'Open the current KiCad Studio status menu',
        command: COMMANDS.showStatusMenu
      },
      {
        label: 'Select active project',
        description: 'Choose which KiCad project the workspace commands use',
        command: COMMANDS.selectActiveProject
      },
      {
        label: 'Open schematic viewer',
        description: 'Inspect the active schematic in KiCad Studio',
        command: COMMANDS.openSchematic,
        requirements: { all: ['schematicOpen'] }
      },
      {
        label: 'Open PCB viewer',
        description: 'Inspect the active board in KiCad Studio',
        command: COMMANDS.openPCB,
        requirements: { all: ['pcbOpen'] }
      },
      {
        label: 'Show visual diff',
        description: 'Review Git changes in the KiCad-aware diff viewer',
        command: COMMANDS.showDiff
      },
      {
        label: 'Generate diff report',
        description: 'Create a reviewable KiCad diff summary',
        command: COMMANDS.generateDiffReport,
        requirements: {
          all: ['workspaceTrusted'],
          any: ['schematicOpen', 'pcbOpen']
        }
      },
      {
        label: 'Compare variant BOMs',
        description: 'Review differences between KiCad 10 variants',
        command: COMMANDS.diffVariantBom,
        requirements: { all: ['hasVariants'] }
      }
    ]
  },
  {
    id: 'validate',
    command: COMMANDS.openValidateTasks,
    icon: '$(checklist)',
    label: 'Validate',
    description: 'Run DRC, ERC, quality gates, and readiness checks',
    placeholder: 'Validate — choose a project check',
    availability: 'project',
    actions: [
      {
        label: 'Run all quality gates',
        description: 'Execute the MCP-backed project quality gate set',
        command: COMMANDS.qualityGateRunAll,
        requirements: { all: ['workspaceTrusted', 'mcpConnected'] }
      },
      {
        label: 'Run Design Rule Check (DRC)',
        description: 'Validate PCB design rules with kicad-cli',
        command: COMMANDS.runDRC,
        requirements: { all: ['workspaceTrusted', 'pcbOpen'] }
      },
      {
        label: 'Run Electrical Rule Check (ERC)',
        description: 'Validate schematic electrical rules with kicad-cli',
        command: COMMANDS.runERC,
        requirements: { all: ['workspaceTrusted', 'schematicOpen'] }
      },
      {
        label: 'Check board readiness',
        description: 'Run BoardReadyOps checks for manufacturing readiness',
        command: COMMANDS.boardReadyOpsCheck,
        requirements: { all: ['workspaceTrusted'] }
      },
      {
        label: 'Show BoardReadyOps remediation plan',
        description: 'Review deterministic next actions without AI',
        command: COMMANDS.boardReadyOpsPlan,
        requirements: { all: ['workspaceTrusted', 'hasProject'] }
      },
      {
        label: 'Analyze latest DRC results with AI',
        description: 'Summarize and prioritize the most recent DRC findings',
        command: COMMANDS.aiProactiveDRC,
        requirements: { all: ['aiEnabled', 'pcbOpen'] }
      },
      {
        label: 'Open quality gate documentation',
        description:
          'Review the current gate definitions and remediation guidance',
        command: COMMANDS.qualityGateOpenDocs
      }
    ]
  },
  {
    id: 'release',
    command: COMMANDS.openReleaseTasks,
    icon: '$(package)',
    label: 'Fabrication Release',
    description: 'Prepare reviewed manufacturing outputs and release evidence',
    placeholder: 'Fabrication Release — choose an output workflow',
    availability: 'trustedProject',
    actions: [
      {
        label: 'Open manufacturing release wizard',
        description: 'Run the gated MCP-assisted release workflow',
        command: COMMANDS.manufacturingRelease,
        requirements: { all: ['mcpConnected', 'mcpManufacturingMode'] }
      },
      {
        label: 'Export manufacturing package',
        description: 'Create the standard fabrication output bundle',
        command: COMMANDS.exportManufacturingPackage,
        requirements: { all: ['pcbOpen'] }
      },
      {
        label: 'Export Gerbers and drill files',
        description: 'Generate board fabrication layers and drill outputs',
        command: COMMANDS.exportGerbersWithDrill,
        requirements: { all: ['pcbOpen'] }
      },
      {
        label: 'Export BOM (XLSX)',
        description: 'Create a spreadsheet bill of materials',
        command: COMMANDS.exportBOMXLSX,
        requirements: { all: ['schematicOpen'] }
      },
      {
        label: 'Run export preset',
        description: 'Execute a saved repeatable export configuration',
        command: COMMANDS.runExportPreset
      },
      {
        label: 'Run KiCad jobset',
        description: 'Execute the active .kicad_jobset workflow',
        command: COMMANDS.runJobset,
        requirements: { all: ['jobsetOpen'] }
      }
    ]
  },
  {
    id: 'automate',
    command: COMMANDS.openAutomateTasks,
    icon: '$(sparkle)',
    label: 'Automate',
    description: 'Configure MCP and AI-assisted project workflows',
    placeholder: 'Automate — choose an MCP or AI workflow',
    availability: 'project',
    actions: [
      {
        label: 'Set up MCP integration',
        description: 'Generate the workspace MCP configuration',
        command: COMMANDS.setupMcpIntegration,
        requirements: { all: ['workspaceTrusted'] }
      },
      {
        label: 'Install kicad-mcp-pro',
        description: 'Install the optional MCP server artifact',
        command: COMMANDS.installMcp,
        requirements: { all: ['workspaceTrusted'] }
      },
      {
        label: 'Retry MCP connection',
        description: 'Refresh the current MCP server connection',
        command: COMMANDS.retryMcp,
        requirements: { all: ['mcpRetryAvailable'] }
      },
      {
        label: 'Pick MCP profile',
        description: 'Select the smallest tool profile for this project',
        command: COMMANDS.pickMcpProfile,
        requirements: { all: ['workspaceTrusted'] }
      },
      {
        label: 'Open design intent',
        description: 'Review or update MCP-backed design intent',
        command: COMMANDS.openDesignIntent,
        requirements: { all: ['workspaceTrusted', 'mcpConnected'] }
      },
      {
        label: 'Open AI chat',
        description: 'Start the configured project-aware assistant',
        command: COMMANDS.openAiChat,
        requirements: { all: ['aiEnabled'] }
      },
      {
        label: 'Manage chat provider',
        description: 'Choose and configure the active AI provider',
        command: COMMANDS.manageChatProvider
      },
      {
        label: 'Refresh AI fix queue',
        description: 'Reload proposed MCP-backed project fixes',
        command: COMMANDS.refreshFixQueue,
        requirements: { all: ['workspaceTrusted', 'mcpConnected'] }
      }
    ]
  },
  {
    id: 'maintain',
    command: COMMANDS.openMaintainTasks,
    icon: '$(tools)',
    label: 'Maintain',
    description: 'Manage KiCad CLI, libraries, settings, logs, and support',
    placeholder: 'Maintain — choose a setup or maintenance action',
    availability: 'always',
    actions: [
      {
        label: 'Detect kicad-cli',
        description: 'Refresh the installed KiCad command-line capability',
        command: COMMANDS.detectCli,
        availability: 'trusted'
      },
      {
        label: 'Open settings panel',
        description: 'Configure KiCad Studio, MCP, AI, and export behavior',
        command: COMMANDS.openSettings
      },
      {
        label: 'Refresh project tree',
        description: 'Rescan the active workspace project structure',
        command: COMMANDS.refreshProjectTree,
        availability: 'project'
      },
      {
        label: 'Reindex libraries',
        description: 'Rebuild symbol and footprint search indexes',
        command: COMMANDS.reindexLibraries,
        availability: 'project'
      },
      {
        label: 'Refresh PCM repositories',
        description: 'Reload configured KiCad package repositories',
        command: COMMANDS.refreshPcmLibraries,
        availability: 'project'
      },
      {
        label: 'Update all PCM packages',
        description: 'Apply available package content updates',
        command: COMMANDS.updateAllPcmPackages,
        availability: 'trustedProject'
      },
      {
        label: 'Set component search API key',
        description:
          'Store the Octopart/Nexar credential in VS Code SecretStorage',
        command: COMMANDS.setOctopartApiKey
      },
      {
        label: 'Set AI API key',
        description: 'Store a provider credential in VS Code SecretStorage',
        command: COMMANDS.setAiApiKey
      },
      {
        label: 'Clear AI provider key',
        description: 'Remove the selected AI provider credential',
        command: COMMANDS.clearAiKey
      },
      {
        label: 'Clear all stored secrets',
        description: 'Remove all KiCad Studio credentials from SecretStorage',
        command: COMMANDS.clearSecrets
      },
      {
        label: 'Show stored secret keys',
        description:
          'Review which provider keys are stored without revealing values',
        command: COMMANDS.showStoredSecrets
      },
      {
        label: 'Open MCP log',
        description: 'Inspect the current MCP integration log',
        command: COMMANDS.openMcpLog,
        requirements: { all: ['mcpAvailable'] }
      },
      {
        label: 'Send feedback',
        description: 'Open the public feedback flow for KiCad Studio',
        command: COMMANDS.sendFeedback
      }
    ]
  }
] as const;
