import { CATEGORY_BYTES } from "./types.js";
import type { FeedCategory, DecodedFeed } from "./types.js";

/** Reverse mapping: numeric byte → FeedCategory */
const REVERSE_CATEGORY: Readonly<Record<number, FeedCategory>> = {
  0x01: "crypto",
  0x02: "forex",
  0x03: "commodity",
  0x04: "stock",
} as const;

/**
 * Encodes a human-readable feed symbol into a bytes21 hex string.
 *
 * Encoding layout (21 bytes total):
 *   byte[0]      = category byte (0x01–0x04)
 *   bytes[1..20] = UTF-8 encoded symbol, zero-padded to 20 bytes
 *
 * @example
 *   encodeFeedId("FLR/USD", "crypto")
 *   // => "0x01464c522f55534400000000000000000000000000"
 *
 * @throws {Error} if the symbol encodes to more than 20 UTF-8 bytes
 */
export function encodeFeedId(symbol: string, category: FeedCategory): string {
  const categoryByte = CATEGORY_BYTES[category];
  const symbolBytes = new TextEncoder().encode(symbol);

  if (symbolBytes.length > 20) {
    throw new Error(
      `Feed symbol "${symbol}" encodes to ${symbolBytes.length} UTF-8 bytes; maximum is 20.`
    );
  }

  // Build 21-byte buffer: [categoryByte, ...symbolBytes, ...zeros]
  const buf = new Uint8Array(21);
  buf[0] = categoryByte;
  buf.set(symbolBytes, 1);
  // Remaining bytes are already 0x00 (Uint8Array default initialization)

  return "0x" + Buffer.from(buf).toString("hex");
}

/**
 * Decodes a bytes21 hex string back into its category and symbol components.
 * Strips trailing zero bytes from the symbol field.
 *
 * @throws {Error} if the input is not a valid 21-byte hex string
 * @throws {Error} if the category byte is unknown
 * @throws {Error} if the symbol bytes are not valid UTF-8
 */
export function decodeFeedId(feedId: string): DecodedFeed {
  const hex = feedId.startsWith("0x") ? feedId.slice(2) : feedId;

  if (hex.length !== 42) {
    throw new Error(
      `Invalid feedId length: expected 42 hex chars (21 bytes), got ${hex.length}. Input: "${feedId}"`
    );
  }

  const buf = Buffer.from(hex, "hex");
  const categoryByte = buf[0];

  if (categoryByte === undefined) {
    throw new Error(`Failed to read category byte from feedId: "${feedId}"`);
  }

  const category = REVERSE_CATEGORY[categoryByte];

  if (!category) {
    throw new Error(
      `Unknown category byte: 0x${categoryByte.toString(16).padStart(2, "0")} in feedId "${feedId}". ` +
        `Supported: 0x01 (crypto), 0x02 (forex), 0x03 (commodity), 0x04 (stock).`
    );
  }

  // Decode symbol bytes[1..20], strip trailing zero-bytes
  const symbolBytes = buf.subarray(1);
  const trimmed = stripTrailingZeros(symbolBytes);

  let symbol: string;
  try {
    symbol = new TextDecoder("utf-8", { fatal: true }).decode(trimmed);
  } catch {
    throw new Error(
      `Symbol bytes in feedId "${feedId}" are not valid UTF-8.`
    );
  }

  return {
    category,
    categoryByte,
    symbol,
    feedId: "0x" + hex.toLowerCase(),
  };
}

/** Strips trailing 0x00 bytes from a Uint8Array */
function stripTrailingZeros(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }
  return bytes.subarray(0, end);
}
