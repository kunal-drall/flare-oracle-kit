/**
 * Feed category codes matching Flare's bytes21 encoding specification.
 * The first byte of a feedId encodes the category.
 */
export type FeedCategory = "crypto" | "forex" | "commodity" | "stock";

/**
 * Category → numeric byte mapping (per Flare protocol spec).
 * 0x01 = Crypto, 0x02 = Forex, 0x03 = Commodity, 0x04 = Stock
 */
export const CATEGORY_BYTES: Readonly<Record<FeedCategory, number>> = {
  crypto: 0x01,
  forex: 0x02,
  commodity: 0x03,
  stock: 0x04,
} as const;

/**
 * Static metadata for a registered feed.
 */
export interface FeedInfo {
  /** Human-readable symbol, e.g. "FLR/USD" */
  symbol: string;
  /** bytes21 hex string with 0x prefix, e.g. "0x01464c522f55534400000000000000000000000000" */
  feedId: string;
  category: FeedCategory;
  description?: string;
}

/**
 * Result of decoding a bytes21 feedId back into its components.
 */
export interface DecodedFeed {
  category: FeedCategory;
  /** Raw category byte (e.g. 0x01) */
  categoryByte: number;
  /** Decoded symbol string, e.g. "FLR/USD" */
  symbol: string;
  /** Original feedId hex (lowercased) */
  feedId: string;
}

/**
 * Fully hydrated price feed returned from oracle queries.
 */
export interface PriceFeed {
  /** Human-readable symbol, e.g. "FLR/USD" */
  symbol: string;
  /** bytes21 hex feedId */
  feedId: string;
  /**
   * Decimal-normalized price value as a JavaScript number.
   * For display/UI use — use rawValue for high-precision DeFi math.
   * e.g. rawValue=234000n, decimals=7 → value=0.0234
   */
  value: number;
  /** Raw uint256 price value from the contract */
  rawValue: bigint;
  /** Decimal places (int8 from contract, cast to number). Can change over time — never cache. */
  decimals: number;
  /** Unix timestamp (seconds) of last oracle update */
  timestamp: number;
  /** Seconds elapsed since the last oracle update (at time of fetch) */
  age: number;
  /** Network name this price was fetched from */
  network: string;
}
