import { useEffect, type ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Override the default backdrop z-index. Base modal sits at 100;
  // stacked modals (help-on-watcher) need to be higher so the
  // click-outside-to-close picks the inner one first.
  zIndex?: number;
};

export function Modal({ title, onClose, children, zIndex }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="ghost icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
