import {
  buildKiCadFeatureSupport,
  describeKiCadSupportLine,
  parseKiCadMajor
} from '../../src/cli/kicadCliSupport';

describe('kicadCliSupport', () => {
  it('classifies the supported KiCad 8, 9, and 10 support lines', () => {
    expect(parseKiCadMajor({ version: '10.0.3' })).toBe(10);
    expect(
      describeKiCadSupportLine({
        version: '10.0.3',
        versionLabel: 'KiCad 10.0.3'
      }).state
    ).toBe('primary');
    expect(
      describeKiCadSupportLine({
        version: '9.0.9',
        versionLabel: 'KiCad 9.0.9'
      }).state
    ).toBe('supported');
    expect(
      describeKiCadSupportLine({
        version: '8.0.8',
        versionLabel: 'KiCad 8.0.8'
      }).state
    ).toBe('deprecated');
    expect(
      describeKiCadSupportLine({
        version: '7.0.11',
        versionLabel: 'KiCad 7.0.11'
      }).state
    ).toBe('unsupported');
  });

  it('reports feature availability from version line plus capability probes', () => {
    const features = buildKiCadFeatureSupport({
      cli: {
        path: '/usr/bin/kicad-cli',
        version: '10.0.3',
        versionLabel: 'KiCad 10.0.3',
        source: 'path'
      },
      capabilities: {
        drc: true,
        erc: true,
        bom: true,
        netlist: true,
        gerbers: true,
        drill: true,
        jobset: true,
        pdf3d: true,
        odb: true,
        variantOption: true
      }
    });

    expect(features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'core-validation',
          state: 'available'
        }),
        expect.objectContaining({
          id: 'variants',
          state: 'available'
        }),
        expect.objectContaining({
          id: 'odb-export',
          state: 'available'
        }),
        expect.objectContaining({
          id: 'three-d-pdf-export',
          state: 'available'
        })
      ])
    );
  });

  it('keeps KiCad 8 core support while marking newer feature gates unsupported', () => {
    const features = buildKiCadFeatureSupport({
      cli: {
        path: '/usr/bin/kicad-cli',
        version: '8.0.8',
        versionLabel: 'KiCad 8.0.8',
        source: 'path'
      },
      capabilities: {
        drc: true,
        erc: true,
        bom: true,
        netlist: true,
        gerbers: true
      }
    });

    expect(features.find((item) => item.id === 'core-validation')).toEqual(
      expect.objectContaining({ state: 'available' })
    );
    expect(features.find((item) => item.id === 'jobsets')).toEqual(
      expect.objectContaining({ state: 'unsupported' })
    );
    expect(features.find((item) => item.id === 'variants')).toEqual(
      expect.objectContaining({ state: 'unsupported' })
    );
    expect(features.find((item) => item.id === 'odb-export')).toEqual(
      expect.objectContaining({ state: 'unsupported' })
    );
  });

  it('keeps KiCad 9 ODB++ support while marking KiCad 10-only exports unsupported', () => {
    const features = buildKiCadFeatureSupport({
      cli: {
        path: '/usr/bin/kicad-cli',
        version: '9.0.9',
        versionLabel: 'KiCad 9.0.9',
        source: 'path'
      },
      capabilities: {
        drc: true,
        erc: true,
        bom: true,
        netlist: true,
        gerbers: true,
        drill: true,
        jobset: true,
        odb: true
      }
    });

    expect(features.find((item) => item.id === 'odb-export')).toEqual(
      expect.objectContaining({ state: 'available' })
    );
    expect(features.find((item) => item.id === 'variants')).toEqual(
      expect.objectContaining({ state: 'unsupported' })
    );
    expect(features.find((item) => item.id === 'three-d-pdf-export')).toEqual(
      expect.objectContaining({ state: 'unsupported' })
    );
  });

  it('marks a feature unsupported when a detected CLI capability probe fails', () => {
    const features = buildKiCadFeatureSupport({
      cli: {
        path: '/usr/bin/kicad-cli',
        version: '10.0.3',
        versionLabel: 'KiCad 10.0.3',
        source: 'path'
      },
      capabilities: {
        drc: true,
        erc: true,
        bom: true,
        netlist: true,
        gerbers: true,
        drill: true,
        jobset: true,
        pdf3d: false,
        odb: true,
        variantOption: true
      }
    });

    expect(features.find((item) => item.id === 'three-d-pdf-export')).toEqual(
      expect.objectContaining({
        state: 'unsupported',
        summary: 'missing pdf3d'
      })
    );
  });
});
