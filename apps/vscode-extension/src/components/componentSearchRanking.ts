import type { BomEntry, ComponentSearchResult } from '../types';
import type {
  ComponentSearchProjectContext,
  ComponentSearchRecommendation,
  ComponentSearchViewResult
} from './componentSearchView';

export interface ComponentSearchViewResultMessages {
  inStock(count: string): string;
  stockNotReported: string;
  noAvailabilityData: string;
  footprintNotReported: string;
  datasheetAvailable: string;
  datasheetNotProvided: string;
}

export interface ComponentSearchRankingMessages extends ComponentSearchViewResultMessages {
  recommendedFor(reference: string): string;
}

export interface ComponentSearchRankingOptions {
  locale: string;
  messages: ComponentSearchViewResultMessages;
}

export function buildComponentSearchViewResults(
  results: readonly ComponentSearchResult[],
  query: string,
  options: ComponentSearchRankingOptions
): ComponentSearchViewResult[] {
  return results.map((result) => ({
    result,
    availability: formatAvailability(result, options),
    footprintMatch: formatFootprintMatch(result, options.messages),
    datasheet: result.datasheetUrl
      ? options.messages.datasheetAvailable
      : options.messages.datasheetNotProvided,
    confidence: estimateConfidence(result, query)
  }));
}

export function buildComponentSearchRecommendation(
  entry: BomEntry,
  projectContext: ComponentSearchProjectContext,
  messages: Pick<ComponentSearchRankingMessages, 'recommendedFor'>
): ComponentSearchRecommendation | undefined {
  const footprint = compactFootprint(entry.footprint);
  const query =
    entry.mpn ||
    entry.lcsc ||
    [entry.value, footprint].filter(Boolean).join(' ');
  if (!query) {
    return undefined;
  }

  const reference = entry.references[0] ?? 'symbol';
  return {
    label: messages.recommendedFor(reference),
    query,
    detail: [projectContext.projectName, entry.value, footprint]
      .filter(Boolean)
      .join(' • ')
  };
}

function formatAvailability(
  result: ComponentSearchResult,
  options: ComponentSearchRankingOptions
): string {
  const totalInventory = result.offers.reduce(
    (total, offer) => total + (offer.inventoryLevel ?? 0),
    0
  );
  if (totalInventory > 0) {
    const count = new Intl.NumberFormat(options.locale).format(totalInventory);
    return options.messages.inStock(count);
  }
  return result.offers.length
    ? options.messages.stockNotReported
    : options.messages.noAvailabilityData;
}

function formatFootprintMatch(
  result: ComponentSearchResult,
  messages: ComponentSearchViewResultMessages
): string {
  const footprint = result.specs.find((spec) =>
    /footprint|package|case/iu.test(spec.name)
  );
  return footprint?.value || result.category || messages.footprintNotReported;
}

function estimateConfidence(
  result: ComponentSearchResult,
  query: string
): string {
  const normalizedQuery = query.trim().toLowerCase();
  const identifiers = [result.mpn, result.lcscPartNumber]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
  if (
    identifiers.some(
      (identifier) =>
        identifier === normalizedQuery ||
        identifier.includes(normalizedQuery) ||
        normalizedQuery.includes(identifier)
    )
  ) {
    return 'High';
  }
  if (result.source === 'local') {
    return 'High';
  }
  const searchable = [
    result.description,
    result.manufacturer,
    result.category,
    ...result.specs.map((spec) => `${spec.name} ${spec.value}`)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tokens = normalizedQuery
    .split(/\s+/u)
    .filter((token) => token.length > 2);
  const matchedTokens = tokens.filter((token) => searchable.includes(token));
  if (matchedTokens.length >= Math.max(1, Math.ceil(tokens.length / 2))) {
    return 'Medium';
  }
  return 'Low';
}

function compactFootprint(footprint: string): string {
  if (!footprint) {
    return '';
  }
  const separatorIndex = footprint.lastIndexOf(':');
  return separatorIndex >= 0 ? footprint.slice(separatorIndex + 1) : footprint;
}
