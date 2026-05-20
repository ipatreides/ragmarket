import { useCallback } from "react";
import { usePersistentValue } from "./usePersistentValue";

const EMPTY: number[] = [];

export function useFavorites() {
  const [list, setList] = usePersistentValue<number[]>({
    key: "ragmarket.favorites",
    defaultValue: EMPTY,
    parse: (raw) =>
      Array.isArray(raw)
        ? raw.filter((x): x is number => typeof x === "number" && x > 0)
        : null,
    serialize: (v) => JSON.stringify(v),
  });

  const favorites = new Set(list);

  const toggle = useCallback(
    (id: number) => {
      if (!Number.isFinite(id) || id <= 0) return;
      const next = new Set(list);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setList(Array.from(next));
    },
    [list, setList],
  );

  const isFavorite = useCallback((id: number) => favorites.has(id), [favorites]);

  return { favorites, toggle, isFavorite };
}
