import { invoke } from "@tauri-apps/api/core";
import type { ClientInfo } from "./types";
import { stripSlotSuffix } from "./itemName";
import type { Server } from "./links";

export function discoverClients(): Promise<ClientInfo[]> {
  return invoke("discover_clients_cmd");
}

export function setClientSelection(pid: number | null): Promise<void> {
  return invoke("set_client_selection", { pid });
}

export type MarketExtremes = { min: number | null; max: number | null };

export function fetchMarketExtremes(
  itemId: number,
  itemName: string,
  server: Server,
): Promise<MarketExtremes> {
  return invoke("fetch_market_extremes", {
    itemId,
    itemName: stripSlotSuffix(itemName),
    server,
  });
}

export type MarketListing = { price: number; amount: number };

export type MarketListingsResult = {
  // Cheapest listings for the item, ascending by price.
  listings: MarketListing[];
  // Upstream search total — substring match on the name, so it can count
  // other items' rows too. Pagination metadata, never shown as an item count.
  totalCount: number;
  // True when more (more expensive) listings exist than were fetched.
  truncated: boolean;
};

export function fetchMarketListings(
  itemId: number,
  itemName: string,
  server: Server,
): Promise<MarketListingsResult> {
  return invoke("fetch_market_listings", {
    itemId,
    itemName: stripSlotSuffix(itemName),
    server,
  });
}

export type SaveFilter = { name: string; extensions: string[] };

// Opens a native "save as…" dialog and writes `contents` to the chosen
// path. Resolves with the saved path on success, or `null` if the user
// cancelled.
export function saveTextFile(
  defaultName: string,
  contents: string,
  filters: SaveFilter[],
): Promise<string | null> {
  return invoke("save_text_file", { defaultName, contents, filters });
}
