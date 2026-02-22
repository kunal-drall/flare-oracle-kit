# @flare-oracle-kit/sdk

TypeScript SDK for reading FTSO v2 price feeds on [Flare Network](https://flare.network).

## Features

- **`FlareOracle` class** — single and batch price fetching via FTSO v2 Fast Updates
- **bytes21 feed ID encoding** — encode any symbol to the Flare protocol's bytes21 format
- **Static feed registry** — 70+ pre-encoded crypto, forex, and commodity feeds
- **Multi-network** — Flare, Coston2, Songbird, Coston
- **Fee-forward compatible** — always estimates and forwards the FTSO fee (currently 0 wei)
- **Dual output** — ESM + CJS + TypeScript declarations

## Install

```bash
npm install @flare-oracle-kit/sdk ethers
# or
pnpm add @flare-oracle-kit/sdk ethers
```

## Quick Start

```typescript
import { FlareOracle, formatPrice } from "@flare-oracle-kit/sdk";

const oracle = new FlareOracle({ network: "flare" });

// Single price
const price = await oracle.getPrice("FLR/USD");
console.log(`FLR/USD: $${formatPrice(price.value)}`);
// → FLR/USD: $0.023400

// Batch query — single contract call
const prices = await oracle.getPrices(["BTC/USD", "ETH/USD", "FLR/USD"]);
for (const p of prices) {
  console.log(`${p.symbol}: $${formatPrice(p.value)}`);
}
```

## PriceFeed Shape

```typescript
interface PriceFeed {
  symbol: string;    // "FLR/USD"
  feedId: string;    // "0x01464c522f55534400000000000000000000000000" (bytes21)
  value: number;     // normalized float: rawValue / 10^decimals
  rawValue: bigint;  // uint256 directly from FTSO contract
  decimals: number;  // int8 from FTSO contract (can be negative)
  timestamp: number; // unix seconds of the last oracle update
  age: number;       // seconds since last oracle update (at fetch time)
  network: string;   // "flare" | "coston2" | ...
}
```

## API

### `new FlareOracle(config)`

```typescript
const oracle = new FlareOracle({
  network: "flare",      // required: "flare" | "songbird" | "coston" | "coston2"
  rpcUrl: "...",         // optional: override default RPC
  provider: myProvider,  // optional: bring your own ethers Provider
});
```

### `oracle.getPrice(symbol)`

Fetches a single feed. Throws `FeedNotFoundError` for unknown symbols.

```typescript
const price = await oracle.getPrice("BTC/USD");
```

### `oracle.getPrices(symbols[])`

Batch fetch — single contract call, more efficient than N × `getPrice()`.

```typescript
const [btc, eth, flr] = await oracle.getPrices(["BTC/USD", "ETH/USD", "FLR/USD"]);
```

### `oracle.getFeedId(symbol)`

Pure bytes21 encoding — no network call.

```typescript
const feedId = oracle.getFeedId("FLR/USD");
// → "0x01464c522f55534400000000000000000000000000"
```

### `oracle.listFeeds(category?)`

Enumerate available feeds. No network call.

```typescript
const all = oracle.listFeeds();
const crypto = oracle.listFeeds("crypto");  // "crypto" | "forex" | "commodity" | "stock"
```

### `oracle.estimateFee(feedId)`

Estimates the wei fee for a `getFeedById` call. Returns `0n` on Flare mainnet currently.

```typescript
const fee = await oracle.estimateFee(oracle.getFeedId("FLR/USD"));
```

## Feed ID Encoding

Flare uses bytes21 feed IDs: `1 byte category + 20 bytes UTF-8 padded symbol`.

```typescript
import { encodeFeedId, decodeFeedId } from "@flare-oracle-kit/sdk";

const feedId = encodeFeedId("FLR/USD", "crypto");
// → "0x01464c522f55534400000000000000000000000000"

const { category, symbol } = decodeFeedId(feedId);
// → { category: "crypto", symbol: "FLR/USD" }
```

## Error Types

```typescript
import {
  FeedNotFoundError,
  NetworkNotSupportedError,
  ContractCallError,
  StalePriceError,
  InvalidFeedIdError,
} from "@flare-oracle-kit/sdk";

try {
  await oracle.getPrice("UNKNOWN/USD");
} catch (err) {
  if (err instanceof FeedNotFoundError) {
    console.log(err.symbol); // "UNKNOWN/USD"
  }
}
```

## Supported Networks

| Network   | Chain ID | Registry Address                             |
|-----------|----------|----------------------------------------------|
| Flare     | 14       | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| Coston2   | 114      | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| Songbird  | 19       | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| Coston    | 16       | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |

The `FlareContractRegistry` address is identical on all networks — it is the only hardcoded address in this SDK. All other contract addresses (FtsoV2, FeeCalculator) are resolved on-chain at runtime and cached in-process.

## License

Apache-2.0
