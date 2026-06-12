import type { MarketListing } from "./invoke";

export type PriceLevel = {
  price: number;
  // Total units for sale at exactly this price.
  units: number;
  // Number of listings (anúncios) at this price.
  listings: number;
  // Units at this price or below — "if I price mine here, this many units
  // are queued ahead of or alongside me".
  cumulativeUnits: number;
};

export type DepthSummary = {
  min: number;
  // Quantity-weighted median: the cheapest price at which at least half of
  // all units are at that price or below. A plain median over price levels
  // would be misleading when one level holds most of the stock.
  weightedMedian: number;
  totalUnits: number;
  totalListings: number;
  // Largest `units` across levels, for scaling bars.
  maxLevelUnits: number;
};

// Groups listings by exact price, ascending. Exact grouping (not bucketing)
// keeps 1z undercuts visible — they matter when picking a price.
export function buildPriceLevels(listings: MarketListing[]): PriceLevel[] {
  const sorted = [...listings].sort((a, b) => a.price - b.price);
  const levels: PriceLevel[] = [];
  let cumulative = 0;
  for (const l of sorted) {
    cumulative += l.amount;
    const last = levels[levels.length - 1];
    if (last && last.price === l.price) {
      last.units += l.amount;
      last.listings += 1;
      last.cumulativeUnits = cumulative;
    } else {
      levels.push({
        price: l.price,
        units: l.amount,
        listings: 1,
        cumulativeUnits: cumulative,
      });
    }
  }
  return levels;
}

export function summarizeLevels(levels: PriceLevel[]): DepthSummary | null {
  if (levels.length === 0) return null;
  const totalUnits = levels[levels.length - 1].cumulativeUnits;
  let totalListings = 0;
  let maxLevelUnits = 0;
  for (const lv of levels) {
    totalListings += lv.listings;
    if (lv.units > maxLevelUnits) maxLevelUnits = lv.units;
  }
  let weightedMedian = levels[0].price;
  if (totalUnits > 0) {
    for (const lv of levels) {
      if (lv.cumulativeUnits >= totalUnits / 2) {
        weightedMedian = lv.price;
        break;
      }
    }
  }
  return {
    min: levels[0].price,
    weightedMedian,
    totalUnits,
    totalListings,
    maxLevelUnits,
  };
}
