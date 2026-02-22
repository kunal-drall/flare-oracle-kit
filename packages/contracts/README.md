# @flare-oracle-kit/contracts

Solidity contracts for integrating [Flare Network](https://flare.network) FTSO v2 oracles into your DeFi protocol.

## Contents

| Contract | Description |
|----------|-------------|
| `IFtsoV2` | Interface mirroring the production FTSO v2 Fast Updates oracle |
| `IFeeCalculator` | Interface for the Flare fee estimation contract |
| `MockFTSOv2` | Full-featured test mock with staleness/deviation/zero-price helpers |
| `MockFeeCalculator` | Configurable flat-fee mock for testing fee-forwarding paths |
| `FTSOGuard` | Abstract base with four circuit breakers for safe oracle access |
| `OracleVault` | Example DeFi consumer demonstrating FTSOGuard integration |

## Install

```bash
npm install @flare-oracle-kit/contracts @openzeppelin/contracts
# or
pnpm add @flare-oracle-kit/contracts @openzeppelin/contracts
```

## FTSOGuard — Safe Oracle Access

`FTSOGuard` is an abstract Solidity contract that wraps FTSO v2 with production-grade circuit breakers. Inherit it in your protocol contracts.

### Circuit Breakers

| Guard | Custom Error | Description |
|-------|-------------|-------------|
| Fee check | `FeeMismatch(required, provided)` | `msg.value < required fee` |
| Zero price | `InvalidPrice(feedId, value)` | Oracle returned `value = 0` |
| Staleness | `StalePrice(feedId, timestamp, age, maxAge)` | Price older than limit |
| Deviation | `PriceDeviation(feedId, current, reference, deviationBps, maxBps)` | Price moved too far from reference |

### Usage

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@flare-oracle-kit/contracts/contracts/guards/FTSOGuard.sol";

contract MyProtocol is FTSOGuard {
    bytes21 constant FLR_USD = 0x01464c522f55534400000000000000000000000000;

    constructor(address _ftsoV2) FTSOGuard(_ftsoV2) {
        _setMaxStaleness(FLR_USD, 120);  // 2 minutes
        _setMaxDeviation(FLR_USD, 500);  // 5%
    }

    function myAction() external payable {
        // _getSafePrice validates: non-zero, fresh, within deviation limits.
        // Reverts with typed custom errors if any check fails.
        (uint256 price, int8 decimals) = _getSafePrice(FLR_USD);

        // Use price here — it's been validated!
        uint256 normalizedPrice = price / (10 ** uint256(uint8(decimals)));
    }
}
```

### Configuration

```solidity
// Set per-feed staleness (default is 300 seconds)
_setMaxStaleness(feedId, 120);   // 2 minutes

// Set per-feed deviation in basis points (0 = disabled)
_setMaxDeviation(feedId, 1000);  // 10%

// Override fee estimation (default returns 0)
function _estimateFee(bytes21 feedId) internal view override returns (uint256) {
    return myFeeCalculator.calculateFee(feedId);
}
```

### View Helpers

```solidity
uint256 staleness = guard.getMaxStaleness(feedId);     // effective limit (uses default if unset)
uint256 deviation = guard.getMaxDeviationBps(feedId);  // 0 if deviation check disabled
uint256 lastPrice = guard.getLastKnownPrice(feedId);   // reference price for deviation check
```

## MockFTSOv2 — Local Testing

Use `MockFTSOv2` to test all guard scenarios locally without connecting to any testnet.

```typescript
import { ethers } from "hardhat";

const mock = await ethers.deployContract("MockFTSOv2");
const vault = await ethers.deployContract("OracleVault", [wflr.target, mock.target]);

const now = BigInt(Math.floor(Date.now() / 1000));

// Set a fresh, valid price: 1.0 USD/FLR (100000 with 5 decimals)
await mock.setPrice(FLR_USD_ID, 100000n, 5, now);

// Simulate staleness
await mock.setStale(FLR_USD_ID);   // timestamp → 0

// Simulate zero price (circuit breaker test)
await mock.setZeroPrice(FLR_USD_ID);

// Simulate deviation (set 20% higher than reference)
await mock.setPrice(FLR_USD_ID, 120000n, 5, now + 1n);
```

### Payable Functions in Hardhat Tests

`getFeedById` and `getFeedsById` are `payable`. Use `.staticCall()` to read return values:

```typescript
// ✅ Correct — gets return values
const result = await mock.getFeedById.staticCall(feedId, { value: 0n });
console.log(result._value, result._decimals, result._timestamp);

// ❌ Wrong — returns TransactionResponse, not feed data
const tx = await mock.getFeedById(feedId);
```

## Testing Against All Circuit Breakers

```typescript
// FeeMismatch: pass insufficient fee
await expect(vault.withdraw(amount, { value: 0n }))
  .to.be.revertedWithCustomError(vault, "FeeMismatch");

// InvalidPrice: set zero price
await mock.setZeroPrice(feedId);
await expect(vault.withdraw(amount, { value: 0n }))
  .to.be.revertedWithCustomError(vault, "InvalidPrice");

// StalePrice: set old timestamp
await mock.setPrice(feedId, price, decimals, now - 121n);
await expect(vault.withdraw(amount, { value: 0n }))
  .to.be.revertedWithCustomError(vault, "StalePrice");

// PriceDeviation: establish reference, then move 20%
await vault.withdraw(half, { value: 0n });            // establishes reference
await mock.setPrice(feedId, 120000n, 5, now + 1n);   // +20%
await expect(vault.withdraw(half, { value: 0n }))
  .to.be.revertedWithCustomError(vault, "PriceDeviation");
```

## bytes21 Feed IDs

| Symbol | Feed ID |
|--------|---------|
| FLR/USD | `0x01464c522f55534400000000000000000000000000` |
| BTC/USD | `0x014254432f55534400000000000000000000000000` |
| ETH/USD | `0x014554482f55534400000000000000000000000000` |

Use `@flare-oracle-kit/sdk` to encode any symbol: `encodeFeedId("XRP/USD", "crypto")`.

## License

Apache-2.0
