import { useCallback, useEffect, useMemo, useState } from "react";
import { CaptureStatus, useCapture } from "./hooks/useCapture";
import { useDiscoveredClients } from "./hooks/useDiscoveredClients";
import { useLatestRelease } from "./hooks/useLatestRelease";
import { useFavorites } from "./hooks/useFavorites";
import { useServerPref } from "./hooks/useServerPref";
import FilterSidebar, { EMPTY_FILTERS, Filters } from "./components/FilterSidebar";
import ResultsTable from "./components/ResultsTable";
import { UpdateBanner } from "./components/UpdateBanner";
import { ClientPicker } from "./components/ClientPicker";
import { MainTab, MainTabs } from "./components/MainTabs";
import { MyItemsView } from "./components/MyItemsView";
import { FavoritesView } from "./components/FavoritesView";
import { ServerPicker } from "./components/ServerPicker";
import { setClientSelection } from "./lib/invoke";
import { openExternal } from "./lib/links";
import { ALL_INV_TYPES } from "./services/inventoryParser";

const STATUS_LABELS: Record<string, string> = {
  idle: "ocioso",
  recording: "gravando",
  stopped: "parado",
};

export default function App() {
  const cap = useCapture();
  const update = useLatestRelease();
  const fav = useFavorites();
  const { server, setServer } = useServerPref();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [tab, setTab] = useState<MainTab>("search");

  useEffect(() => {
    if (cap.status === "idle") {
      setFilters(EMPTY_FILTERS);
      setTab("search");
    }
  }, [cap.status]);

  const handleStart = useCallback(async () => {
    // Lock in the PID filter before capture starts so the very first
    // packets are gated correctly.
    await setClientSelection(selectedPid);
    await cap.start();
  }, [cap, selectedPid]);

  const filtered = useMemo(() => {
    return cap.records.filter((r) => {
      if (r.refine < filters.refineMin || r.refine > filters.refineMax)
        return false;
      if (filters.selectedItems.size > 0 && !filters.selectedItems.has(r.itemID))
        return false;
      if (filters.selectedCards.size > 0) {
        for (const selected of filters.selectedCards) {
          if (!r.cards.includes(selected)) return false;
        }
      }
      if (filters.selectedOptions.size > 0) {
        for (const [idx, range] of filters.selectedOptions) {
          const opt = r.options.find((o) => o.index === idx);
          if (!opt) return false;
          if (opt.value < range.min || opt.value > range.max) return false;
        }
      }
      return true;
    });
  }, [cap.records, filters]);

  const mineCount = useMemo(() => {
    let n = 0;
    for (const t of ALL_INV_TYPES) n += cap.inventory[t].length;
    return n;
  }, [cap.inventory]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Ragmarket</h1>
          <p className="subtitle">Visualizador do Catálogo de Vendas</p>
        </div>
        <div className="app-header-right">
          <ServerPicker value={server} onChange={setServer} />
          <div className="status-pill">{STATUS_LABELS[cap.status] ?? cap.status}</div>
        </div>
      </header>

      <main className="app-main">
        {update.available && (
          <UpdateBanner release={update.available} onDismiss={update.dismiss} />
        )}
        {cap.error && <div className="error-banner">⚠ {cap.error}</div>}

        {cap.status === "idle" ? (
          <IdleScreen
            interfaces={cap.interfaces}
            selectedIp={cap.selectedIp}
            onSelectInterface={cap.setSelectedIp}
            onStart={handleStart}
            onRefreshInterfaces={cap.refreshInterfaces}
            selectedPid={selectedPid}
            onSelectPid={setSelectedPid}
          />
        ) : (
          <>
            <div className="tab-bar">
              <MainTabs
                active={tab}
                onChange={setTab}
                counts={{
                  search: cap.records.length,
                  mine: mineCount,
                  favorites: fav.favorites.size,
                }}
              />
              <SessionActions
                status={cap.status}
                stats={cap.stats}
                pageCount={cap.pageCount}
                hasData={cap.records.length > 0 || mineCount > 0}
                onStop={cap.stop}
                onClear={() => {
                  cap.clearRecords();
                  setFilters(EMPTY_FILTERS);
                }}
                onReset={cap.reset}
              />
            </div>
            {tab === "search" && (
              <FilterScreen
                allRecords={cap.records}
                filtered={filtered}
                filters={filters}
                onFiltersChange={setFilters}
              />
            )}
            {tab === "mine" && (
              <MyItemsView inventory={cap.inventory} server={server} />
            )}
            {tab === "favorites" && <FavoritesView server={server} />}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="ext-link"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

function Footer() {
  return (
    <footer className="app-footer">
      <p>
        Veja também:{" "}
        <ExtLink href="https://ragcalc.web.app/">RagCalc</ExtLink>
        {" — calculadora de status · "}
        <ExtLink href="https://ragnarecap.web.app/">RagnaRecap</ExtLink>
        {" — análise de replays de Ragnarok Online."}
      </p>
      <p>
        Projeto open source. Sugestões e bugs no{" "}
        <ExtLink href="https://github.com/adsonpleal/ragmarket">GitHub</ExtLink>.
      </p>
    </footer>
  );
}

function IdleScreen(props: {
  interfaces: ReturnType<typeof useCapture>["interfaces"];
  selectedIp: string | null;
  onSelectInterface: (ip: string) => void;
  onStart: () => void;
  onRefreshInterfaces: () => void;
  selectedPid: number | null;
  onSelectPid: (pid: number | null) => void;
}) {
  const { clients, refresh: refreshClients } = useDiscoveredClients();
  const { selectedPid, onSelectPid } = props;

  // If the chosen client disappears between refreshes, drop the
  // selection so the user isn't silently filtering on a stale PID.
  useEffect(() => {
    if (selectedPid !== null && !clients.some((c) => c.pid === selectedPid)) {
      onSelectPid(null);
    }
  }, [clients, selectedPid, onSelectPid]);

  return (
    <div className="screen idle">
      <h2>Pronto para gravar</h2>

      <div className="idle-section">
        <label className="idle-label">Interface de rede</label>
        <div className="nic-picker">
          <select
            value={props.selectedIp ?? ""}
            onChange={(e) => props.onSelectInterface(e.target.value)}
          >
            <option value="" disabled>
              Selecione uma interface de rede…
            </option>
            {props.interfaces.map((i) => (
              <option key={i.index} value={i.ipv4}>
                {i.name} — {i.ipv4}
                {i.is_loopback ? " (loopback)" : ""}
              </option>
            ))}
          </select>
          <button onClick={props.onRefreshInterfaces} title="Atualizar">
            ⟳
          </button>
        </div>
      </div>

      <div className="idle-section">
        <div className="idle-label-row">
          <label className="idle-label">Cliente (opcional)</label>
          <button
            type="button"
            className="link-button"
            onClick={refreshClients}
            title="Atualizar lista de clientes"
          >
            ⟳ atualizar
          </button>
        </div>
        <ClientPicker
          clients={clients}
          selectedPid={selectedPid}
          onSelect={onSelectPid}
          emptyMessage="Nenhum Ragexe conectado às portas do servidor. Deixe em branco para capturar tudo."
        />
        {selectedPid !== null && (
          <button
            type="button"
            className="link-button"
            onClick={() => onSelectPid(null)}
          >
            Seguir todos (limpar seleção)
          </button>
        )}
      </div>

      <button
        className="primary"
        onClick={props.onStart}
        disabled={!props.selectedIp}
      >
        Iniciar Gravação
      </button>
      <p className="muted small">
        O Ragmarket precisa rodar como Administrador para acessar a rede. Se
        não foi iniciado com privilégios elevados, a gravação falhará com
        erro de permissão.
      </p>
    </div>
  );
}

function FilterScreen(props: {
  allRecords: ReturnType<typeof useCapture>["records"];
  filtered: ReturnType<typeof useCapture>["records"];
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
}) {
  const hasRecords = props.allRecords.length > 0;

  return (
    <div className="filter-screen">
      <FilterSidebar
        records={props.filtered}
        allRecords={props.allRecords}
        filters={props.filters}
        onChange={props.onFiltersChange}
      />
      <div className="results-pane">
        <div className="results-header">
          <div className="results-header-left">
            <span>
              {props.filtered.length} de {props.allRecords.length} resultados
            </span>
          </div>
        </div>
        {hasRecords ? (
          props.filtered.length === 0 ? (
            <p className="muted">Nenhum resultado corresponde aos filtros atuais.</p>
          ) : (
            <div className="results-scroll">
              <ResultsTable records={props.filtered} />
            </div>
          )
        ) : (
          <div className="results-scroll">
            <div className="empty-state">
              <div className="empty-state-content">
                <h3>Aguardando resultados</h3>
                <p>
                  Abra o <strong>Catálogo de Vendas</strong> dentro do jogo,
                  faça suas buscas e navegue por todas as páginas dos resultados.
                </p>
                <p className="muted">
                  Os itens vão aparecer aqui automaticamente conforme os pacotes
                  chegam.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionActions(props: {
  status: Exclude<CaptureStatus, "idle">;
  stats: { packets_seen: number; matched: number };
  pageCount: number;
  hasData: boolean;
  onStop: () => void;
  onClear: () => void;
  onReset: () => void;
}) {
  const isRecording = props.status === "recording";
  return (
    <div className="session-actions">
      {isRecording && (
        <span className="recording-indicator">
          <span className="dot" /> gravando · {props.pageCount} págs · {props.stats.matched.toLocaleString("pt-BR")} pacotes
        </span>
      )}
      {isRecording && (
        <button onClick={props.onStop}>Parar Gravação</button>
      )}
      <button onClick={props.onClear} disabled={!props.hasData}>
        Limpar
      </button>
      <button onClick={props.onReset}>Nova Sessão</button>
    </div>
  );
}
