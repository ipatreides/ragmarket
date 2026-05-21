import { useState } from "react";
import { WatcherHelpModal } from "./WatcherHelpModal";
import { NOTIFY_INTERVAL_BOUNDS, useNotifyConfig } from "../hooks/useNotifyConfig";
import { sendNtfyPush } from "../lib/notify/ntfy";
import {
  ensureWinPermission,
  sendWindowsNotification,
} from "../lib/notify/winNotify";

type TestStatus = "idle" | "sending" | "sent" | "failed" | "denied";

type Props = {
  enabledCount: number;
  schedulerLastRun: number | null;
  schedulerRunning: boolean;
  onRunNow: () => void;
};

export function FavoritesNotifyBar({
  enabledCount,
  schedulerLastRun,
  schedulerRunning,
  onRunNow,
}: Props) {
  const { config, update } = useNotifyConfig();
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pushTest, setPushTest] = useState<TestStatus>("idle");
  const [winTest, setWinTest] = useState<TestStatus>("idle");

  const summary = (
    <>
      <strong>Alertas:</strong>{" "}
      {enabledCount === 0
        ? "nenhum configurado"
        : `${enabledCount} ativo${enabledCount === 1 ? "" : "s"}`}
      {schedulerLastRun !== null && (
        <span className="muted small" style={{ marginLeft: 10 }}>
          última checagem {formatRel(schedulerLastRun)}
        </span>
      )}
    </>
  );

  return (
    <>
      <div className="favorites-notify-bar">
        <div className="favorites-notify-bar__row">
          <button
            type="button"
            className="link-button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "▾" : "▸"} Notificações
          </button>
          <span className="favorites-notify-bar__summary">{summary}</span>
          <button
            type="button"
            className="favorites-notify-bar__run-now"
            onClick={onRunNow}
            disabled={schedulerRunning || enabledCount === 0}
            title="Verifica agora todos os alertas ativos sem esperar o próximo ciclo"
          >
            {schedulerRunning ? "Verificando…" : "Verificar agora"}
          </button>
        </div>
        {open && (
          <div className="favorites-notify-bar__panel">
            <section className="notify-channel">
              <label className="modal-radio">
                <input
                  type="checkbox"
                  checked={config.ntfyEnabled}
                  onChange={(e) => {
                    setPushTest("idle");
                    update({ ntfyEnabled: e.target.checked });
                  }}
                />
                <span>
                  <strong>Push (ntfy.sh)</strong> — envia para o celular
                </span>
              </label>
              <div className="modal-shortcut-row">
                <input
                  className="modal-input"
                  type="text"
                  placeholder="ex: ragmarket-alertas-x7k2"
                  spellCheck={false}
                  value={config.ntfyTopic}
                  disabled={!config.ntfyEnabled}
                  onChange={(e) => {
                    setPushTest("idle");
                    update({ ntfyTopic: e.target.value });
                  }}
                />
                <button
                  type="button"
                  className="ghost"
                  title="Como configurar"
                  onClick={() => setShowHelp(true)}
                >
                  ?
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={
                    !config.ntfyEnabled ||
                    !config.ntfyTopic.trim() ||
                    pushTest === "sending"
                  }
                  onClick={async () => {
                    setPushTest("sending");
                    const ok = await sendNtfyPush(config.ntfyTopic, {
                      title: "Ragmarket — teste",
                      body: "Se você está lendo isso no celular, os alertas de preço estão prontos.",
                      priority: "default",
                      tags: ["test_tube"],
                    });
                    setPushTest(ok ? "sent" : "failed");
                  }}
                >
                  {pushTest === "sending" ? "Enviando…" : "Testar"}
                </button>
              </div>
              {pushTest === "sent" && (
                <span className="muted modal-hint">
                  ✓ Enviado. Cheque o app ntfy no celular.
                </span>
              )}
              {pushTest === "failed" && (
                <span className="modal-hint" style={{ color: "#ffb070" }}>
                  ✗ Falhou. Verifique a conexão e o nome do tópico.
                </span>
              )}
            </section>

            <section className="notify-channel">
              <label className="modal-radio">
                <input
                  type="checkbox"
                  checked={config.winEnabled}
                  onChange={async (e) => {
                    const enabling = e.target.checked;
                    setWinTest("idle");
                    update({ winEnabled: enabling });
                    if (enabling) await ensureWinPermission();
                  }}
                />
                <span>
                  <strong>Windows</strong> — toast nativo do sistema
                </span>
              </label>
              <div className="modal-shortcut-row">
                <button
                  type="button"
                  className="ghost"
                  disabled={!config.winEnabled || winTest === "sending"}
                  onClick={async () => {
                    setWinTest("sending");
                    const granted = await ensureWinPermission();
                    if (!granted) {
                      setWinTest("denied");
                      return;
                    }
                    const ok = await sendWindowsNotification(
                      "Ragmarket — teste",
                      "Se você está vendo esta notificação, os alertas de preço estão prontos.",
                    );
                    setWinTest(ok ? "sent" : "failed");
                  }}
                >
                  {winTest === "sending" ? "Enviando…" : "Testar"}
                </button>
                {winTest === "sent" && (
                  <span className="muted modal-hint">✓ Enviada.</span>
                )}
                {winTest === "failed" && (
                  <span className="modal-hint" style={{ color: "#ffb070" }}>
                    ✗ Falhou — verifique as notificações do Windows.
                  </span>
                )}
                {winTest === "denied" && (
                  <span className="modal-hint" style={{ color: "#ffb070" }}>
                    Permissão negada. Libere em Configurações do Windows →
                    Sistema → Notificações.
                  </span>
                )}
              </div>
            </section>

            <section className="notify-channel">
              <div className="modal-shortcut-row">
                <label className="modal-label" htmlFor="watcher-interval">
                  Verificar a cada
                </label>
                <input
                  id="watcher-interval"
                  className="modal-input modal-input--inline"
                  type="number"
                  min={NOTIFY_INTERVAL_BOUNDS.min}
                  max={NOTIFY_INTERVAL_BOUNDS.max}
                  step={30}
                  value={config.intervalSec}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) update({ intervalSec: v });
                  }}
                />
                <span className="muted small">
                  segundos ({NOTIFY_INTERVAL_BOUNDS.min}–
                  {NOTIFY_INTERVAL_BOUNDS.max})
                </span>
              </div>
              <p className="muted modal-hint">
                Os alertas só rodam enquanto o Ragmarket estiver aberto.
              </p>
            </section>
          </div>
        )}
      </div>
      {showHelp && (
        <WatcherHelpModal
          onClose={() => setShowHelp(false)}
          topicExample="ragmarket-alertas-x7k2"
        />
      )}
    </>
  );
}

function formatRel(ts: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return `há ${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `há ${hrs} h`;
}
