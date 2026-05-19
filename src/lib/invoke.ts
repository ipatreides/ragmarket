import { invoke } from "@tauri-apps/api/core";
import type { ClientInfo } from "./types";

export function discoverClients(): Promise<ClientInfo[]> {
  return invoke("discover_clients_cmd");
}

export function setClientSelection(pid: number | null): Promise<void> {
  return invoke("set_client_selection", { pid });
}
