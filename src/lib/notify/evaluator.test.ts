import { describe, expect, it } from "vitest";
import { evaluateWatcher } from "./evaluator";
import type { WatcherEntry } from "../../hooks/useWatchers";

function w(over: Partial<WatcherEntry> = {}): WatcherEntry {
  return {
    enabled: true,
    targetPrice: 1000,
    lastAlertedPrice: null,
    ...over,
  };
}

describe("evaluateWatcher", () => {
  it("does nothing when min is null", () => {
    expect(evaluateWatcher(w(), null)).toEqual({ fire: false, patch: null });
  });

  it("fires the first time min <= target with no prior alert", () => {
    const r = evaluateWatcher(w(), 900);
    expect(r.fire).toBe(true);
    expect(r.patch).toEqual({ lastAlertedPrice: 900 });
  });

  it("fires when min equals target with no prior alert", () => {
    const r = evaluateWatcher(w(), 1000);
    expect(r.fire).toBe(true);
    expect(r.patch).toEqual({ lastAlertedPrice: 1000 });
  });

  it("does not fire when min equals the last alerted price", () => {
    const r = evaluateWatcher(w({ lastAlertedPrice: 900 }), 900);
    expect(r).toEqual({ fire: false, patch: null });
  });

  it("does not fire when min is higher than last alerted (but still <= target)", () => {
    const r = evaluateWatcher(w({ lastAlertedPrice: 800 }), 900);
    expect(r).toEqual({ fire: false, patch: null });
  });

  it("re-fires when min is strictly lower than the last alerted price", () => {
    const r = evaluateWatcher(w({ lastAlertedPrice: 900 }), 850);
    expect(r.fire).toBe(true);
    expect(r.patch).toEqual({ lastAlertedPrice: 850 });
  });

  it("resets the dedup marker when min climbs above target", () => {
    const r = evaluateWatcher(w({ lastAlertedPrice: 900 }), 1500);
    expect(r.fire).toBe(false);
    expect(r.patch).toEqual({ lastAlertedPrice: null });
  });

  it("leaves the marker alone when min is above target and there was no prior alert", () => {
    const r = evaluateWatcher(w(), 1500);
    expect(r).toEqual({ fire: false, patch: null });
  });

  it("supports a full cycle: alert, dedup, lower-alert, reset, re-alert", () => {
    let entry = w();
    // Tick 1: 900 — alert.
    let r = evaluateWatcher(entry, 900);
    expect(r.fire).toBe(true);
    entry = { ...entry, ...r.patch };
    // Tick 2: 900 — dedup.
    r = evaluateWatcher(entry, 900);
    expect(r.fire).toBe(false);
    expect(r.patch).toBeNull();
    // Tick 3: 850 — re-alert.
    r = evaluateWatcher(entry, 850);
    expect(r.fire).toBe(true);
    entry = { ...entry, ...r.patch };
    // Tick 4: 1500 — reset.
    r = evaluateWatcher(entry, 1500);
    expect(r.fire).toBe(false);
    expect(r.patch).toEqual({ lastAlertedPrice: null });
    entry = { ...entry, ...r.patch };
    // Tick 5: 800 — alerts again because dedup was reset.
    r = evaluateWatcher(entry, 800);
    expect(r.fire).toBe(true);
    expect(r.patch).toEqual({ lastAlertedPrice: 800 });
  });
});
