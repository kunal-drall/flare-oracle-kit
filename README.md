# flare-oracle-kit

The missing developer-experience layer for Flare Network's enshrined FTSO v2 oracles.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`@flare-oracle-kit/sdk`](./packages/sdk) | TypeScript SDK — query FTSO v2 prices in one line | ![npm](https://img.shields.io/npm/v/@flare-oracle-kit/sdk) |
| [`@flare-oracle-kit/contracts`](./packages/contracts) | Solidity — `FTSOGuard`, mocks, and `OracleVault` example | ![npm](https://img.shields.io/npm/v/@flare-oracle-kit/contracts) |

## Why flare-oracle-kit?

Flare's FTSO v2 Fast Updates protocol provides block-latency price feeds, but working with it directly requires:

- Knowing the FlareContractRegistry address and resolving contracts on-chain
- Encoding bytes21 feed IDs (1 byte category + 20 bytes padded symbol)
- Estimating and forwarding fees for each oracle call
- Implementing staleness, deviation, and zero-price guards before trusting any price

`flare-oracle-kit` handles all of this. The TypeScript SDK gets you live prices in one line; the Solidity library gives your contracts production-grade oracle safety out of the box.

## Quick Start — TypeScript

```bash
npm install @flare-oracle-kit/sdk ethers
```

```typescript
import { FlareOracle } from "@flare-oracle-kit/sdk";

const oracle = new FlareOracle({ network: "flare" });
const price = await oracle.getPrice("FLR/USD");
console.log(price.value);  // 0.023400 (normalized float)
```

## Quick Start — Solidity

```bash
npm install @flare-oracle-kit/contracts @openzeppelin/contracts
```

```solidity
import "@flare-oracle-kit/contracts/contracts/guards/FTSOGuard.sol";

contract MyProtocol is FTSOGuard {
    bytes21 constant FLR_USD = 0x01464c522f55534400000000000000000000000000;

    constructor(address _ftsoV2) FTSOGuard(_ftsoV2) {
        _setMaxStaleness(FLR_USD, 120);  // 2 minute freshness limit
        _setMaxDeviation(FLR_USD, 500);  // 5% deviation limit
    }

    function myAction() external payable {
        (uint256 price, int8 decimals) = _getSafePrice(FLR_USD);
        // price is validated: non-zero, fresh, within deviation limits
    }
}
```

## Monorepo Structure

```
flare-oracle-kit/
├── packages/
│   ├── sdk/                      @flare-oracle-kit/sdk
│   │   └── src/
│   │       ├── FlareOracle.ts    Primary class
│   │       ├── feeds/            bytes21 encoder, registry (70+ feeds)
│   │       ├── networks/         Chain configs, contract resolution
│   │       ├── providers/        Cached ethers.js JsonRpcProvider
│   │       └── utils/            Errors, decimals, fee estimation
│   ├── contracts/                @flare-oracle-kit/contracts
│   │   └── contracts/
│   │       ├── interfaces/       IFtsoV2, IFeeCalculator, IFTSOGuard
│   │       ├── guards/           FTSOGuard (abstract, 4 circuit breakers)
│   │       ├── mocks/            MockFTSOv2, MockFeeCalculator
│   │       └── examples/         OracleVault (DeFi consumer demo)
│   └── examples/
│       └── basic-price-fetch/    Runnable example
└── .github/workflows/
    ├── ci.yml                    Lint → typecheck → test → build
    └── publish.yml               Publish on v* tags
```

## Development

```bash
# Install all workspace dependencies
pnpm install

# Run all tests
pnpm test

# Build all packages (SDK: ESM+CJS+DTS; Contracts: Hardhat compile)
pnpm build

# Lint TypeScript sources
pnpm lint

# Type-check without emitting
pnpm typecheck
```

### Running the Example

```bash
pnpm --filter basic-price-fetch dev
```

### Live Integration Tests (SDK)

```bash
LIVE_TEST=1 pnpm --filter @flare-oracle-kit/sdk test
```

Runs against Coston2 testnet — requires a working internet connection.

## Circuit Breakers (Solidity)

`FTSOGuard` applies four validation steps in order on every `_getSafePrice()` call:

| Step | Guard | Custom Error |
|------|-------|-------------|
| 1 | `msg.value >= estimatedFee` | `FeeMismatch(required, provided)` |
| 2 | `price > 0` | `InvalidPrice(feedId, value)` |
| 3 | `age <= maxStaleness` | `StalePrice(feedId, ts, age, maxAge)` |
| 4 | `|Δprice| / reference <= maxDeviationBps` | `PriceDeviation(feedId, current, reference, actual, max)` |

Deviation check is skipped on the first call (no reference established yet). Excess fee is refunded to `msg.sender` automatically.

## Architecture Decisions

- **Only hardcoded address**: `FlareContractRegistry` at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` — all other addresses are resolved on-chain at runtime and cached.
- **bytes21 feed IDs**: `category byte (0x01–0x04) + 20 bytes UTF-8 padded symbol` — never rely on the FTSO ABI for symbols, always derive IDs from `encodeFeedId()`.
- **staticCall for payable returns**: `getFeedById` is `payable` — use `.staticCall()` in Hardhat tests to read return values instead of sending a transaction.
- **EVM timestamp in tests**: Use `ethers.provider.getBlock("latest").timestamp` not `Date.now()` — Hardhat automine advances block timestamps per-tx, causing drift in staleness tests.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
