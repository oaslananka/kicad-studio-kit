import { TOOL_NAMES } from './languageModelTools';

// Capability modes for assistant-facing tools (#406). Every language-model /
// MCP tool the assistant can call is classified into exactly one mode so its
// blast radius is explicit and testable. This module is editor-free.

export type CapabilityMode = 'read-only' | 'review' | 'release-preparation';

export const MODE_DESCRIPTIONS: Record<CapabilityMode, string> = {
  'read-only':
    'Explorer mode. Returns information about the project and never changes files or project state.',
  review:
    'Advisory mode. Runs checks/validations and returns findings plus proposed next steps; it does not modify design files.',
  'release-preparation':
    'Release-preparation mode. Changes release-relevant project state or produces artifacts. Requires workspace trust and a preview/confirmation before acting.'
};

/**
 * Authoritative mode for every assistant-facing tool. Keyed by the same
 * `TOOL_NAMES` the tools register under, so the registry cannot drift from the
 * registered tool set (enforced by toolCapabilityModes.test.ts).
 */
export const TOOL_CAPABILITY_MODES = {
  [TOOL_NAMES.openFile]: 'read-only',
  [TOOL_NAMES.searchComponent]: 'read-only',
  [TOOL_NAMES.searchSymbol]: 'read-only',
  [TOOL_NAMES.searchFootprint]: 'read-only',
  [TOOL_NAMES.getActiveContext]: 'read-only',
  [TOOL_NAMES.listVariants]: 'read-only',
  [TOOL_NAMES.runDrc]: 'review',
  [TOOL_NAMES.runErc]: 'review',
  [TOOL_NAMES.exportGerbers]: 'release-preparation',
  [TOOL_NAMES.switchVariant]: 'release-preparation'
} as const satisfies Record<string, CapabilityMode>;

export function getToolMode(toolName: string): CapabilityMode | undefined {
  return (TOOL_CAPABILITY_MODES as Record<string, CapabilityMode>)[toolName];
}

export function isReadOnlyTool(toolName: string): boolean {
  return getToolMode(toolName) === 'read-only';
}

/** Release-preparation tools must require workspace trust before acting. */
export function modeRequiresTrust(mode: CapabilityMode): boolean {
  return mode === 'release-preparation';
}

/** Release-preparation tools must present a preview before producing artifacts. */
export function modeRequiresPreview(mode: CapabilityMode): boolean {
  return mode === 'release-preparation';
}
