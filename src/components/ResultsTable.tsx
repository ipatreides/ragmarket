import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ShopRecord } from "../services/parser";
import { useCardNames, useItemNames } from "../hooks/useItemNames";
import { useFavorites } from "../hooks/useFavorites";
import { dpUrl, openExternal } from "../lib/links";
import { SortableTable } from "./SortableTable";
import { cardsColumn, optionsColumn, starColumn } from "./itemColumns";

const ch = createColumnHelper<ShopRecord>();

function DpLink({ id, children }: { id: number; children: React.ReactNode }) {
  const href = dpUrl(id);
  return (
    <a
      href={href}
      className="dp-link"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

export default function ResultsTable({ records }: { records: ShopRecord[] }) {
  const itemIds = useMemo(() => records.map((r) => r.itemID), [records]);
  const cardIds = useMemo(
    () => records.flatMap((r) => r.cards.filter((c) => c > 0)),
    [records],
  );

  const itemNames = useItemNames(itemIds);
  const cardNames = useCardNames(cardIds);
  const { isFavorite, toggle } = useFavorites();

  const columns = useMemo(
    () => [
      starColumn<ShopRecord>({ isFavorite, toggle }),
      ch.accessor("itemID", {
        header: "Item",
        cell: (info) => {
          const id = info.getValue();
          const name = itemNames.get(`item:${id}`) ?? `Item ${id}`;
          return (
            <span>
              <DpLink id={id}>{name}</DpLink>
              <small className="muted"> #{id}</small>
            </span>
          );
        },
      }),
      ch.accessor("refine", {
        header: "Ref",
        cell: (info) => `+${info.getValue()}`,
        sortingFn: "basic",
      }),
      ch.accessor("price", {
        header: "Preço",
        cell: (info) => info.getValue().toLocaleString("pt-BR"),
        sortingFn: "basic",
      }),
      cardsColumn<ShopRecord>(
        "cards",
        "Cartas / Encantos",
        (r) => r.cards,
        cardNames,
        (id, name) => <DpLink id={id}>{name}</DpLink>,
      ),
      optionsColumn<ShopRecord>("options", (r) => r.options, "Opções Aleatórias"),
      ch.accessor("shopName", {
        header: "Loja",
        cell: (info) => {
          const v = info.getValue();
          if (!v) return <span className="muted">(sem título)</span>;
          return v;
        },
      }),
    ],
    [itemNames, cardNames, isFavorite, toggle],
  );

  return (
    <SortableTable
      columns={columns}
      data={records}
      initialSort={[{ id: "price", desc: false }]}
    />
  );
}
