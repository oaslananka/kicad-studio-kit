import {
  KICAD_MCP_PRIMARY_PROFILES,
  KICAD_MCP_PROFILES,
  isKicadMcpProfile,
  resolveKicadMcpProfile
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
        'review',
        'build',
        'release',
        'expert',
        'minimal',
        'schematic_only',
        'pcb_only',
        'manufacturing',
        'high_speed',
        'power',
        'simulation',
        'analysis'
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

  describe('primary workflow profiles', () => {
    it('puts the published task-oriented profiles first', () => {
      expect(KICAD_MCP_PRIMARY_PROFILES.map((profile) => profile.id)).toEqual([
        'review',
        'build',
        'release',
        'expert'
      ]);
      expect(KICAD_MCP_PROFILES.slice(0, 4)).toEqual(
        KICAD_MCP_PRIMARY_PROFILES
      );
    });
  });

  describe('resolveKicadMcpProfile', () => {
    it('migrates only equivalent legacy aliases', () => {
      expect(resolveKicadMcpProfile('default')).toBe('review');
      expect(resolveKicadMcpProfile('full')).toBe('expert');
      expect(resolveKicadMcpProfile('agent_full')).toBe('expert');
    });

    it('preserves supported specialized profiles without widening scope', () => {
      expect(resolveKicadMcpProfile('analysis')).toBe('analysis');
      expect(resolveKicadMcpProfile('manufacturing')).toBe('manufacturing');
      expect(resolveKicadMcpProfile('pcb_only')).toBe('pcb_only');
    });

    it('fails closed to review for unknown or missing profile values', () => {
      expect(resolveKicadMcpProfile('unknown')).toBe('review');
      expect(resolveKicadMcpProfile(undefined)).toBe('review');
    });
  });

  describe('isKicadMcpProfile', () => {
    it('returns true for valid profile ids', () => {
      expect(isKicadMcpProfile('review')).toBe(true);
      expect(isKicadMcpProfile('build')).toBe(true);
      expect(isKicadMcpProfile('release')).toBe(true);
      expect(isKicadMcpProfile('expert')).toBe(true);
      expect(isKicadMcpProfile('minimal')).toBe(true);
      expect(isKicadMcpProfile('schematic_only')).toBe(true);
      expect(isKicadMcpProfile('pcb_only')).toBe(true);
      expect(isKicadMcpProfile('manufacturing')).toBe(true);
      expect(isKicadMcpProfile('high_speed')).toBe(true);
      expect(isKicadMcpProfile('power')).toBe(true);
      expect(isKicadMcpProfile('simulation')).toBe(true);
      expect(isKicadMcpProfile('analysis')).toBe(true);
    });

    it('returns false for invalid profile ids', () => {
      expect(isKicadMcpProfile('')).toBe(false);
      expect(isKicadMcpProfile('unknown')).toBe(false);
      expect(isKicadMcpProfile('FULL')).toBe(false);
      expect(isKicadMcpProfile('full ')).toBe(false);
      expect(isKicadMcpProfile('extra')).toBe(false);
      expect(isKicadMcpProfile('full')).toBe(false);
      expect(isKicadMcpProfile('agent_full')).toBe(false);
    });
  });
});
