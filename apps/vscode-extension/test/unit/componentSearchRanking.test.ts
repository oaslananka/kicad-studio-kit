import type { BomEntry, ComponentSearchResult } from '../../src/types';
import {
  buildComponentSearchRecommendation,
  buildComponentSearchViewResults,
  type ComponentSearchRankingMessages
} from '../../src/components/componentSearchRanking';

const messages: ComponentSearchRankingMessages = {
  inStock: (count) => `${count} in stock`,
  stockNotReported: 'Stock not reported',
  noAvailabilityData: 'No availability data',
  footprintNotReported: 'Not reported',
  datasheetAvailable: 'Available',
  datasheetNotProvided: 'Not provided',
  recommendedFor: (reference) => `Recommended for ${reference}`
};

function result(
  overrides: Partial<ComponentSearchResult> = {}
): ComponentSearchResult {
  return {
    source: 'lcsc',
    mpn: 'TPS5430',
    manufacturer: 'Texas Instruments',
    description: 'Buck regulator',
    offers: [],
    specs: [],
    ...overrides
  };
}

function bomEntry(overrides: Partial<BomEntry> = {}): BomEntry {
  return {
    references: ['U1'],
    value: 'TPS5430',
    footprint: 'Package_SO:SOIC-8',
    quantity: 1,
    mpn: '',
    manufacturer: '',
    lcsc: '',
    description: '',
    dnp: false,
    ...overrides
  };
}

describe('Component Search ranking boundary', () => {
  it('formats inventory, footprint, datasheet, and exact identifier confidence', () => {
    const [view] = buildComponentSearchViewResults(
      [
        result({
          lcscPartNumber: 'C12345',
          datasheetUrl: 'https://example.test/tps5430.pdf',
          offers: [
            { seller: 'A', inventoryLevel: 1_000, prices: [] },
            { seller: 'B', inventoryLevel: 250, prices: [] },
            { seller: 'C', prices: [] }
          ],
          specs: [{ name: 'Package / Case', value: 'SOIC-8' }]
        })
      ],
      'C12345',
      { locale: 'en-US', messages }
    );

    expect(view).toEqual({
      result: expect.objectContaining({ mpn: 'TPS5430' }),
      availability: '1,250 in stock',
      footprintMatch: 'SOIC-8',
      datasheet: 'Available',
      confidence: 'High'
    });
  });

  it('preserves stock and footprint fallback states', () => {
    const views = buildComponentSearchViewResults(
      [
        result({
          offers: [{ seller: 'A', prices: [] }],
          category: 'Power Management'
        }),
        result({ mpn: 'LM1117' })
      ],
      'unmatched query',
      { locale: 'en-US', messages }
    );

    expect(views[0]).toMatchObject({
      availability: 'Stock not reported',
      footprintMatch: 'Power Management',
      datasheet: 'Not provided',
      confidence: 'Low'
    });
    expect(views[1]).toMatchObject({
      availability: 'No availability data',
      footprintMatch: 'Not reported',
      confidence: 'Low'
    });
  });

  it('classifies partial identifiers and local results as high confidence', () => {
    const views = buildComponentSearchViewResults(
      [
        result({ mpn: 'OPA192IDBVR' }),
        result({ source: 'local', mpn: 'Device:R' })
      ],
      'OPA192',
      { locale: 'en-US', messages }
    );

    expect(views.map((entry) => entry.confidence)).toEqual(['High', 'High']);
  });

  it('classifies meaningful token matches as medium and weak matches as low', () => {
    const views = buildComponentSearchViewResults(
      [
        result({
          mpn: 'LMR33630',
          description: 'Synchronous buck regulator',
          specs: [{ name: 'Package', value: 'HTSSOP' }]
        }),
        result({ mpn: 'NE555', description: 'Timer' })
      ],
      'buck regulator soic',
      { locale: 'en-US', messages }
    );

    expect(views.map((entry) => entry.confidence)).toEqual(['Medium', 'Low']);
  });

  it('builds recommendations with MPN then LCSC then value-footprint precedence', () => {
    const project = { projectName: 'Power Board' };

    expect(
      buildComponentSearchRecommendation(
        bomEntry({ mpn: 'TPS5430DDAR', lcsc: 'C9865' }),
        project,
        messages
      )
    ).toEqual({
      label: 'Recommended for U1',
      query: 'TPS5430DDAR',
      detail: 'Power Board • TPS5430 • SOIC-8'
    });

    expect(
      buildComponentSearchRecommendation(
        bomEntry({ references: [], value: '', mpn: '', lcsc: 'C9865' }),
        project,
        messages
      )
    ).toEqual({
      label: 'Recommended for symbol',
      query: 'C9865',
      detail: 'Power Board • SOIC-8'
    });

    expect(
      buildComponentSearchRecommendation(
        bomEntry({ mpn: '', lcsc: '', value: '10uF' }),
        {},
        messages
      )
    ).toEqual({
      label: 'Recommended for U1',
      query: '10uF SOIC-8',
      detail: '10uF • SOIC-8'
    });
  });

  it('rejects empty recommendations and preserves unqualified footprints', () => {
    expect(
      buildComponentSearchRecommendation(
        bomEntry({ value: '', footprint: '', references: [] }),
        {},
        messages
      )
    ).toBeUndefined();

    expect(
      buildComponentSearchRecommendation(
        bomEntry({ value: 'LED', footprint: 'LED_0603' }),
        {},
        messages
      )
    ).toMatchObject({ query: 'LED LED_0603', detail: 'LED • LED_0603' });
  });
});
