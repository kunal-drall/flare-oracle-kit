/**
 * basic-price-fetch
 *
 * Demonstrates how to use @flare-oracle-kit/sdk to query live FTSO v2 prices.
 *
 * Usage:
 *   pnpm tsx src/index.ts
 *
 * Environment (optional):
 *   FLARE_RPC_URL  Override the default Flare mainnet RPC endpoint.
 *                  Useful for private nodes or higher rate limits.
 */

import { FlareOracle, formatPrice } from "@flare-oracle-kit/sdk";

// ── Configuration ─────────────────────────────────────────────────────────────

const NETWORK = "flare"; // "flare" | "coston2" | "songbird" | "coston"
const RPC_URL = process.env["FLARE_RPC_URL"]; // undefined → uses SDK default

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const oracle = new FlareOracle({
    network: NETWORK,
    rpcUrl: RPC_URL,
  });

  const network = oracle.getNetwork();
  console.log(`\nConnected to ${network.name} (chainId: ${network.chainId})`);
  console.log(`RPC: ${network.rpcUrl}\n`);

  // ── 1. Single price fetch ────────────────────────────────────────────────

  console.log("── Single price ──────────────────────────────────────────────");
  const flrUsd = await oracle.getPrice("FLR/USD");
  console.log(`FLR/USD: $${formatPrice(flrUsd.value, 6)}`);
  console.log(`  Raw value : ${flrUsd.rawValue.toString()}`);
  console.log(`  Decimals  : ${flrUsd.decimals}`);
  console.log(`  Age       : ${flrUsd.age}s`);
  console.log(`  Feed ID   : ${flrUsd.feedId}`);

  // ── 2. Batch price fetch (single contract call) ───────────────────────────

  console.log("\n── Batch prices ──────────────────────────────────────────────");
  const prices = await oracle.getPrices(["BTC/USD", "ETH/USD", "FLR/USD", "XRP/USD"]);
  for (const p of prices) {
    const age = p.age < 60 ? `${p.age}s` : `${Math.floor(p.age / 60)}m ${p.age % 60}s`;
    console.log(`${p.symbol.padEnd(9)} $${formatPrice(p.value, 4).padStart(14)}  (age: ${age})`);
  }

  // ── 3. Fee estimation ─────────────────────────────────────────────────────

  console.log("\n── Fee estimation ────────────────────────────────────────────");
  const feedId = oracle.getFeedId("FLR/USD");
  const fee = await oracle.estimateFee(feedId);
  console.log(`Estimated fee for FLR/USD: ${fee} wei`);
  console.log("(0 wei is expected on Flare mainnet — fees are not active yet)");

  // ── 4. Feed discovery ────────────────────────────────────────────────────

  console.log("\n── Available feeds (crypto category) ────────────────────────");
  const cryptoFeeds = oracle.listFeeds("crypto");
  console.log(`Total crypto feeds: ${cryptoFeeds.length}`);
  console.log(cryptoFeeds.slice(0, 5).map((f) => `  ${f.symbol}`).join("\n"));
  if (cryptoFeeds.length > 5) {
    console.log(`  ... and ${cryptoFeeds.length - 5} more`);
  }

  console.log(`\nTotal feeds across all categories: ${oracle.listFeeds().length}\n`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
