import {
  deriveCommandVersionStatus,
  parseKiCadMajor
} from '../../src/cli/kicadCliCapabilities';

describe('kicadCliCapabilities', () => {
  it('parses stable, preview, missing, and malformed KiCad versions', () => {
    expect(parseKiCadMajor({ version: '10.0.3' })).toBe(10);
    expect(parseKiCadMajor({ version: '11.0.0-rc1' })).toBe(11);
    expect(parseKiCadMajor({ version: 'nightly' })).toBeUndefined();
    expect(parseKiCadMajor({ version: '9'.repeat(400) })).toBeUndefined();
    expect(parseKiCadMajor(undefined)).toBeUndefined();
  });

  it('derives command eligibility without detector or UI dependencies', () => {
    expect(deriveCommandVersionStatus(7, 8)).toBe('unsupported');
    expect(deriveCommandVersionStatus(10, 8)).toBe('primary');
    expect(deriveCommandVersionStatus(11, 8)).toBe('preview');
    expect(deriveCommandVersionStatus(9, 8)).toBe('deprecated');
    expect(deriveCommandVersionStatus(7, 7)).toBe('unknown');
  });
});
