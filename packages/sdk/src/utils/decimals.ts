/**
 * Converts a raw uint256 price value and int8 decimals into a JavaScript number.
 *
 * Design note: Returns a `number` (float64) — suitable for UI/display use.
 * For high-precision DeFi math (e.g. computing collateral ratios on-chain),
 * consumers should use `rawValue` and `decimals` directly.
 *
 * Handles all three cases:
 *   - decimals > 0 → divide by 10^decimals (most common, e.g. decimals=7)
 *   - decimals = 0 → return raw value as-is
 *   - decimals < 0 → multiply by 10^(-decimals) (rare but handled)
 *
 * @param raw - The raw uint256 price from the contract (as bigint)
 * @param decimals - The int8 decimal count from the contract
 * @returns Normalized float, e.g. raw=234000n, decimals=7 → 0.0234
 *
 * @example
 *   normalizePriceValue(100000n, 5)  // => 1.0
 *   normalizePriceValue(234000n, 7)  // => 0.0234
 *   normalizePriceValue(65000n, 2)   // => 650.0
 *   normalizePriceValue(1n, 0)       // => 1
 *   normalizePriceValue(5n, -2)      // => 500
 */
export function normalizePriceValue(raw: bigint, decimals: number): number {
  if (decimals === 0) {
    return Number(raw);
  }

  if (decimals > 0) {
    const divisor = 10n ** BigInt(decimals);
    const integer = raw / divisor;
    const remainder = raw % divisor;
    // Combine integer and fractional parts, avoiding floating-point precision loss
    return Number(integer) + Number(remainder) / Number(divisor);
  }

  // Negative decimals: multiply (shift left)
  const multiplier = 10n ** BigInt(-decimals);
  return Number(raw * multiplier);
}

/**
 * Formats a normalized price to a human-readable string with fixed decimal places.
 *
 * @param value - Normalized price from normalizePriceValue()
 * @param precision - Number of decimal places (default: 6)
 *
 * @example
 *   formatPrice(0.023456789)        // => "0.023457"
 *   formatPrice(65432.1, 2)         // => "65432.10"
 */
export function formatPrice(value: number, precision = 6): string {
  return value.toFixed(precision);
}
