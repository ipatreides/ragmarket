import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { WatcherEntry } from "../hooks/useWatchers";

type Props = {
  itemId: number;
  itemName: string;
  currentMin: number | null;
  existing: WatcherEntry | null;
  onSave: (next: { enabled: boolean; targetPrice: number }) => void;
  onRemove: () => void;
  onClose: () => void;
};

export function WatcherSetupModal({
  itemId,
  itemName,
  currentMin,
  existing,
  onSave,
  onRemove,
  onClose,
}: Props) {
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [targetInput, setTargetInput] = useState(() =>
    existing && existing.targetPrice > 0 ? String(existing.targetPrice) : "",
  );
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the modal is re-opened for a different item.
  useEffect(() => {
    setEnabled(existing?.enabled ?? true);
    setTargetInput(
      existing && existing.targetPrice > 0 ? String(existing.targetPrice) : "",
    );
    setError(null);
  }, [itemId, existing]);

  const handleSave = () => {
    const target = Number(targetInput.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(target) || target <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    onSave({ enabled, targetPrice: target });
    onClose();
  };

  return (
    <Modal title={`Alerta — ${itemName}`} onClose={onClose}>
      <section className="modal-section">
        <p className="muted modal-hint">
          Item <code>#{itemId}</code>
          {currentMin !== null && (
            <>
              {" "}· mínimo atual{" "}
              <strong>{currentMin.toLocaleString("pt-BR")}</strong> z
            </>
          )}
          {existing?.lastAlertedPrice !== undefined &&
            existing.lastAlertedPrice !== null && (
              <>
                {" "}· último alerta em{" "}
                <strong>{existing.lastAlertedPrice.toLocaleString("pt-BR")}</strong>{" "}
                z
              </>
            )}
        </p>

        <label className="modal-radio">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <strong>Ativar alerta</strong> — notifica quando o mínimo
            cair para este valor ou menos
          </span>
        </label>

        <div className="modal-shortcut-row">
          <label className="modal-label" htmlFor="watcher-target">
            Preço alvo
          </label>
          <input
            id="watcher-target"
            className="modal-input"
            type="text"
            inputMode="numeric"
            placeholder="ex: 30000000"
            value={targetInput}
            onChange={(e) => {
              setTargetInput(e.target.value);
              setError(null);
            }}
          />
          <span className="muted small">zeny</span>
        </div>
        {error && (
          <span className="modal-hint" style={{ color: "#ffb070" }}>
            {error}
          </span>
        )}

        <p className="muted modal-hint">
          O alerta dispara quando o mínimo do Mercado for ≤ ao preço
          alvo. Para evitar spam, só notifica de novo se o preço cair
          ainda mais; reseta quando volta a subir acima do alvo.
        </p>

        <div className="modal-shortcut-row" style={{ justifyContent: "space-between" }}>
          <div>
            {existing && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
              >
                Remover alerta
              </button>
            )}
          </div>
          <div style={{ display: "inline-flex", gap: 8 }}>
            <button type="button" className="ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="primary" onClick={handleSave}>
              Salvar
            </button>
          </div>
        </div>
      </section>
    </Modal>
  );
}
