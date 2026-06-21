import {
  normalizeManufacturer,
  normalizeMpn,
  renderBomRiskReport,
  scoreBom,
  scoreBomEntry,
  scoreBomWithProvider,
  type BomRiskProvider,
  type ComponentIntelligence
} from '../../src/bom/bomRisk';
import type { BomEntry } from '../../src/types';

function entry(overrides: Partial<BomEntry> = {}): BomEntry {
  return {
    references: ['R1'],
    value: '10k',
    footprint: 'Resistor_SMD:R_0402',
    quantity: 1,
    mpn: 'RC0402FR-0710KL',
    manufacturer: 'Yageo',
    lcsc: 'C25744',
    description: '10k 1% resistor',
    dnp: false,
    ...overrides
  };
}

describe('#403 BOM risk', () => {
  describe('normalization', () => {
    it('normalizes MPN to upper-case without spaces', () => {
      expect(normalizeMpn('  rc0402 fr-0710kl ')).toBe('RC0402FR-0710KL');
    });

    it('applies a manufacturer alias map', () => {
      expect(
        normalizeManufacturer('ti', {
          manufacturerAliases: { TI: 'Texas Instruments' }
        })
      ).toBe('Texas Instruments');
      expect(normalizeManufacturer('  Yageo  ')).toBe('Yageo');
    });
  });

  describe('scoreBomEntry', () => {
    it('scores a complete part as ok', () => {
      const scored = scoreBomEntry(entry());
      expect(scored.level).toBe('ok');
      expect(scored.signals).toEqual([]);
    });

    it('flags a part with no MPN and no distributor number as high risk', () => {
      const scored = scoreBomEntry(entry({ mpn: '', lcsc: '' }));
      expect(scored.signals).toContain('no-part-number');
      expect(scored.level).toBe('high');
    });

    it('flags distributor-only sourcing when MPN is missing but LCSC present', () => {
      const scored = scoreBomEntry(entry({ mpn: '' }));
      expect(scored.signals).toContain('distributor-only-sourcing');
    });

    it('flags missing manufacturer, footprint, and value', () => {
      const scored = scoreBomEntry(
        entry({ manufacturer: '', footprint: '', value: '' })
      );
      expect(scored.signals).toEqual(
        expect.arrayContaining([
          'missing-manufacturer',
          'missing-footprint',
          'ambiguous-value'
        ])
      );
    });

    it('adds lifecycle and single-source risk from intelligence', () => {
      const intelligence: ComponentIntelligence = {
        lifecycle: 'obsolete',
        sourceCount: 1,
        source: 'test-provider'
      };
      const scored = scoreBomEntry(entry(), {}, intelligence);
      expect(scored.signals).toContain('lifecycle-obsolete');
      expect(scored.signals).toContain('single-source');
      expect(scored.level).toBe('high');
    });
  });

  describe('scoreBom', () => {
    it('skips DNP entries, sorts by score, and summarizes', () => {
      const report = scoreBom([
        entry({ references: ['R1'] }),
        entry({ references: ['R2'], mpn: '', lcsc: '' }),
        entry({ references: ['R3'], dnp: true, mpn: '' })
      ]);
      expect(report.summary.dnp).toBe(1);
      expect(report.summary.scored).toBe(2);
      expect(report.summary.high).toBe(1);
      expect(report.entries[0]?.references).toEqual(['R2']);
      expect(report.summary.overall).toBe('high');
    });
  });

  describe('scoreBomWithProvider', () => {
    it('enriches entries and tolerates provider failures', async () => {
      const provider: BomRiskProvider = {
        name: 'test',
        lookup: async (mpn) => {
          if (mpn === 'BOOM') {
            throw new Error('provider down');
          }
          return { lifecycle: 'nrnd', source: 'test' };
        }
      };
      const report = await scoreBomWithProvider(
        [
          entry({ references: ['R1'] }),
          entry({ references: ['R2'], mpn: 'BOOM' })
        ],
        provider
      );
      const r1 = report.entries.find((e) => e.references[0] === 'R1');
      const r2 = report.entries.find((e) => e.references[0] === 'R2');
      expect(r1?.signals).toContain('lifecycle-nrnd');
      // R2's provider threw → it keeps only its offline score (no crash).
      expect(r2?.intelligence).toBeUndefined();
    });

    it('does not look up entries without an MPN', async () => {
      const lookup = jest.fn().mockResolvedValue(undefined);
      const provider: BomRiskProvider = { name: 'test', lookup };
      await scoreBomWithProvider([entry({ mpn: '' })], provider);
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  describe('renderBomRiskReport', () => {
    it('lists flagged parts and the overall verdict', () => {
      const report = scoreBom([
        entry({ references: ['R2'], mpn: '', lcsc: '' })
      ]);
      const md = renderBomRiskReport(report);
      expect(md).toContain('# BOM Risk Report');
      expect(md).toContain('Overall risk: HIGH');
      expect(md).toContain('no-part-number');
    });

    it('states when no risks are found', () => {
      const md = renderBomRiskReport(scoreBom([entry()]));
      expect(md).toContain('No sourcing or lifecycle risks were detected.');
    });
  });
});
