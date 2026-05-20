type Props = {
  on: boolean;
  onClick: () => void;
  title?: string;
};

export function StarButton({ on, onClick, title }: Props) {
  return (
    <button
      type="button"
      className={"star-button" + (on ? " on" : "")}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title ?? (on ? "Desfavoritar" : "Favoritar")}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
