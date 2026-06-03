import {
  KICAD_MCP_PROFILES,
  isKicadMcpProfile
} from '../../src/mcp/profileCatalog';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('profileCatalog', () => {
  describe('KICAD_MCP_PROFILES', () => {
    it('contains all expected profiles', () => {
      const ids = (KICAD_MCP_PROFILES as readonly { id: string }[]).map(
        (p) => p.id
      );
      expect(ids).toEqual([
        'full',
        'minimal',
        'schematic_only',
        'pcb_only',
        'manufacturing',
        'high_speed',
        'power',
        'simulation',
        'analysis',
        'agent_full'
      ]);
    });

    it('every profile has a non-empty id, label, and blurb', () => {
      for (const profile of KICAD_MCP_PROFILES) {
        expect(profile.id).toBeTruthy();
        expect(profile.label).toBeTruthy();
        expect(profile.blurb).toBeTruthy();
      }
    });

    it('profile ids are unique', () => {
      const ids = (KICAD_MCP_PROFILES as readonly { id: string }[]).map(
        (p) => p.id
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('is declared as const (type-level readonly)', () => {
      const profiles: readonly {
        readonly id: string;
        readonly label: string;
        readonly blurb: string;
      }[] = KICAD_MCP_PROFILES;
      expect(profiles.length).toBeGreaterThan(0);
    });
  });

  describe('isKicadMcpProfile', () => {
    it('returns true for valid profile ids', () => {
      expect(isKicadMcpProfile('full')).toBe(true);
      expect(isKicadMcpProfile('minimal')).toBe(true);
      expect(isKicadMcpProfile('schematic_only')).toBe(true);
      expect(isKicadMcpProfile('pcb_only')).toBe(true);
      expect(isKicadMcpProfile('manufacturing')).toBe(true);
      expect(isKicadMcpProfile('high_speed')).toBe(true);
      expect(isKicadMcpProfile('power')).toBe(true);
      expect(isKicadMcpProfile('simulation')).toBe(true);
      expect(isKicadMcpProfile('analysis')).toBe(true);
      expect(isKicadMcpProfile('agent_full')).toBe(true);
    });

    it('returns false for invalid profile ids', () => {
      expect(isKicadMcpProfile('')).toBe(false);
      expect(isKicadMcpProfile('unknown')).toBe(false);
      expect(isKicadMcpProfile('FULL')).toBe(false);
      expect(isKicadMcpProfile('full ')).toBe(false);
      expect(isKicadMcpProfile('extra')).toBe(false);
    });
  });
});
