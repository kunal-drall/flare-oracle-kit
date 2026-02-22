# flare-oracle-kit-poc-sdk

TypeScript SDK for reading live price feeds from [Flare Network's](https://flare.network) FTSO v2 (Fast Updates) oracle — the only enshrined oracle in production today.

[![npm version](https://img.shields.io/npm/v/flare-oracle-kit-poc-sdk)](https://www.npmjs.com/package/flare-oracle-kit-poc-sdk)
[![license](https://img.shields.io/npm/l/flare-oracle-kit-poc-sdk)](https://github.com/XXIX-labs/flare-oracle-kit/blob/main/LICENSE)

---

## What this package does

- **`FlareOracle` class** — fetch live prices from FTSO v2 with a single method call
- **bytes21 feed ID encoding** — encode any symbol to Flare's on-chain bytes21 format
- **Static feed registry** — 70+ pre-encoded crypto, forex, and commodity feeds built in
- **Multi-network** — Flare mainnet, Coston2 testnet, Songbird, Coston
- **Fee-forward ready** — always estimates and forwards the FTSO fee (currently 0 wei, but your code won't break when Flare activates fees)
- **Dual output** — ESM + CJS + TypeScript declarations — works in Node.js, Bun, Vite, and Next.js

---

## Installation

```bash
npm install flare-oracle-kit-poc-sdk
```

> **No extra installs needed.** `ethers` v6 is bundled as a dependency and installs automatically.
> If you already use ethers in your project, npm/pnpm deduplication will share the instance.

---

## Quick Start

```typescript
import { FlareOracle } from "flare-oracle-kit-poc-sdk";

const oracle = new FlareOracle({ network: "flare" });

// Single price — one line
const price = await oracle.getPrice("FLR/USD");

console.log(price.value);     // → 0.023400  (normalized float, ready to display)
console.log(price.rawValue);  // → 234000n   (uint256 directly from the contract)
console.log(price.decimals);  // → 7         (int8, can be negative on some feeds)
console.log(price.age);       // → 2         (seconds since last oracle update)
console.log(price.feedId);    // → "0x01464c522f55534400000000000000000000000000"
```

---

## Batch Prices (most efficient)

```typescript
import { FlareOracle, formatPrice } from "flare-oracle-kit-poc-sdk";

const oracle = new FlareOracle({ network: "flare" });

// One contract call — any number of symbols
const prices = await oracle.getPrices(["BTC/USD", "ETH/USD", "FLR/USD", "XRP/USD", "SOL/USD"]);

for (const p of prices) {
  console.log(`${p.symbol.padEnd(9)} $${formatPrice(p.value, 4)}`);
}
// BTC/USD   $95423.1200
// ETH/USD   $3412.8800
// FLR/USD   $0.0234
// XRP/USD   $2.3410
// SOL/USD   $178.4300
```

---

## PriceFeed Type

Every `getPrice()` and `getPrices()` call returns a `PriceFeed`:

```typescript
interface PriceFeed {
  symbol: string;    // "FLR/USD"
  feedId: string;    // "0x01464c522f55534400000000000000000000000000" (bytes21 hex)
  value: number;     // normalized float: rawValue / 10^|decimals|
  rawValue: bigint;  // uint256 from FTSO contract (use this for on-chain math)
  decimals: number;  // int8 — the decimal offset; can be negative for large prices
  timestamp: number; // unix seconds of the last oracle update block
  age: number;       // seconds elapsed since timestamp (computed at fetch time)
  network: string;   // "flare" | "coston2" | "songbird" | "coston"
}
```

---

## Full API Reference

### `new FlareOracle(config)`

```typescript
const oracle = new FlareOracle({
  network: "flare",         // "flare" | "coston2" | "songbird" | "coston"
  rpcUrl: "https://...",    // optional: override the built-in public RPC
  provider: myProvider,     // optional: bring your own ethers.js Provider (highest priority)
});
```

### `oracle.getPrice(symbol): Promise<PriceFeed>`

Fetch a single feed. Automatically resolves the bytes21 feed ID and estimates + forwards the FTSO fee.

```typescript
const btc = await oracle.getPrice("BTC/USD");
const eth = await oracle.getPrice("eth/usd"); // case-insensitive
```

Throws `FeedNotFoundError` if the symbol isn't in the registry.
Throws `ContractCallError` if the RPC or contract call fails.

### `oracle.getPrices(symbols[]): Promise<PriceFeed[]>`

Batch fetch — single `getFeedsById` contract call regardless of how many symbols you pass.
Always prefer this over calling `getPrice()` N times.

```typescript
const [btc, eth, flr] = await oracle.getPrices(["BTC/USD", "ETH/USD", "FLR/USD"]);
```

### `oracle.getFeedId(symbol): string`

Pure bytes21 encoding — **no network call**. Use this to get the feed ID for Solidity contracts or logging.

```typescript
const feedId = oracle.getFeedId("FLR/USD");
// → "0x01464c522f55534400000000000000000000000000"
```

### `oracle.listFeeds(category?): FeedInfo[]`

Enumerate all known feeds from the static registry — **no network call**.

```typescript
const all         = oracle.listFeeds();               // all 70+ feeds
const crypto      = oracle.listFeeds("crypto");        // crypto only
const forex       = oracle.listFeeds("forex");         // forex pairs
const commodities = oracle.listFeeds("commodity");     // gold, silver, oil...
const stocks      = oracle.listFeeds("stock");         // equity feeds
```

### `oracle.estimateFee(feedId): Promise<bigint>`

Estimates the wei fee required for a `getFeedById` call via the Flare FeeCalculator contract.
Returns `0n` on all live networks currently. Always call this and forward the result to avoid future breakage.

```typescript
const feedId = oracle.getFeedId("BTC/USD");
const fee = await oracle.estimateFee(feedId);
// → 0n on Flare mainnet today
```

### `oracle.getContractAddress(name): Promise<string>`

Resolves any Flare contract by name through the on-chain `FlareContractRegistry`. Results are cached in-process.

```typescript
const ftsoV2Addr  = await oracle.getContractAddress("FtsoV2");
const feeCalcAddr = await oracle.getContractAddress("FeeCalculator");
const wFLRAddr    = await oracle.getContractAddress("WNat");
```

### `oracle.getNetwork(): NetworkConfig`

```typescript
const net = oracle.getNetwork();
console.log(net.name);    // "flare"
console.log(net.chainId); // 14
console.log(net.rpcUrl);  // "https://flare-api.flare.network/ext/C/rpc"
```

---

## Standalone Utilities

These work without instantiating `FlareOracle`:

```typescript
import {
  encodeFeedId,
  decodeFeedId,
  formatPrice,
  getFeedInfo,
  feedExists,
  feedCount,
} from "flare-oracle-kit-poc-sdk";

// Encode any symbol to bytes21
const feedId = encodeFeedId("FLR/USD", "crypto");
// → "0x01464c522f55534400000000000000000000000000"

// Decode bytes21 back to human-readable
const { category, symbol } = decodeFeedId("0x01464c522f55534400000000000000000000000000");
// → { category: "crypto", symbol: "FLR/USD" }

// Format for display
console.log(formatPrice(0.023400));       // → "0.023400"
console.log(formatPrice(95423.12, 2));    // → "95423.12"

// Registry lookups (no network)
const info = getFeedInfo("BTC/USD");      // → { symbol, feedId, category }
const exists = feedExists("ETH/USD");     // → true
const total = feedCount();                // → 70+
```

---

## Error Handling

All errors are typed and carry structured fields:

```typescript
import {
  FeedNotFoundError,
  NetworkNotSupportedError,
  ContractCallError,
  StalePriceError,
  InvalidFeedIdError,
} from "flare-oracle-kit-poc-sdk";

try {
  const price = await oracle.getPrice("DOGE/USD");
} catch (err) {
  if (err instanceof FeedNotFoundError) {
    console.log(err.symbol);   // "DOGE/USD"
    console.log(err.message);  // "Feed not found: DOGE/USD"
  }

  if (err instanceof ContractCallError) {
    console.log(err.contract); // "FtsoV2"
    console.log(err.method);   // "getFeedById"
    console.log(err.cause);    // underlying Error
  }

  if (err instanceof NetworkNotSupportedError) {
    console.log(err.network);  // "polygon" (unsupported)
  }
}
```

---

## Custom Provider

Works with any ethers.js v6 provider — WebSocket, Alchemy, Infura, local node:

```typescript
import { FlareOracle } from "flare-oracle-kit-poc-sdk";
import { WebSocketProvider } from "ethers";

const provider = new WebSocketProvider("wss://flare-api.flare.network/ext/bc/C/ws");
const oracle = new FlareOracle({ network: "flare", provider });

const price = await oracle.getPrice("FLR/USD");
await provider.destroy();
```

---

## Supported Networks

| Network | Chain ID | Default RPC |
|---------|----------|-------------|
| **Flare** (mainnet) | 14 | `https://flare-api.flare.network/ext/C/rpc` |
| **Coston2** (testnet) | 114 | `https://coston2-api.flare.network/ext/C/rpc` |
| **Songbird** | 19 | `https://songbird-api.flare.network/ext/C/rpc` |
| **Coston** | 16 | `https://coston-api.flare.network/ext/C/rpc` |

> `FlareContractRegistry` is deployed at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
> on all four networks — the only hardcoded address in this SDK.
> All other contract addresses (FtsoV2, FeeCalculator) are resolved on-chain at runtime.

---

## Available Feed Categories

| Category | Example Symbols |
|----------|----------------|
| `"crypto"` | BTC/USD, ETH/USD, FLR/USD, XRP/USD, SOL/USD, BNB/USD, AVAX/USD, MATIC/USD, DOT/USD, ADA/USD, ... |
| `"forex"` | EUR/USD, GBP/USD, JPY/USD, AUD/USD, CHF/USD, CAD/USD, ... |
| `"commodity"` | XAU/USD (Gold), XAG/USD (Silver), WTI (Oil), ... |
| `"stock"` | Select equities (where available on the network) |

```typescript
const feeds = oracle.listFeeds("crypto");
feeds.forEach(f => console.log(f.symbol, f.feedId));
```

---

## CommonJS Usage

```javascript
const { FlareOracle } = require("flare-oracle-kit-poc-sdk");

async function main() {
  const oracle = new FlareOracle({ network: "flare" });
  const price = await oracle.getPrice("FLR/USD");
  console.log(price.value);
}

main();
```

---

## Companion Package

Use with **[flare-oracle-kit-poc-contracts](https://www.npmjs.com/package/flare-oracle-kit-poc-contracts)** for Solidity integration:
- `FTSOGuard` — abstract base contract with 4 circuit breakers (staleness, deviation, zero-price, fee mismatch)
- `MockFTSOv2` — drop-in FTSO mock for local Hardhat testing
- `OracleVault` — reference DeFi consumer implementation

---

## License

Apache-2.0
