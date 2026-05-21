import { openUrl } from "@tauri-apps/plugin-opener";
import { stripSlotSuffix } from "./itemName";

export type Server = "FREYA" | "NIDHOGG";

/** Open an external URL via the Tauri opener plugin, logging any failure. */
export function openExternal(href: string): void {
  openUrl(href).catch((err) =>
    console.error("[openExternal] failed:", err),
  );
}

export const SERVERS: { code: Server; label: string }[] = [
  { code: "FREYA", label: "Freya" },
  { code: "NIDHOGG", label: "Nidhogg" },
];

export function dpUrl(itemID: number): string {
  return `https://www.divine-pride.net/database/item/${itemID}?server=latamRO`;
}

export function marketUrl(itemName: string, server: Server): string {
  const word = encodeURIComponent(stripSlotSuffix(itemName));
  return `https://ro.gnjoylatam.com/pt/intro/shop-search/trading?storeType=BUY&serverType=${server}&searchWord=${word}&sortType=LOW_PRICE&p=1`;
}
