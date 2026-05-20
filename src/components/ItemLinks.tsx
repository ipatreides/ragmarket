import { dpUrl, marketUrl, openExternal, Server } from "../lib/links";

type Props = {
  itemID: number;
  itemName: string;
  server: Server;
};

export function ItemLinks({ itemID, itemName, server }: Props) {
  const dp = dpUrl(itemID);
  const mk = marketUrl(itemName, server);
  return (
    <span className="item-links">
      <a
        href={dp}
        className="ext-link small"
        onClick={(e) => {
          e.preventDefault();
          openExternal(dp);
        }}
        title="Abrir no Divine Pride"
      >
        DP
      </a>
      <span className="muted small">·</span>
      <a
        href={mk}
        className="ext-link small"
        onClick={(e) => {
          e.preventDefault();
          openExternal(mk);
        }}
        title="Buscar no Mercado (Catálogo de Vendas)"
      >
        Mercado
      </a>
    </span>
  );
}
