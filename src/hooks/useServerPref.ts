import { Server, SERVERS } from "../lib/links";
import { usePersistentValue } from "./usePersistentValue";

const DEFAULT: Server = "FREYA";

export function useServerPref() {
  const [server, setServer] = usePersistentValue<Server>({
    key: "ragmarket.server",
    defaultValue: DEFAULT,
    parse: (raw) =>
      typeof raw === "string" && SERVERS.some((s) => s.code === raw)
        ? (raw as Server)
        : null,
    serialize: (v) => JSON.stringify(v),
  });
  return { server, setServer };
}
