// Item names from Divine Pride include the slot suffix (e.g. "Espada
// [3]"). The Mercado search field doesn't tokenize the brackets — it
// treats them as literal characters — so "Espada [3]" matches no
// listings. Strip the trailing " [N]" before using the name as a
// search term or building a market URL.
export function stripSlotSuffix(name: string): string {
  return name.replace(/\s*\[\d+\]\s*$/, "");
}
