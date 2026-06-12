import { useEffect, useMemo, useState } from "react";
import { fetchMarketListings, type MarketListingsResult } from "../lib/invoke";
import { buildPriceLevels, summarizeLevels } from "../lib/marketDepth";
import type { Server } from "../lib/links";
import { Modal } from "./Modal";

type Props = {
  itemId: number;
  itemName: string;
  server: Server;
  onClose: () => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: MarketListingsResult };

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function PriceDistributionModal({ itemId, itemName, server, onClose }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // The invoke can't be cancelled; the `alive` flag discards a response
  // that lands after close (the parent unmounts us) or after a retry.
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchMarketListings(itemId, itemName, server)
      .then((data) => {
        if (alive) setState({ status: "ready", data });
      })
      .catch((e) => {
        if (alive) setState({ status: "error", message: String(e) });
      });
    return () => {
      alive = false;
    };
  }, [itemId, itemName, server, attempt]);

  const listings = state.status === "ready" ? state.data.listings : null;
  const levels = useMemo(
    () => (listings ? buildPriceLevels(listings) : []),
    [listings],
  );
  const summary = summarizeLevels(levels);

  const barWidth = (units: number): string => {
    if (!summary || summary.maxLevelUnits === 0) return "2%";
    return `${Math.max(2, (units / summary.maxLevelUnits) * 100)}%`;
  };

  return (
    <Modal title={`Distribuição — ${itemName}`} onClose={onClose}>
      <div className="modal-section depth-content">
        {state.status === "loading" && (
          <p className="muted">Buscando anúncios no Mercado…</p>
        )}

        {state.status === "error" && (
          <>
            <p className="muted">Erro ao buscar anúncios: {state.message}</p>
            <div>
              <button type="button" onClick={() => setAttempt((a) => a + 1)}>
                Tentar novamente
              </button>
            </div>
          </>
        )}

        {state.status === "ready" && !summary && (
          <>
            <p className="muted">
              Nenhum anúncio encontrado no Mercado para este item.
            </p>
            {/^Item \d+$/.test(itemName) && (
              <p className="muted">
                O nome deste item é desconhecido — a busca usa o nome, então
                pode não encontrar anúncios.
              </p>
            )}
          </>
        )}

        {state.status === "ready" && summary && (
          <>
            <div className="depth-summary">
              <div className="depth-stat">
                <span className="depth-stat__label">mínimo</span>
                <span className="depth-stat__value">{fmt(summary.min)} z</span>
              </div>
              <div className="depth-stat">
                <span className="depth-stat__label">mediana (por un.)</span>
                <span className="depth-stat__value">
                  {fmt(summary.weightedMedian)} z
                </span>
              </div>
              <div className="depth-stat">
                <span className="depth-stat__label">unidades</span>
                <span className="depth-stat__value">{fmt(summary.totalUnits)}</span>
              </div>
              <div className="depth-stat">
                <span className="depth-stat__label">anúncios</span>
                <span className="depth-stat__value">
                  {fmt(summary.totalListings)}
                </span>
              </div>
            </div>
            <div className="depth-list">
              {levels.map((lv) => (
                <div className="depth-row" key={lv.price}>
                  <span className="depth-row__price">{fmt(lv.price)} z</span>
                  <div
                    className="depth-bar"
                    title={`${fmt(lv.units)} un. a ${fmt(lv.price)} z`}
                  >
                    <div
                      className="depth-bar__fill"
                      style={{ width: barWidth(lv.units) }}
                    />
                  </div>
                  <span className="depth-row__meta">
                    {fmt(lv.units)} un. ·{" "}
                    {lv.listings === 1 ? "1 anúncio" : `${lv.listings} anúncios`}
                  </span>
                  <span
                    className="depth-row__cum"
                    title="Unidades acumuladas até este preço"
                  >
                    acum. {fmt(lv.cumulativeUnits)}
                  </span>
                </div>
              ))}
            </div>
            {state.data.truncated && (
              <p className="depth-note">
                Mostrando apenas os anúncios mais baratos (
                {fmt(summary.totalListings)}) — podem existir mais com preços
                maiores.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
