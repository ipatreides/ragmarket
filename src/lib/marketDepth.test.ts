import { describe, expect, it } from "vitest";
import { buildPriceLevels, summarizeLevels } from "./marketDepth";

describe("buildPriceLevels", () => {
  it("returns no levels for no listings", () => {
    expect(buildPriceLevels([])).toEqual([]);
  });

  it("groups listings at the same exact price into one level", () => {
    const levels = buildPriceLevels([
      { price: 9999, amount: 5 },
      { price: 9999, amount: 3 },
      { price: 10000, amount: 1 },
    ]);
    expect(levels).toEqual([
      { price: 9999, units: 8, listings: 2, cumulativeUnits: 8 },
      { price: 10000, units: 1, listings: 1, cumulativeUnits: 9 },
    ]);
  });

  it("sorts unsorted input ascending without mutating it", () => {
    const input = [
      { price: 300, amount: 1 },
      { price: 100, amount: 2 },
      { price: 200, amount: 4 },
    ];
    const levels = buildPriceLevels(input);
    expect(levels.map((l) => l.price)).toEqual([100, 200, 300]);
    expect(input[0].price).toBe(300);
  });

  it("accumulates units monotonically up to the total", () => {
    const levels = buildPriceLevels([
      { price: 1, amount: 2 },
      { price: 2, amount: 5 },
      { price: 3, amount: 1 },
    ]);
    expect(levels.map((l) => l.cumulativeUnits)).toEqual([2, 7, 8]);
  });
});

describe("summarizeLevels", () => {
  it("returns null when there are no levels", () => {
    expect(summarizeLevels([])).toBeNull();
  });

  it("computes totals, max level and quantity-weighted median", () => {
    // 1 unit at 100, 99 units at 200: half the stock sits at 200,
    // so the weighted median must be 200 — not the midpoint of prices.
    const summary = summarizeLevels(
      buildPriceLevels([
        { price: 100, amount: 1 },
        { price: 200, amount: 99 },
      ]),
    );
    expect(summary).toEqual({
      min: 100,
      weightedMedian: 200,
      totalUnits: 100,
      totalListings: 2,
      maxLevelUnits: 99,
    });
  });

  it("equals min for a single listing", () => {
    const summary = summarizeLevels(buildPriceLevels([{ price: 50, amount: 1 }]));
    expect(summary?.weightedMedian).toBe(50);
    expect(summary?.min).toBe(50);
  });

  it("falls back to min when total units is zero", () => {
    const summary = summarizeLevels(buildPriceLevels([{ price: 7, amount: 0 }]));
    expect(summary?.weightedMedian).toBe(7);
    expect(summary?.totalUnits).toBe(0);
  });
});
