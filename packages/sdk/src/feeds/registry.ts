import type { FeedCategory, FeedInfo } from "./types.js";
import { encodeFeedId } from "./decoder.js";

/**
 * Master list of all supported feed symbols and their categories.
 * This is the source of truth for what feeds the SDK supports.
 *
 * Adding a new feed: append to this array and bump the minor version.
 * Feed IDs are derived deterministically via encodeFeedId — never hardcode the hex.
 */
const FEED_DEFINITIONS: ReadonlyArray<readonly [string, FeedCategory]> = [
  // ── Crypto (0x01) ─────────────────────────────────────────
  ["FLR/USD", "crypto"],
  ["SGB/USD", "crypto"],
  ["BTC/USD", "crypto"],
  ["ETH/USD", "crypto"],
  ["XRP/USD", "crypto"],
  ["ADA/USD", "crypto"],
  ["SOL/USD", "crypto"],
  ["DOGE/USD", "crypto"],
  ["AVAX/USD", "crypto"],
  ["BNB/USD", "crypto"],
  ["MATIC/USD", "crypto"],
  ["ARB/USD", "crypto"],
  ["ALGO/USD", "crypto"],
  ["LTC/USD", "crypto"],
  ["XLM/USD", "crypto"],
  ["XDC/USD", "crypto"],
  ["USDT/USD", "crypto"],
  ["USDC/USD", "crypto"],
  ["FIL/USD", "crypto"],
  ["DOT/USD", "crypto"],
  ["LINK/USD", "crypto"],
  ["UNI/USD", "crypto"],
  ["ATOM/USD", "crypto"],
  ["NEAR/USD", "crypto"],
  ["APT/USD", "crypto"],
  ["OP/USD", "crypto"],
  ["INJ/USD", "crypto"],
  ["TRX/USD", "crypto"],
  ["SHIB/USD", "crypto"],
  ["TON/USD", "crypto"],
  ["HBAR/USD", "crypto"],
  ["VET/USD", "crypto"],
  ["ICP/USD", "crypto"],
  ["GRT/USD", "crypto"],
  ["RUNE/USD", "crypto"],
  ["SEI/USD", "crypto"],
  ["WLD/USD", "crypto"],
  ["FTM/USD", "crypto"],
  ["SAND/USD", "crypto"],
  ["MANA/USD", "crypto"],
  ["CRV/USD", "crypto"],
  ["AAVE/USD", "crypto"],
  ["MKR/USD", "crypto"],
  ["SNX/USD", "crypto"],
  ["COMP/USD", "crypto"],
  ["LDO/USD", "crypto"],
  ["QNT/USD", "crypto"],
  ["EGLD/USD", "crypto"],
  ["XTZ/USD", "crypto"],
  ["FLOW/USD", "crypto"],

  // ── Forex (0x02) ──────────────────────────────────────────
  ["EUR/USD", "forex"],
  ["GBP/USD", "forex"],
  ["JPY/USD", "forex"],
  ["AUD/USD", "forex"],
  ["CAD/USD", "forex"],
  ["CHF/USD", "forex"],
  ["CNY/USD", "forex"],
  ["KRW/USD", "forex"],
  ["SGD/USD", "forex"],
  ["MXN/USD", "forex"],
  ["BRL/USD", "forex"],
  ["INR/USD", "forex"],
  ["ZAR/USD", "forex"],
  ["SEK/USD", "forex"],
  ["NOK/USD", "forex"],

  // ── Commodity (0x03) ──────────────────────────────────────
  ["XAU/USD", "commodity"],
  ["XAG/USD", "commodity"],
  ["XPT/USD", "commodity"],
  ["XPD/USD", "commodity"],
  ["WTI/USD", "commodity"],
] as const;

// Build the registry Map at module initialization (once, synchronously).
// Key: normalized uppercase symbol → Value: FeedInfo
const _registry = new Map<string, FeedInfo>();

for (const [symbol, category] of FEED_DEFINITIONS) {
  const normalized = symbol.toUpperCase();
  _registry.set(normalized, {
    symbol: normalized,
    feedId: encodeFeedId(symbol, category),
    category,
  });
}

/**
 * Looks up a feed by symbol (case-insensitive).
 * Returns `undefined` if the symbol is not in the registry.
 *
 * @example
 *   getFeedInfo("flr/usd") // returns FeedInfo for FLR/USD
 */
export function getFeedInfo(symbol: string): FeedInfo | undefined {
  return _registry.get(symbol.toUpperCase());
}

/**
 * Lists all registered feeds, optionally filtered by category.
 * No network call — returns from the static registry.
 */
export function listFeeds(category?: FeedCategory): FeedInfo[] {
  const all = Array.from(_registry.values());
  return category ? all.filter((f) => f.category === category) : all;
}

/**
 * Returns true if the symbol is in the registry.
 */
export function feedExists(symbol: string): boolean {
  return _registry.has(symbol.toUpperCase());
}

/** Total number of registered feeds */
export function feedCount(): number {
  return _registry.size;
}

// Exported for testing and advanced consumers
export { _registry as feedRegistry };
