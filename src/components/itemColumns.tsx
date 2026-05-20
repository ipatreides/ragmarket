import { createColumnHelper, DisplayColumnDef } from "@tanstack/react-table";
import { DecodedOption } from "../services/randomOptions";
import { StarButton } from "./StarButton";

type WithItemID = { itemID: number };

type FavoriteToggle = {
  isFavorite: (id: number) => boolean;
  toggle: (id: number) => void;
};

/** ⭐ toggle as a leading column. */
export function starColumn<T extends WithItemID>(
  fav: FavoriteToggle,
): DisplayColumnDef<T, unknown> {
  const ch = createColumnHelper<T>();
  return ch.display({
    id: "star",
    header: "",
    cell: (info) => {
      const id = info.row.original.itemID;
      return <StarButton on={fav.isFavorite(id)} onClick={() => fav.toggle(id)} />;
    },
  });
}

/** Random-option list column. Same renderer for catalog + Meus Itens. */
export function optionsColumn<T>(
  id: string,
  getOptions: (r: T) => DecodedOption[],
  header: string,
) {
  const ch = createColumnHelper<T>();
  return ch.accessor(getOptions, {
    id,
    header,
    cell: (info) => {
      const opts = info.getValue() as DecodedOption[];
      if (opts.length === 0) return <span className="muted">—</span>;
      return (
        <ul className="opt-list">
          {opts.map((o, i) => (
            <li key={i}>{o.text}</li>
          ))}
        </ul>
      );
    },
    enableSorting: false,
  });
}

/**
 * Cards / encants list column. Renders nothing for empty slots; the
 * caller decides whether each card name is plain text or a link via
 * `renderCard`.
 */
export function cardsColumn<T>(
  id: string,
  header: string,
  getCards: (r: T) => number[],
  cardNames: Map<string, string>,
  renderCard: (id: number, name: string) => React.ReactNode,
) {
  const ch = createColumnHelper<T>();
  return ch.accessor((r: T) => getCards(r).filter((c) => c > 0), {
    id,
    header,
    cell: (info) => {
      const cs = info.getValue() as number[];
      if (cs.length === 0) return <span className="muted">—</span>;
      return (
        <span>
          {cs.map((c, i) => {
            const name = cardNames.get(`card:${c}`) ?? `Carta ${c}`;
            return (
              <span key={`${c}-${i}`}>
                {i > 0 && ", "}
                {renderCard(c, name)}
              </span>
            );
          })}
        </span>
      );
    },
    enableSorting: false,
  });
}
