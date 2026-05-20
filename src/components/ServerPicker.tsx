import { Server, SERVERS } from "../lib/links";

type Props = {
  value: Server;
  onChange: (s: Server) => void;
};

export function ServerPicker({ value, onChange }: Props) {
  return (
    <label className="server-picker" title="Servidor usado nos links do Mercado">
      <span className="muted small">Servidor</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Server)}
      >
        {SERVERS.map((s) => (
          <option key={s.code} value={s.code}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
