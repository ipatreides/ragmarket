import { useCallback } from "react";
import { usePersistentValue } from "./usePersistentValue";

export type NotifyConfig = {
  ntfyEnabled: boolean;
  ntfyTopic: string;
  winEnabled: boolean;
  intervalSec: number;
};

const DEFAULT: NotifyConfig = {
  ntfyEnabled: false,
  ntfyTopic: "",
  winEnabled: false,
  intervalSec: 300,
};

const MIN_INTERVAL = 30;
const MAX_INTERVAL = 3600;

const clampInterval = (n: number) =>
  Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.floor(n)));

function parse(raw: unknown): NotifyConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ntfyEnabled = typeof r.ntfyEnabled === "boolean" ? r.ntfyEnabled : DEFAULT.ntfyEnabled;
  const ntfyTopic = typeof r.ntfyTopic === "string" ? r.ntfyTopic : DEFAULT.ntfyTopic;
  const winEnabled = typeof r.winEnabled === "boolean" ? r.winEnabled : DEFAULT.winEnabled;
  const intervalRaw = typeof r.intervalSec === "number" && Number.isFinite(r.intervalSec)
    ? r.intervalSec
    : DEFAULT.intervalSec;
  return { ntfyEnabled, ntfyTopic, winEnabled, intervalSec: clampInterval(intervalRaw) };
}

export function useNotifyConfig() {
  const [config, setConfig] = usePersistentValue<NotifyConfig>({
    key: "ragmarket.notify.config",
    defaultValue: DEFAULT,
    parse,
    serialize: (v) => JSON.stringify(v),
  });

  const update = useCallback(
    (patch: Partial<NotifyConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        if (patch.intervalSec !== undefined) {
          next.intervalSec = clampInterval(patch.intervalSec);
        }
        return next;
      });
    },
    [setConfig],
  );

  return { config, update };
}

export const NOTIFY_INTERVAL_BOUNDS = { min: MIN_INTERVAL, max: MAX_INTERVAL };
