import {
  buildComponentDetailsHtml,
  buildComponentSearchViewHtml
} from '../../src/components/componentSearchView';
import type { ComponentSearchResult } from '../../src/types';

const result: ComponentSearchResult = {
  source: 'octopart',
  mpn: 'STM32F407VGT6',
  lcscPartNumber: 'C2870',
  manufacturer: 'STMicroelectronics',
  description: '<script>alert(1)</script> MCU',
  category: 'Microcontrollers',
  datasheetUrl: 'https://example.com/datasheet.pdf',
  pcmPackageId: 'official/stm32',
  offers: [
    {
      seller: 'Distributor',
      inventoryLevel: 42,
      prices: [{ quantity: 1, price: 9.5, currency: 'USD' }]
    }
  ],
  specs: [{ name: 'Package', value: 'LQFP-100' }]
};

describe('component search view boundary', () => {
  it('renders the complete search and details surfaces without trusting remote text', () => {
    const searchHtml = buildComponentSearchViewHtml({
      nonce: 'nonce-value',
      cspSource: 'vscode-resource:',
      query: 'STM32F407',
      loading: true,
      providers: [
        { id: 'local', label: 'Local', status: 'ready', detail: 'Indexed' },
        {
          id: 'octopart',
          label: 'Octopart',
          status: 'warning',
          detail: 'API key needed'
        }
      ],
      warnings: ['Provider warning'],
      recentSearches: ['ESP32'],
      recommendations: [
        {
          label: 'Recommended for U1',
          query: 'STM32F407VGT6',
          detail: 'Demo • MCU'
        }
      ],
      results: [
        {
          result,
          availability: '42 in stock',
          footprintMatch: 'LQFP-100',
          datasheet: 'Available',
          confidence: 'High'
        }
      ],
      projectName: 'Demo project',
      error: 'Transient provider error'
    });
    const detailsHtml = buildComponentDetailsHtml(result, {
      nonce: 'nonce-value',
      cspSource: 'vscode-resource:'
    });

    expect(searchHtml).toContain('Component Search');
    expect(searchHtml).toContain('Recommended for U1');
    expect(searchHtml).toContain('Install PCM Library');
    expect(searchHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt; MCU');
    expect(searchHtml).not.toContain('<script>alert(1)</script> MCU');
    expect(detailsHtml).toContain('STM32F407VGT6');
    expect(detailsHtml).toContain('Install PCM Library');
    expect(detailsHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt; MCU');
  });
});
