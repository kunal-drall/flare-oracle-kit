# flare-oracle-kit-poc-contracts

Production-grade Solidity contracts for integrating [Flare Network](https://flare.network) FTSO v2 oracles into your DeFi protocol — with a full-featured mock for local testing.

[![npm version](https://img.shields.io/npm/v/flare-oracle-kit-poc-contracts)](https://www.npmjs.com/package/flare-oracle-kit-poc-contracts)
[![license](https://img.shields.io/npm/l/flare-oracle-kit-poc-contracts)](https://github.com/XXIX-labs/flare-oracle-kit/blob/main/LICENSE)

---

## What's Included

| Contract | Type | Description |
|----------|------|-------------|
| `FTSOGuard` | Abstract base | 4 circuit breakers for safe oracle access |
| `IFtsoV2` | Interface | Mirrors the production FTSO v2 Fast Updates ABI |
| `IFeeCalculator` | Interface | Flare fee estimation interface |
| `IFTSOGuard` | Interface | Custom errors + events for FTSOGuard |
| `MockFTSOv2` | Mock | Full-featured FTSO mock for Hardhat testing |
| `MockFeeCalculator` | Mock | Configurable flat-fee mock |
| `OracleVault` | Example | Reference DeFi consumer using FTSOGuard |

---

## Installation

```bash
npm install flare-oracle-kit-poc-contracts
```

> **No extra installs needed.** `@openzeppelin/contracts` v5 is bundled as a dependency
> and installs automatically.

---

## FTSOGuard — Safe Oracle Access

`FTSOGuard` is an **abstract** Solidity contract. Inherit it in your protocol and call `_getSafePrice()` wherever you need a price. It runs four guards in sequence before returning:

| # | Guard | Reverts with |
|---|-------|-------------|
| 1 | `msg.value >= estimatedFee` | `FeeMismatch(required, provided)` |
| 2 | `price > 0` | `InvalidPrice(feedId, value)` |
| 3 | `age <= maxStaleness` | `StalePrice(feedId, timestamp, age, maxAge)` |
| 4 | `|Δprice / reference| <= maxDeviationBps` | `PriceDeviation(feedId, current, reference, deviationBps, maxBps)` |

Excess fee is refunded to `msg.sender` automatically. Deviation check is skipped on the first call (no reference price established yet).

---

## Usage — Inherit FTSOGuard

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "flare-oracle-kit-poc-contracts/contracts/guards/FTSOGuard.sol";

contract MyLendingProtocol is FTSOGuard {
    // bytes21 feed ID: 0x01 (crypto category) + "FLR/USD" UTF-8 zero-padded to 20 bytes
    bytes21 public constant FLR_USD = 0x01464c522f55534400000000000000000000000000;
    bytes21 public constant ETH_USD = 0x014554482f55534400000000000000000000000000;
    bytes21 public constant BTC_USD = 0x014254432f55534400000000000000000000000000;

    constructor(address _ftsoV2) FTSOGuard(_ftsoV2) {
        // Configure per-feed guard parameters
        _setMaxStaleness(FLR_USD, 120);    // 2 minutes max price age
        _setMaxStaleness(ETH_USD, 60);     // 1 minute max price age
        _setMaxStaleness(BTC_USD, 60);

        _setMaxDeviation(FLR_USD, 1000);   // 10% max price jump per update
        _setMaxDeviation(ETH_USD, 500);    // 5% max price jump
        _setMaxDeviation(BTC_USD, 300);    // 3% max price jump
    }

    /// @notice Collateralize against FLR/USD price
    /// @dev Call with msg.value >= estimateFtsoFee() — currently 0 on Flare mainnet
    function depositCollateral(uint256 amount) external payable {
        // _getSafePrice runs all 4 guards. Reverts with typed errors on failure.
        (uint256 rawPrice, int8 decimals) = _getSafePrice(FLR_USD);

        // Normalize: rawPrice / 10^decimals = USD price as float equivalent
        uint256 usdPrice;
        if (decimals >= 0) {
            usdPrice = rawPrice / (10 ** uint256(uint8(decimals)));
        } else {
            usdPrice = rawPrice * (10 ** uint256(uint8(-decimals)));
        }

        // Your protocol logic here...
        uint256 usdValue = (amount * usdPrice) / 1e18;
        _processDeposit(msg.sender, amount, usdValue);
    }
}
```

---

## Guard Configuration

### Per-Feed Staleness

```solidity
// Default: 300 seconds (5 minutes). Override per feed in constructor or governance.
_setMaxStaleness(feedId, 120);    // 2 minutes
_setMaxStaleness(feedId, 0);      // 0 = use DEFAULT_MAX_STALENESS (300s)
```

### Per-Feed Deviation (basis points)

```solidity
// 1 bps = 0.01%, 100 bps = 1%, 1000 bps = 10%
_setMaxDeviation(feedId, 500);    // 5% max move per oracle update
_setMaxDeviation(feedId, 0);      // 0 = deviation check disabled

// Reverts if bps > 10000 (can't set >100%)
```

### Custom Fee Estimation

By default, `_estimateFee()` returns 0 (correct for current Flare mainnet). Override to integrate with the real FeeCalculator:

```solidity
address public feeCalculator;

function _estimateFee(bytes21 feedId) internal view override returns (uint256) {
    // Encode the getFeedsById calldata the FeeCalculator expects
    bytes memory calldata_ = abi.encodeWithSelector(
        bytes4(keccak256("getFeedsById(bytes21[])")),
        _toArray(feedId)
    );
    return IFeeCalculator(feeCalculator).calculateFeeByIds(calldata_);
}
```

### View Helpers

```solidity
// Effective staleness limit (applies DEFAULT if not set per-feed)
uint256 maxAge = myContract.getMaxStaleness(feedId);

// Deviation limit in basis points (0 = check disabled)
uint256 maxBps = myContract.getMaxDeviationBps(feedId);

// Last accepted price — used as reference for deviation calculation
uint256 ref = myContract.getLastKnownPrice(feedId);
```

---

## Error Signatures

```solidity
// Emitted when msg.value < the required FTSO fee
error FeeMismatch(uint256 required, uint256 provided);

// Emitted when the oracle returns value = 0
error InvalidPrice(bytes21 feedId, uint256 value);

// Emitted when the price is older than maxStaleness
error StalePrice(bytes21 feedId, uint64 timestamp, uint256 age, uint256 maxAge);

// Emitted when price moved more than maxDeviationBps from the reference
error PriceDeviation(
    bytes21 feedId,
    uint256 currentPrice,
    uint256 referencePrice,
    uint256 deviationBps,
    uint256 maxDeviationBps
);
```

---

## MockFTSOv2 — Local Testing (Hardhat)

`MockFTSOv2` implements `IFtsoV2` exactly so you can test your contracts locally without any testnet connection. Swap the mock address for the real FTSO address on deploy.

### Deploy in Tests

```typescript
import { ethers } from "hardhat";

const mock = await ethers.deployContract("MockFTSOv2");
const myProtocol = await ethers.deployContract("MyLendingProtocol", [mock.target]);

const FLR_USD = "0x01464c522f55534400000000000000000000000000";
const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
```

### Set Prices

```typescript
// setPrice(feedId, value, decimals, timestamp)
await mock.setPrice(FLR_USD, 100000n, 5, now);   // 1.0 USD (100000 / 10^5)
await mock.setPrice(FLR_USD, 6500000n, 2, now);   // 65000.00 USD

// Set multiple feeds in one tx
await mock.setMultiplePrices(
  [FLR_USD, ETH_USD, BTC_USD],
  [100000n, 350000000n, 6500000000n],
  [5, 4, 2],
  [now, now, now]
);
```

### Simulate Guard Scenarios

```typescript
// Staleness: set timestamp to 0 (or any old value)
await mock.setStale(FLR_USD);
// → StalePrice will fire on any _getSafePrice() call

// Zero price (InvalidPrice guard)
await mock.setZeroPrice(FLR_USD);
// → InvalidPrice will fire

// Advance timestamp without changing price
await mock.advanceTimestamp(FLR_USD, now + 200n);
// → Useful for simulating time passing between updates
```

### Reading Values from Payable Functions

`getFeedById` is `payable` on-chain. In Hardhat tests, use `.staticCall()` to read return values instead of sending a transaction:

```typescript
// ✅ Correct — reads return values
const result = await mock.getFeedById.staticCall(FLR_USD, { value: 0n });
console.log(result._value);      // bigint — raw price
console.log(result._decimals);   // number — int8 decimals
console.log(result._timestamp);  // bigint — unix timestamp

// ❌ Wrong — returns a TransactionResponse, not the price
const tx = await mock.getFeedById(FLR_USD);
```

---

## Testing All Four Circuit Breakers

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MyProtocol guard coverage", function () {
  let mock, protocol;
  const FLR_USD = "0x01464c522f55534400000000000000000000000000";

  beforeEach(async function () {
    mock = await ethers.deployContract("MockFTSOv2");
    protocol = await ethers.deployContract("MyLendingProtocol", [mock.target]);

    // Use EVM block time — not Date.now() — to avoid drift
    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block.timestamp);
    await mock.setPrice(FLR_USD, 100000n, 5, now);
  });

  it("reverts StalePrice when oracle feed is old", async function () {
    const block = await ethers.provider.getBlock("latest");
    const staleTime = BigInt(block.timestamp) - 121n; // older than 120s limit
    await mock.setPrice(FLR_USD, 100000n, 5, staleTime);

    await expect(protocol.depositCollateral(1000n, { value: 0 }))
      .to.be.revertedWithCustomError(protocol, "StalePrice");
  });

  it("reverts InvalidPrice when oracle returns zero", async function () {
    await mock.setZeroPrice(FLR_USD);

    await expect(protocol.depositCollateral(1000n, { value: 0 }))
      .to.be.revertedWithCustomError(protocol, "InvalidPrice");
  });

  it("reverts PriceDeviation when price jumps >10%", async function () {
    // First call establishes reference at 100000
    await protocol.depositCollateral(1000n, { value: 0 });

    // Price jumps 20% — exceeds 10% (1000 bps) limit
    const block = await ethers.provider.getBlock("latest");
    await mock.setPrice(FLR_USD, 120000n, 5, BigInt(block.timestamp));

    await expect(protocol.depositCollateral(1000n, { value: 0 }))
      .to.be.revertedWithCustomError(protocol, "PriceDeviation");
  });

  it("reverts FeeMismatch when msg.value < required fee", async function () {
    // Only relevant when fee > 0 (future-proofing test)
    // Test with a mock that reports a fee requirement
  });
});
```

---

## TypeChain Types

Full TypeChain bindings ship with this package for Hardhat + ethers v6:

```typescript
import { MockFTSOv2, MockFTSOv2__factory } from "flare-oracle-kit-poc-contracts/typechain-types";
import { ethers } from "hardhat";

const factory = new MockFTSOv2__factory(signer);
const mock: MockFTSOv2 = await factory.deploy();

// Fully typed — IDE autocomplete works for all methods and events
```

---

## bytes21 Feed ID Reference

The FTSO v2 protocol identifies feeds with 21-byte identifiers:
`byte[0]` = category, `byte[1..20]` = symbol string UTF-8, zero-padded right.

| Category | Byte | Example |
|----------|------|---------|
| Crypto | `0x01` | `0x01` + `"BTC/USD"` padded |
| Forex | `0x02` | `0x02` + `"EUR/USD"` padded |
| Commodity | `0x03` | `0x03` + `"XAU/USD"` padded |
| Stock | `0x04` | `0x04` + `"TSLA/USD"` padded |

**Common Feed IDs (verified on Flare mainnet)**

| Symbol | bytes21 |
|--------|---------|
| FLR/USD | `0x01464c522f55534400000000000000000000000000` |
| BTC/USD | `0x014254432f55534400000000000000000000000000` |
| ETH/USD | `0x014554482f55534400000000000000000000000000` |
| XRP/USD | `0x015852502f55534400000000000000000000000000` |
| SOL/USD | `0x01534f4c2f55534400000000000000000000000000` |

Use **[flare-oracle-kit-poc-sdk](https://www.npmjs.com/package/flare-oracle-kit-poc-sdk)** to encode any symbol:

```typescript
import { encodeFeedId } from "flare-oracle-kit-poc-sdk";
const feedId = encodeFeedId("FLR/USD", "crypto");
// → "0x01464c522f55534400000000000000000000000000"
```

---

## Hardhat Config

Add this to `hardhat.config.ts` to use TypeChain:

```typescript
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};
```

---

## Companion Package

Use with **[flare-oracle-kit-poc-sdk](https://www.npmjs.com/package/flare-oracle-kit-poc-sdk)** for TypeScript price queries:

```typescript
import { FlareOracle } from "flare-oracle-kit-poc-sdk";

const oracle = new FlareOracle({ network: "flare" });
const price = await oracle.getPrice("FLR/USD");
console.log(price.value); // 0.0234
```

---

## License

Apache-2.0
