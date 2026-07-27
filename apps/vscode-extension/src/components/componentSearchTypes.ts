export interface ComponentPriceBreak {
  quantity: number;
  price: number;
  currency: string;
}

export interface ComponentOffer {
  seller: string;
  inventoryLevel?: number | undefined;
  prices: ComponentPriceBreak[];
}

export interface ComponentSearchResult {
  source: 'octopart' | 'lcsc' | 'local';
  mpn: string;
  manufacturer: string;
  description: string;
  category?: string | undefined;
  datasheetUrl?: string | undefined;
  imageUrl?: string | undefined;
  lcscPartNumber?: string | undefined;
  pcmPackageId?: string | undefined;
  offers: ComponentOffer[];
  specs: Array<{
    name: string;
    value: string;
  }>;
}
