// One-shot + polled snapshot of game clients currently connected to a
// Ragnarok server port. Drives the pre-recording picker — the backend
// walks the OS TCP table on each call, no capture session required.

import { useCallback, useEffect, useState } from "react";
import { discoverClients } from "../lib/invoke";
import type { ClientInfo } from "../lib/types";

const POLL_INTERVAL_MS = 2000;

export function useDiscoveredClients() {
  const [clients, setClients] = useState<ClientInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const fresh = await discoverClients();
      setClients((prev) => (sameClients(prev, fresh) ? prev : fresh));
    } catch (e) {
      console.warn("[discover] failed:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { clients, refresh };
}

function sameClients(a: ClientInfo[], b: ClientInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.pid !== y.pid ||
      x.connection_count !== y.connection_count ||
      x.process_name !== y.process_name
    ) {
      return false;
    }
  }
  return true;
}
