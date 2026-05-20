export type MainTab = "search" | "mine" | "favorites";

type Props = {
  active: MainTab;
  onChange: (t: MainTab) => void;
  counts: { search: number; mine: number; favorites: number };
};

const TABS: { id: MainTab; label: string }[] = [
  { id: "search", label: "Catálogo" },
  { id: "mine", label: "Meus Itens" },
  { id: "favorites", label: "Favoritos" },
];

export function MainTabs({ active, onChange, counts }: Props) {
  return (
    <nav className="main-tabs" role="tablist">
      {TABS.map((t) => {
        const isActive = active === t.id;
        const c = counts[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={"main-tab" + (isActive ? " active" : "")}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {c > 0 && <span className="main-tab-count">{c}</span>}
          </button>
        );
      })}
    </nav>
  );
}
