import {
  MCP_COMPAT,
  describeMcpCompatibility,
  getMcpCompatStatus,
  isMcpVersionSupported,
  normalizeMcpVersion
} from '../../src/mcp/compat';

describe('mcp/compat', () => {
  describe('normalizeMcpVersion', () => {
    it('returns 0.0.0 for undefined', () => {
      expect(normalizeMcpVersion(undefined)).toBe('0.0.0');
    });

    it('returns 0.0.0 for an empty string', () => {
      expect(normalizeMcpVersion('')).toBe('0.0.0');
    });

    it('returns 0.0.0 for an uncoercible string', () => {
      expect(normalizeMcpVersion('not-a-version')).toBe('0.0.0');
    });

    it('coerces a loose version', () => {
      expect(normalizeMcpVersion('v3.9')).toBe('3.9.0');
    });

    it('passes through a clean version', () => {
      expect(normalizeMcpVersion('3.9.2')).toBe('3.9.2');
    });
  });

  describe('isMcpVersionSupported', () => {
    it('is true for an in-range version', () => {
      expect(isMcpVersionSupported('3.9.2')).toBe(true);
    });

    it('is false for a below-range version', () => {
      expect(isMcpVersionSupported('3.0.0')).toBe(false);
    });

    it('is false when the version is missing', () => {
      expect(isMcpVersionSupported(undefined)).toBe(false);
    });
  });

  describe('getMcpCompatStatus', () => {
    it('is ok for an in-range version', () => {
      expect(getMcpCompatStatus('3.9.2')).toBe('ok');
    });

    it('is incompatible below the required range', () => {
      expect(getMcpCompatStatus('3.0.0')).toBe('incompatible');
    });

    it('is incompatible at the upper bound', () => {
      expect(getMcpCompatStatus('4.0.0')).toBe('incompatible');
    });
  });

  describe('describeMcpCompatibility', () => {
    it('describes a supported version', () => {
      const message = describeMcpCompatibility('3.9.2');
      expect(message).toContain('3.9.2');
      expect(message).toContain('supported');
    });

    it('describes an incompatible version with the required range', () => {
      const message = describeMcpCompatibility('3.0.0');
      expect(message).toContain(MCP_COMPAT.required);
      expect(message.toLowerCase()).toContain('outside');
    });
  });
});
