export type MainTab = "search" | "mine" | "favorites";

type Props = {
  active: MainTab;
  onChange: (t: MainTab) => void;
  counts: { search: number; mine: number; favorites: number };
  disabled?: Set<MainTab>;
};

const TABS: { id: MainTab; label: string }[] = [
  { id: "search", label: "Catálogo" },
  { id: "mine", label: "Meus Itens" },
  { id: "favorites", label: "Favoritos" },
];

export function MainTabs({ active, onChange, counts, disabled }: Props) {
  return (
    <nav className="main-tabs" role="tablist">
      {TABS.map((t) => {
        const isActive = active === t.id;
        const isDisabled = disabled?.has(t.id) ?? false;
        const c = counts[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            className={
              "main-tab" +
              (isActive ? " active" : "") +
              (isDisabled ? " is-disabled" : "")
            }
            onClick={() => {
              if (!isDisabled) onChange(t.id);
            }}
            title={
              isDisabled ? "Inicie a gravação para usar esta aba" : undefined
            }
          >
            {t.label}
            {c > 0 && <span className="main-tab-count">{c}</span>}
          </button>
        );
      })}
    </nav>
  );
}
