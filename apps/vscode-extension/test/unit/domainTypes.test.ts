import type {
  BomEntry,
  BomSummary,
  BomWebviewMessage
} from '../../src/bom/bomTypes';
import type {
  ComponentOffer,
  ComponentPriceBreak,
  ComponentSearchResult
} from '../../src/components/componentSearchTypes';
import type {
  BomEntry as LegacyBomEntry,
  BomSummary as LegacyBomSummary,
  BomWebviewMessage as LegacyBomWebviewMessage,
  ComponentOffer as LegacyComponentOffer,
  ComponentPriceBreak as LegacyComponentPriceBreak,
  ComponentSearchResult as LegacyComponentSearchResult
} from '../../src/types';

const priceBreak = {
  quantity: 10,
  price: 1.25,
  currency: 'USD'
} satisfies ComponentPriceBreak;
const legacyPriceBreak: LegacyComponentPriceBreak = priceBreak;
const directPriceBreak: ComponentPriceBreak = legacyPriceBreak;

const offer = {
  seller: 'Fixture Distributor',
  inventoryLevel: 42,
  prices: [directPriceBreak]
} satisfies ComponentOffer;
const legacyOffer: LegacyComponentOffer = offer;
const directOffer: ComponentOffer = legacyOffer;

const component = {
  source: 'octopart',
  mpn: 'TPS5430',
  manufacturer: 'Texas Instruments',
  description: 'Buck regulator',
  category: 'Power Management',
  datasheetUrl: 'https://example.test/tps5430.pdf',
  imageUrl: 'https://example.test/tps5430.png',
  lcscPartNumber: 'C9865',
  pcmPackageId: 'fixture/package',
  offers: [directOffer],
  specs: [{ name: 'Package', value: 'SOIC-8' }]
} satisfies ComponentSearchResult;
const legacyComponent: LegacyComponentSearchResult = component;
const directComponent: ComponentSearchResult = legacyComponent;

const bomEntry = {
  references: ['U1'],
  value: 'TPS5430',
  footprint: 'Package_SO:SOIC-8',
  quantity: 1,
  mpn: 'TPS5430DDAR',
  manufacturer: 'Texas Instruments',
  lcsc: 'C9865',
  description: 'Buck regulator',
  dnp: false,
  uuid: 'fixture-uuid'
} satisfies BomEntry;
const legacyBomEntry: LegacyBomEntry = bomEntry;
const directBomEntry: BomEntry = legacyBomEntry;

const bomSummary = {
  totalComponents: 1,
  uniqueValues: 1
} satisfies BomSummary;
const legacyBomSummary: LegacyBomSummary = bomSummary;
const directBomSummary: BomSummary = legacyBomSummary;

const bomMessage = {
  type: 'rowSelected',
  payload: { reference: 'U1' }
} satisfies BomWebviewMessage;
const legacyBomMessage: LegacyBomWebviewMessage = bomMessage;
const directBomMessage: BomWebviewMessage = legacyBomMessage;

describe('domain type ownership', () => {
  it('preserves Component Search shapes through the compatibility aggregator', () => {
    expect(directComponent).toEqual(
      expect.objectContaining({
        source: 'octopart',
        offers: [
          expect.objectContaining({
            inventoryLevel: 42,
            prices: [expect.objectContaining({ currency: 'USD' })]
          })
        ]
      })
    );
  });

  it('preserves BOM shapes through the compatibility aggregator', () => {
    expect(directBomEntry).toMatchObject({ references: ['U1'], dnp: false });
    expect(directBomSummary).toEqual({ totalComponents: 1, uniqueValues: 1 });
    expect(directBomMessage).toEqual({
      type: 'rowSelected',
      payload: { reference: 'U1' }
    });
  });
});
