import {
  MCP_COMPAT,
  describeMcpCompatibility,
  getMcpCompatStatus,
  isMcpVersionSupported,
  normalizeMcpVersion
} from '../../src/mcp/compat';

describe('MCP compatibility helpers', () => {
  it('declares the supported MCP 3.x contract', () => {
    expect(MCP_COMPAT).toEqual({
      required: '>=3.5.2 <4.0.0',
      recommended: '>=3.5.2 <4.0.0',
      testedAgainst: '3.9.2'
    });
  });

  it('normalizes versions and classifies compatibility', () => {
    expect(normalizeMcpVersion('kicad-mcp-pro 3.9.2')).toBe('3.9.2');
    expect(normalizeMcpVersion('v3.1')).toBe('3.1.0');
    expect(normalizeMcpVersion('not-a-version')).toBe('0.0.0');
    expect(normalizeMcpVersion(undefined)).toBe('0.0.0');
    expect(getMcpCompatStatus('3.5.2')).toBe('ok');
    expect(getMcpCompatStatus('3.6.0')).toBe('ok');
    expect(getMcpCompatStatus('3.5.1')).toBe('incompatible');
    expect(getMcpCompatStatus('4.0.0')).toBe('incompatible');
    expect(getMcpCompatStatus(undefined)).toBe('incompatible');
    expect(isMcpVersionSupported('3.5.2')).toBe(true);
    expect(isMcpVersionSupported('4.0.0')).toBe(false);
  });

  it('describes unknown, incompatible, warning, and supported versions', () => {
    expect(describeMcpCompatibility(undefined)).toBe(
      `Unable to determine kicad-mcp-pro version. Required range: ${MCP_COMPAT.required}.`
    );
    expect(describeMcpCompatibility('not-a-version')).toBe(
      `Unable to determine kicad-mcp-pro version. Required range: ${MCP_COMPAT.required}.`
    );
    expect(describeMcpCompatibility('3.5.1')).toBe(
      `kicad-mcp-pro 3.5.1 is outside the required range ${MCP_COMPAT.required}.`
    );
    expect(describeMcpCompatibility('3.9.2')).toBe(
      'kicad-mcp-pro 3.9.2 is supported.'
    );

    const mutableCompat = MCP_COMPAT as { recommended: string };
    const originalRecommended = mutableCompat.recommended;
    try {
      mutableCompat.recommended = '>=3.6.0 <4.0.0';
      expect(getMcpCompatStatus('3.5.2')).toBe('warn');
      expect(describeMcpCompatibility('3.5.2')).toBe(
        'kicad-mcp-pro 3.5.2 satisfies the required range but is older than >=3.6.0 <4.0.0.'
      );
    } finally {
      mutableCompat.recommended = originalRecommended;
    }
  });
});
