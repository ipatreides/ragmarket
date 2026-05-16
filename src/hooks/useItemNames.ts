import { useEffect, useState } from "react";
import { getCard, getItem } from "../services/divinePride";

type NameCache = Map<string, string>;

export function useItemNames(ids: number[]): NameCache {
  return useNames("item", ids);
}

export function useCardNames(ids: number[]): NameCache {
  return useNames("card", ids);
}

function useNames(kind: "item" | "card", ids: number[]): NameCache {
  const [cache, setCache] = useState<NameCache>(new Map());

  useEffect(() => {
    let cancelled = false;
    const unique = Array.from(new Set(ids.filter((id) => id > 0)));
    const missing = unique.filter((id) => !cache.has(`${kind}:${id}`));
    if (missing.length === 0) return;

    const lookup = kind === "item" ? getItem : getCard;

    (async () => {
      // Chunk concurrent requests to avoid hammering the API.
      const concurrency = 6;
      for (let i = 0; i < missing.length; i += concurrency) {
        const batch = missing.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (id) => [id, await lookup(id)] as const),
        );
        if (cancelled) return;
        setCache((prev) => {
          const next = new Map(prev);
          for (const [id, item] of results) {
            next.set(`${kind}:${id}`, item?.name ?? `${kind} ${id}`);
          }
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return cache;
}
