import { useCallback, useEffect, useState } from "react";

type Options<T> = {
  /** localStorage key. */
  key: string;
  /** Fallback when storage is empty/invalid. */
  defaultValue: T;
  /** Parse from JSON-shaped value (typically `JSON.parse`'d already). */
  parse: (raw: unknown) => T | null;
  /** Serialize to a string for localStorage. */
  serialize: (value: T) => string;
};

/**
 * React state that survives reloads. Syncs across windows via the native
 * `storage` event AND across components in the same window via a custom
 * event (the browser only fires `storage` in OTHER windows, so we'd
 * otherwise miss intra-window writes).
 */
type Updater<T> = T | ((prev: T) => T);

export function usePersistentValue<T>({
  key,
  defaultValue,
  parse,
  serialize,
}: Options<T>): [T, (next: Updater<T>) => void] {
  const changeEvent = `ragmarket:persistent-changed:${key}`;

  const load = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed = parse(JSON.parse(raw));
      return parsed ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue, parse]);

  const [value, setValue] = useState<T>(load);

  useEffect(() => {
    const refresh = () => setValue(load());
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(changeEvent, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(changeEvent, refresh);
    };
  }, [key, changeEvent, load]);

  // Accepts a value OR an updater (React-style). Updater form is the
  // only way to safely apply multiple writes that resolve in parallel
  // (e.g. a Promise.all of scheduler tasks each patching one entry of
  // a shared map) — value form reads from the captured closure and
  // silently drops concurrent writes. If the updater returns the same
  // reference, skip the write so consumers don't re-render.
  const update = useCallback(
    (next: Updater<T>) => {
      setValue((prev) => {
        const computed =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (Object.is(computed, prev)) return prev;
        try {
          localStorage.setItem(key, serialize(computed));
        } catch {
          // Quota / unavailable — non-critical for this app.
        }
        window.dispatchEvent(new Event(changeEvent));
        return computed;
      });
    },
    [key, changeEvent, serialize],
  );

  return [value, update];
}
