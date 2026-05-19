import {
  MCP_COMPAT,
  getMcpCompatStatus,
  isMcpVersionSupported,
  normalizeMcpVersion
} from '../../src/mcp/compat';

describe('MCP compatibility helpers', () => {
  it('declares the supported MCP 1.x contract', () => {
    expect(MCP_COMPAT).toEqual({
      required: '>=1.0.0 <2.0.0',
      recommended: '>=1.0.0 <2.0.0',
      testedAgainst: '1.0.0'
    });
  });

  it('normalizes versions and classifies compatibility', () => {
    expect(normalizeMcpVersion('kicad-mcp-pro 1.0.0')).toBe('1.0.0');
    expect(normalizeMcpVersion('v3.1')).toBe('3.1.0');
    expect(normalizeMcpVersion('not-a-version')).toBe('0.0.0');
    expect(normalizeMcpVersion(undefined)).toBe('0.0.0');
    expect(getMcpCompatStatus('1.0.0')).toBe('ok');
    expect(getMcpCompatStatus('1.5.0')).toBe('ok');
    expect(getMcpCompatStatus('0.9.9')).toBe('incompatible');
    expect(getMcpCompatStatus('2.0.0')).toBe('incompatible');
    expect(getMcpCompatStatus(undefined)).toBe('incompatible');
    expect(isMcpVersionSupported('1.1.0')).toBe(true);
    expect(isMcpVersionSupported('2.0.0')).toBe(false);
  });
});
