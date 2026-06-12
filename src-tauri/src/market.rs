// Scrapes the gnjoylatam vending-store search page for the min and max
// price of a specific item.
//
// The page is a Next.js app. The HTML payload doesn't contain real `<table>`
// rows — it contains the React Server Components streaming payload, where
// the search results JSON has been re-escaped into a string passed to
// `__next_f.push([1, "..."])`. Inside that string each result row looks
// like:
//
//   {\"svrId\":3,\"itemId\":4423,\"mapId\":835,\"ssi\":\"...\",
//    \"itemName\":\"Carta Galion\",...,\"itemPrice\":10000,\"itemCnt\":1,...}
//
// We don't try to unescape and parse JSON — that's brittle across stream
// boundaries. Instead we regex out (itemId, itemPrice) pairs in their
// document order, which mirrors the server's sort. With
// `sortType=LOW_PRICE` the first row matching the requested itemId is the
// minimum; with `sortType=HIGH_PRICE` it's the maximum.
//
// The search itself is a substring match on `searchWord`, so a query for
// "Carta de Andre" also matches "Carta de Andre Doce". Filtering on
// `itemId` here keeps us honest.

use std::collections::HashSet;
use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

#[derive(Serialize, Clone, Debug)]
pub struct MarketExtremes {
    pub min: Option<u64>,
    pub max: Option<u64>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarketListing {
    pub price: u64,
    pub amount: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketListings {
    /// Cheapest listings for the item, ascending by price.
    pub listings: Vec<MarketListing>,
    /// Upstream search total. The search is a substring match on the name,
    /// so this can count other items' rows too — pagination metadata, not
    /// an item count.
    pub total_count: u32,
    /// True when the distribution is missing (more expensive) listings:
    /// more pages existed than we fetch, or a page request failed.
    pub truncated: bool,
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "UPPERCASE")]
pub enum Server {
    Freya,
    Nidhogg,
}

impl Server {
    fn as_param(self) -> &'static str {
        match self {
            Server::Freya => "FREYA",
            Server::Nidhogg => "NIDHOGG",
        }
    }
}

fn market_url(item_name: &str, server: Server, sort: &str, page: u32) -> String {
    let word = urlencode(item_name);
    let svr = server.as_param();
    format!(
        "https://ro.gnjoylatam.com/pt/intro/shop-search/trading\
         ?storeType=BUY&serverType={svr}&searchWord={word}&sortType={sort}&p={page}"
    )
}

// reqwest doesn't expose a url-encoder, and we don't want the
// `percent-encoding` crate just for two strings. Encode every byte that
// isn't unreserved per RFC 3986.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn price_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Each row contains, in order: `\"itemId\":N` ... `\"itemPrice\":M`.
        Regex::new(r#"\\"itemId\\":(\d+)[^}]*?\\"itemPrice\\":(\d+)"#)
            .expect("static regex pattern must compile")
    })
}

fn listing_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Each row contains, in order: itemId … ssi … itemPrice … itemCnt.
        // `ssi` is a unique listing id — we use it to dedup listings that
        // show up on two pages when the market shifts between requests.
        // The `[^}]*?` gaps keep a match from spanning across rows.
        Regex::new(
            r#"\\"itemId\\":(\d+)[^}]*?\\"ssi\\":\\"(\d+)\\"[^}]*?\\"itemPrice\\":(\d+)[^}]*?\\"itemCnt\\":(\d+)"#,
        )
        .expect("static regex pattern must compile")
    })
}

fn total_count_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"\\"totalCount\\":(\d+)"#).expect("static regex pattern must compile")
    })
}

// reqwest::Client owns a connection pool; we keep one for the whole
// process so consecutive market lookups share keep-alive and TLS setup.
fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let c = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client build: {e}"))?;
    Ok(CLIENT.get_or_init(|| c))
}

fn first_price_for_id(html: &str, item_id: u32) -> Option<u64> {
    for cap in price_regex().captures_iter(html) {
        let id: u32 = cap.get(1)?.as_str().parse().ok()?;
        if id != item_id {
            continue;
        }
        let price: u64 = cap.get(2)?.as_str().parse().ok()?;
        return Some(price);
    }
    None
}

fn total_count(html: &str) -> Option<u32> {
    let cap = total_count_regex().captures(html)?;
    cap.get(1)?.as_str().parse().ok()
}

// Extracts the listing rows for `item_id` from one or more result pages.
// Rows of other items are skipped (the search is a substring match on the
// name), duplicates across pages are dropped by `ssi`, and the result is
// re-sorted by price: the market can shift between page requests, so
// cross-page document order isn't guaranteed to stay ascending. The sort is
// stable, preserving document order within a price level.
fn merge_listings(pages: &[String], item_id: u32) -> Vec<MarketListing> {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut out = Vec::new();
    for page in pages {
        for cap in listing_regex().captures_iter(page) {
            let (Some(id), Some(ssi), Some(price), Some(amount)) = (
                cap.get(1).and_then(|m| m.as_str().parse::<u32>().ok()),
                cap.get(2).map(|m| m.as_str()),
                cap.get(3).and_then(|m| m.as_str().parse::<u64>().ok()),
                cap.get(4).and_then(|m| m.as_str().parse::<u32>().ok()),
            ) else {
                continue;
            };
            if id != item_id || !seen.insert(ssi) {
                continue;
            }
            out.push(MarketListing { price, amount });
        }
    }
    out.sort_by_key(|l| l.price);
    out
}

async fn fetch_html(url: String) -> Result<String, String> {
    let client = http_client()?;
    let res = client
        .get(&url)
        .header("accept", "text/html")
        .header("accept-language", "pt-BR,pt;q=0.9,en-US;q=0.8")
        .send()
        .await
        .map_err(|e| format!("request: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    res.text().await.map_err(|e| format!("body: {e}"))
}

#[tauri::command]
pub async fn fetch_market_extremes(
    item_id: u32,
    item_name: String,
    server: Server,
) -> Result<MarketExtremes, String> {
    if item_id == 0 || item_name.is_empty() {
        return Err("itemId and itemName required".into());
    }

    let low_url = market_url(&item_name, server, "LOW_PRICE", 1);
    let high_url = market_url(&item_name, server, "HIGH_PRICE", 1);

    let (low_html, high_html) = tokio::join!(fetch_html(low_url), fetch_html(high_url));
    let low_html = low_html?;
    let high_html = high_html?;

    Ok(MarketExtremes {
        min: first_price_for_id(&low_html, item_id),
        max: first_price_for_id(&high_html, item_id),
    })
}

const PAGE_SIZE: u32 = 20;
const MAX_PAGES: u32 = 5;

// Fetches the cheapest listings for an item by paginating the
// LOW_PRICE-sorted search up to MAX_PAGES pages (the cheap end is what
// matters for deciding where to price your own item). On a page failure we
// keep the longest gap-free prefix of pages — a hole in the middle would
// corrupt cumulative quantities downstream — and report `truncated`.
#[tauri::command]
pub async fn fetch_market_listings(
    item_id: u32,
    item_name: String,
    server: Server,
) -> Result<MarketListings, String> {
    if item_id == 0 || item_name.is_empty() {
        return Err("itemId and itemName required".into());
    }

    let first = fetch_html(market_url(&item_name, server, "LOW_PRICE", 1)).await?;

    let total = total_count(&first);
    let pages_needed = match total {
        Some(t) => t.div_ceil(PAGE_SIZE).max(1),
        // No totalCount in the payload (format drift): if page 1 looks
        // full, assume there is more; otherwise this is everything.
        None => {
            if listing_regex().captures_iter(&first).count() >= PAGE_SIZE as usize {
                MAX_PAGES
            } else {
                1
            }
        }
    };
    let to_fetch = pages_needed.min(MAX_PAGES);

    let handles: Vec<_> = (2..=to_fetch)
        .map(|p| {
            tauri::async_runtime::spawn(fetch_html(market_url(&item_name, server, "LOW_PRICE", p)))
        })
        .collect();

    let mut pages = vec![first];
    let mut failed = false;
    for handle in handles {
        let res = match handle.await {
            Ok(r) => r,
            Err(e) => Err(format!("join: {e}")),
        };
        match res {
            Ok(html) if !failed => pages.push(html),
            // Later pages still get awaited so their requests are not
            // abandoned mid-flight, but they can't be used: a gap before
            // them already broke the prefix.
            Ok(_) => {}
            Err(_) => failed = true,
        }
    }

    let truncated = (pages.len() as u32) < pages_needed;
    Ok(MarketListings {
        listings: merge_listings(&pages, item_id),
        total_count: total.unwrap_or(0),
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_first_matching_price() {
        // Synthetic payload mimicking the escaped-JSON-in-HTML form.
        let html = r#"junk \"itemId\":99,\"mapId\":1,\"itemPrice\":50 more \"itemId\":4423,\"mapId\":835,\"itemPrice\":10000 then \"itemId\":4423,\"itemPrice\":20000"#;
        assert_eq!(first_price_for_id(html, 4423), Some(10000));
        assert_eq!(first_price_for_id(html, 99), Some(50));
        assert_eq!(first_price_for_id(html, 7), None);
    }

    #[test]
    fn urlencode_handles_accents_and_spaces() {
        // "Poção Vermelha" → Po%C3%A7%C3%A3o%20Vermelha
        assert_eq!(urlencode("Poção Vermelha"), "Po%C3%A7%C3%A3o%20Vermelha");
    }

    #[test]
    fn server_param_matches_upstream_casing() {
        assert_eq!(Server::Freya.as_param(), "FREYA");
        assert_eq!(Server::Nidhogg.as_param(), "NIDHOGG");
    }

    #[test]
    fn market_url_includes_page() {
        let url = market_url("Elunium", Server::Freya, "LOW_PRICE", 3);
        assert!(url.ends_with("&p=3"), "got: {url}");
        assert!(url.contains("sortType=LOW_PRICE"));
    }

    #[test]
    fn parses_verbatim_live_row() {
        // Row captured from the real payload on 2026-06-11.
        let html = r#"{\"svrId\":3,\"itemId\":4423,\"mapId\":835,\"ssi\":\"7650288768037372174\",\"itemName\":\"Carta Galion\",\"databaseImgPath\":\"https://assets.gnjoylatam.com/static/upload/database/item/2025/10/4423.png\",\"databaseType\":\"card\",\"storeName\":\"BORA POVO\",\"itemPrice\":100000,\"itemCnt\":1,\"slotMaxCount\":\"\",\"storeTypeName\":\"BUY\",\"itemSellerCharName\":\"VENDEDORA PLUS SIZE\"}"#;
        let pages = vec![html.to_string()];
        assert_eq!(
            merge_listings(&pages, 4423),
            vec![MarketListing { price: 100000, amount: 1 }]
        );
        assert!(merge_listings(&pages, 999).is_empty());
    }

    #[test]
    fn merge_filters_dedups_and_sorts_across_pages() {
        // Page 2 repeats ssi 111 (market shifted between requests) and
        // brings a price lower than page 1's — the merge must dedup and
        // re-sort ascending. Row for itemId 99 is another item.
        let p1 = r#"{\"itemId\":4423,\"mapId\":1,\"ssi\":\"111\",\"storeName\":\"a\",\"itemPrice\":100,\"itemCnt\":2},{\"itemId\":99,\"mapId\":1,\"ssi\":\"222\",\"storeName\":\"b\",\"itemPrice\":5,\"itemCnt\":1}"#;
        let p2 = r#"{\"itemId\":4423,\"mapId\":1,\"ssi\":\"111\",\"storeName\":\"a\",\"itemPrice\":100,\"itemCnt\":2},{\"itemId\":4423,\"mapId\":1,\"ssi\":\"333\",\"storeName\":\"c\",\"itemPrice\":90,\"itemCnt\":3}"#;
        let pages = vec![p1.to_string(), p2.to_string()];
        assert_eq!(
            merge_listings(&pages, 4423),
            vec![
                MarketListing { price: 90, amount: 3 },
                MarketListing { price: 100, amount: 2 },
            ]
        );
    }

    #[test]
    fn extracts_total_count() {
        assert_eq!(total_count(r#"junk \"totalCount\":2135 junk"#), Some(2135));
        assert_eq!(total_count("no count here"), None);
    }
}
