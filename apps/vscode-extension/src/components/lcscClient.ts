import type { ComponentSearchResult } from '../types';
import { fetchWithTimeout } from './fetchWithTimeout';

export class LcscClient {
  async search(query: string): Promise<ComponentSearchResult[]> {
    const response = await fetchWithTimeout(
      `https://wmsc.lcsc.com/wmsc/search/global?keyword=${encodeURIComponent(query)}`
    );
    if (!response.ok) {
      throw new Error(`LCSC search failed with ${response.status}.`);
    }

    const json = (await response.json()) as any;
    const rows = json?.result?.productSearchResultVO?.productList ?? [];
    return rows.slice(0, 10).map((row: any) => ({
      source: 'lcsc',
      mpn: row.productCode ?? row.model ?? '',
      manufacturer: row.brandNameEn ?? row.brandName ?? '',
      description: row.productIntroEn ?? row.productIntro ?? '',
      datasheetUrl: row.pdfUrl,
      imageUrl: row.productImageUrl,
      lcscPartNumber: row.productCode ?? '',
      offers: [
        {
          seller: 'LCSC',
          inventoryLevel: Number(row.stockNumber ?? 0),
          prices: (row.productPriceList ?? []).map((price: any) => ({
            quantity: Number(price.ladder ?? 0),
            price: Number(price.productPrice ?? 0),
            currency: 'USD'
          }))
        }
      ],
      specs: []
    }));
  }
}
