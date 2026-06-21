import { TOOL_NAMES } from '../../src/lm/languageModelTools';
import {
  MODE_DESCRIPTIONS,
  TOOL_CAPABILITY_MODES,
  getToolMode,
  isReadOnlyTool,
  modeRequiresPreview,
  modeRequiresTrust,
  type CapabilityMode
} from '../../src/lm/toolCapabilityModes';

describe('#406 assistant tool capability modes', () => {
  it('assigns a documented mode to every registered tool', () => {
    for (const toolName of Object.values(TOOL_NAMES)) {
      const mode = getToolMode(toolName);
      expect(mode).toBeDefined();
      expect(MODE_DESCRIPTIONS[mode as CapabilityMode]).toBeTruthy();
    }
  });

  it('does not classify any unknown tools', () => {
    const known = new Set<string>(Object.values(TOOL_NAMES));
    for (const toolName of Object.keys(TOOL_CAPABILITY_MODES)) {
      expect(known.has(toolName)).toBe(true);
    }
  });

  it('keeps read-only tools read-only', () => {
    const readOnly = Object.values(TOOL_NAMES).filter(isReadOnlyTool);
    expect(readOnly).toEqual(
      expect.arrayContaining([
        TOOL_NAMES.openFile,
        TOOL_NAMES.searchComponent,
        TOOL_NAMES.searchSymbol,
        TOOL_NAMES.searchFootprint,
        TOOL_NAMES.getActiveContext,
        TOOL_NAMES.listVariants
      ])
    );
    // State-changing / artifact tools must never be read-only.
    expect(isReadOnlyTool(TOOL_NAMES.exportGerbers)).toBe(false);
    expect(isReadOnlyTool(TOOL_NAMES.switchVariant)).toBe(false);
    expect(isReadOnlyTool(TOOL_NAMES.runDrc)).toBe(false);
  });

  it('classifies check tools as review and artifact/state tools as release-preparation', () => {
    expect(getToolMode(TOOL_NAMES.runDrc)).toBe('review');
    expect(getToolMode(TOOL_NAMES.runErc)).toBe('review');
    expect(getToolMode(TOOL_NAMES.exportGerbers)).toBe('release-preparation');
    expect(getToolMode(TOOL_NAMES.switchVariant)).toBe('release-preparation');
  });

  it('requires trust and preview only for release-preparation', () => {
    expect(modeRequiresTrust('release-preparation')).toBe(true);
    expect(modeRequiresPreview('release-preparation')).toBe(true);
    for (const mode of ['read-only', 'review'] as CapabilityMode[]) {
      expect(modeRequiresTrust(mode)).toBe(false);
      expect(modeRequiresPreview(mode)).toBe(false);
    }
  });
});
