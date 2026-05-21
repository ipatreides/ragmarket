import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMarketExtremes } from "../lib/invoke";
import type { Server } from "../lib/links";
import { runPool } from "../lib/runPool";
import { evaluateWatcher } from "../lib/notify/evaluator";
import { sendNtfyPush } from "../lib/notify/ntfy";
import { sendWindowsNotification } from "../lib/notify/winNotify";
import { getItem } from "../services/divinePride";
import type { NotifyConfig } from "./useNotifyConfig";
import type { WatcherEntry, WatchersMap } from "./useWatchers";

type Params = {
  server: Server;
  favorites: Set<number>;
  watchers: WatchersMap;
  notifyConfig: NotifyConfig;
  setWatcher: (id: number, patch: Partial<WatcherEntry>) => void;
  hasEnabledWatchers: boolean;
};

type Status = {
  lastRun: number | null;
  running: boolean;
};

export function useWatcherScheduler({
  server,
  favorites,
  watchers,
  notifyConfig,
  setWatcher,
  hasEnabledWatchers,
}: Params) {
  const [status, setStatus] = useState<Status>({ lastRun: null, running: false });

  // Capture deps in refs so the interval callback always sees the
  // latest values without us having to recreate the interval on every
  // favorites/watchers change.
  const depsRef = useRef({ server, favorites, watchers, notifyConfig, setWatcher });
  depsRef.current = { server, favorites, watchers, notifyConfig, setWatcher };

  const runOnce = useCallback(async () => {
    const { server, favorites, watchers, notifyConfig, setWatcher } = depsRef.current;
    const anyChannel = notifyConfig.ntfyEnabled || notifyConfig.winEnabled;
    if (!anyChannel) return;

    const targets = Object.entries(watchers)
      .map(([k, w]) => ({ id: Number(k), w }))
      .filter(({ id, w }) => w.enabled && favorites.has(id));

    if (targets.length === 0) return;

    setStatus((s) => ({ ...s, running: true }));

    const tasks = targets.map(({ id, w }) => async () => {
      let name = `Item ${id}`;
      try {
        const item = await getItem(id);
        if (item?.name) name = item.name;
      } catch {
        // fall through with the placeholder name
      }
      let min: number | null;
      try {
        const res = await fetchMarketExtremes(id, name, server);
        min = res.min;
      } catch (e) {
        console.warn("[watcher] fetch failed for", id, e);
        return;
      }
      const { fire, patch } = evaluateWatcher(w, min);
      if (patch) setWatcher(id, patch);
      if (fire && min !== null) {
        const title = `Preço baixou: ${name}`;
        const body = `Mín ${min.toLocaleString("pt-BR")} z — alvo ${w.targetPrice.toLocaleString("pt-BR")} z`;
        if (notifyConfig.ntfyEnabled && notifyConfig.ntfyTopic.trim()) {
          void sendNtfyPush(notifyConfig.ntfyTopic, {
            title,
            body,
            priority: "high",
            tags: ["moneybag"],
          });
        }
        if (notifyConfig.winEnabled) {
          void sendWindowsNotification(title, body);
        }
      }
    });

    await runPool(tasks, 4);
    setStatus({ lastRun: Date.now(), running: false });
  }, []);

  // Interval driver. Skipped entirely when there's nothing to do —
  // no channel enabled or no enabled watchers — so an unconfigured
  // app burns zero timers.
  const anyChannel = notifyConfig.ntfyEnabled || notifyConfig.winEnabled;
  useEffect(() => {
    if (!anyChannel || !hasEnabledWatchers) return;
    const intervalMs = Math.max(30, notifyConfig.intervalSec) * 1000;
    const id = window.setInterval(() => {
      void runOnce();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [anyChannel, hasEnabledWatchers, notifyConfig.intervalSec, runOnce]);

  return { runOnce, status };
}
