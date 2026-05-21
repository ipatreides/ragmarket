// Pure trigger logic for a single watcher poll. Mirrors notifymarket
// (https://github.com/adsonpleal/notifymarket) watch.py: alert when
// `min <= target_price` AND `min` is strictly lower than the last
// alerted price (or no prior alert). Reset the dedup state when the
// market climbs back above the target. Keeps the scheduler hook a
// thin wrapper around setInterval + this function — easy to unit
// test.

import type { WatcherEntry } from "../../hooks/useWatchers";

export type EvalResult = {
  /** Fire a notification this tick. */
  fire: boolean;
  /** Patch to merge into the watcher's persisted entry (only
   *  `lastAlertedPrice` is ever changed). `null` means leave the
   *  entry untouched. */
  patch: Partial<WatcherEntry> | null;
};

export function evaluateWatcher(
  watcher: WatcherEntry,
  min: number | null,
): EvalResult {
  if (min === null) return { fire: false, patch: null };

  if (min <= watcher.targetPrice) {
    const isLower =
      watcher.lastAlertedPrice === null || min < watcher.lastAlertedPrice;
    if (isLower) {
      return { fire: true, patch: { lastAlertedPrice: min } };
    }
    return { fire: false, patch: null };
  }

  // Above target — reset dedup so the next dip re-alerts.
  if (watcher.lastAlertedPrice !== null) {
    return { fire: false, patch: { lastAlertedPrice: null } };
  }
  return { fire: false, patch: null };
}
