import { useCallback, useMemo } from "react";
import { usePersistentValue } from "./usePersistentValue";

export type WatcherEntry = {
  enabled: boolean;
  targetPrice: number;
  lastAlertedPrice: number | null;
};

export type WatchersMap = Record<number, WatcherEntry>;

const EMPTY: WatchersMap = {};

const DEFAULT_ENTRY: WatcherEntry = {
  enabled: false,
  targetPrice: 0,
  lastAlertedPrice: null,
};

function parse(raw: unknown): WatchersMap | null {
  if (!raw || typeof raw !== "object") return null;
  const out: WatchersMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const enabled = typeof r.enabled === "boolean" ? r.enabled : false;
    const targetPrice =
      typeof r.targetPrice === "number" && Number.isFinite(r.targetPrice) && r.targetPrice >= 0
        ? r.targetPrice
        : 0;
    const lastAlertedPrice =
      typeof r.lastAlertedPrice === "number" && Number.isFinite(r.lastAlertedPrice)
        ? r.lastAlertedPrice
        : null;
    out[id] = { enabled, targetPrice, lastAlertedPrice };
  }
  return out;
}

function entryEquals(a: WatcherEntry, b: WatcherEntry): boolean {
  return (
    a.enabled === b.enabled &&
    a.targetPrice === b.targetPrice &&
    a.lastAlertedPrice === b.lastAlertedPrice
  );
}

export function useWatchers() {
  const [watchers, setWatchers] = usePersistentValue<WatchersMap>({
    key: "ragmarket.watchers",
    defaultValue: EMPTY,
    parse,
    serialize: (v) => JSON.stringify(v),
  });

  // Functional updaters everywhere so parallel callers (e.g. scheduler
  // tasks running through runPool) compose instead of clobbering each
  // other's writes through a stale closure.
  const setWatcher = useCallback(
    (id: number, patch: Partial<WatcherEntry>) => {
      if (!Number.isInteger(id) || id <= 0) return;
      setWatchers((prev) => {
        const current = prev[id] ?? DEFAULT_ENTRY;
        const next: WatcherEntry = { ...current, ...patch };
        // If the user changes the target price, drop the dedup marker
        // so the next dip below the new target alerts even if we
        // already alerted under the old target.
        if (
          patch.targetPrice !== undefined &&
          patch.targetPrice !== current.targetPrice &&
          patch.lastAlertedPrice === undefined
        ) {
          next.lastAlertedPrice = null;
        }
        if (id in prev && entryEquals(prev[id], next)) return prev;
        return { ...prev, [id]: next };
      });
    },
    [setWatchers],
  );

  const removeWatcher = useCallback(
    (id: number) => {
      setWatchers((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [setWatchers],
  );

  const get = useCallback((id: number) => watchers[id] ?? null, [watchers]);

  const { enabledCount, hasEnabledWatchers } = useMemo(() => {
    let n = 0;
    for (const w of Object.values(watchers)) if (w.enabled) n++;
    return { enabledCount: n, hasEnabledWatchers: n > 0 };
  }, [watchers]);

  return { watchers, setWatcher, removeWatcher, get, hasEnabledWatchers, enabledCount };
}
