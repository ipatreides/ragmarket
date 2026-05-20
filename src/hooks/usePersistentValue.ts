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
export function usePersistentValue<T>({
  key,
  defaultValue,
  parse,
  serialize,
}: Options<T>): [T, (v: T) => void] {
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

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, serialize(next));
      } catch {
        // Quota / unavailable — non-critical for this app.
      }
      window.dispatchEvent(new Event(changeEvent));
    },
    [key, changeEvent, serialize],
  );

  return [value, update];
}
