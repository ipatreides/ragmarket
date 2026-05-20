import { useMemo } from "react";
import { useFavorites } from "../hooks/useFavorites";
import { useItemNames } from "../hooks/useItemNames";
import { Server } from "../lib/links";
import { ItemLinks } from "./ItemLinks";
import { StarButton } from "./StarButton";

type Props = {
  server: Server;
};

export function FavoritesView({ server }: Props) {
  const fav = useFavorites();
  const ids = useMemo(() => Array.from(fav.favorites), [fav.favorites]);
  const names = useItemNames(ids);

  // Sort by name (case-insensitive) so the list stays stable as items are
  // starred/unstarred.
  const sorted = useMemo(() => {
    return ids.slice().sort((a, b) => {
      const na = (names.get(`item:${a}`) ?? `Item ${a}`).toLocaleLowerCase("pt-BR");
      const nb = (names.get(`item:${b}`) ?? `Item ${b}`).toLocaleLowerCase("pt-BR");
      return na.localeCompare(nb, "pt-BR");
    });
  }, [ids, names]);

  if (ids.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-content">
          <h3>Sem favoritos</h3>
          <p>
            Clique na estrela ao lado de um item — seja no <strong>Catálogo</strong>{" "}
            ou em <strong>Meus Itens</strong> — para favoritar.
          </p>
          <p className="muted">
            Favoritos ficam salvos entre sessões. Use esta aba como uma lista
            rápida de busca para os itens que te interessam.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="favorites-pane">
      <div className="results-header">
        <div className="results-header-left">
          <span>{ids.length} favoritos</span>
        </div>
      </div>
      <div className="results-scroll">
        <ul className="favorites-list">
          {sorted.map((id) => {
            const name = names.get(`item:${id}`) ?? `Item ${id}`;
            return (
              <li key={id} className="favorite-row">
                <StarButton on onClick={() => fav.toggle(id)} />
                <span className="favorite-name">
                  {name} <small className="muted">#{id}</small>
                </span>
                <ItemLinks itemID={id} itemName={name} server={server} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
