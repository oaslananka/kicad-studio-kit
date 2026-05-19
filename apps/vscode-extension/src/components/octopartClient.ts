import * as vscode from 'vscode';
import { OCTOPART_SECRET_KEY } from '../constants';
import type { ComponentSearchResult } from '../types';
import { fetchWithTimeout } from './fetchWithTimeout';

export class OctopartClient {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async isConfigured(): Promise<boolean> {
    return Boolean((await this.getApiKey())?.trim());
  }

  async search(query: string): Promise<ComponentSearchResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Octopart/Nexar API key is not configured. Run "KiCad: Set Octopart/Nexar API Key".'
      );
    }

    const response = await fetchWithTimeout('https://api.nexar.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        query: `
          query Parts($q: String!) {
            supSearch(q: $q, limit: 10) {
              results {
                part {
                  mpn
                  shortDescription
                  manufacturer { name }
                  category { name }
                  bestDatasheet { url }
                  specs { attribute { name } displayValue }
                  sellers {
                    company { name }
                    offers {
                      inventoryLevel
                      prices {
                        quantity
                        price
                        currency
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { q: query }
      })
    });

    if (!response.ok) {
      throw new Error(`Octopart/Nexar search failed with ${response.status}.`);
    }

    const json = (await response.json()) as any;
    const results = json?.data?.supSearch?.results ?? [];
    return results
      .map((row: any) => row.part)
      .filter(Boolean)
      .map((part: any) => ({
        source: 'octopart',
        mpn: part.mpn ?? '',
        manufacturer: part.manufacturer?.name ?? '',
        description: part.shortDescription ?? '',
        category: part.category?.name ?? '',
        datasheetUrl: part.bestDatasheet?.url,
        offers: (part.sellers ?? []).flatMap((seller: any) =>
          (seller.offers ?? []).map((offer: any) => ({
            seller: seller.company?.name ?? 'Seller',
            inventoryLevel: offer.inventoryLevel,
            prices: (offer.prices ?? []).map((price: any) => ({
              quantity: Number(price.quantity ?? 0),
              price: Number(price.price ?? 0),
              currency: price.currency ?? 'USD'
            }))
          }))
        ),
        specs: (part.specs ?? []).map((spec: any) => ({
          name: spec.attribute?.name ?? '',
          value: spec.displayValue ?? ''
        }))
      }));
  }

  private async getApiKey(): Promise<string | undefined> {
    return (await this.secrets.get(OCTOPART_SECRET_KEY)) ?? undefined;
  }
}
