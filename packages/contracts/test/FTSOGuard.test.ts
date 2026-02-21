import { expect } from "chai";
import { ethers } from "hardhat";
import type { ConcreteGuard, MockFTSOv2 } from "../typechain-types/index.js";

// FLR/USD feed ID (bytes21: category 0x01, symbol "FLR/USD" zero-padded)
const FLR_USD_ID = "0x01464c522f55534400000000000000000000000000";

// Helpers -----------------------------------------------------------------

/** Returns the latest EVM block timestamp (NOT JS Date.now which can drift). */
async function evmNow(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

/** staticCall _getSafePrice — returns (value, decimals) without sending ETH */
async function safePriceStatic(
  guard: ConcreteGuard,
  feedId: string,
  value = 0n
) {
  return guard.safePrice.staticCall(feedId, { value });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("FTSOGuard", function () {
  let mock: MockFTSOv2;
  let guard: ConcreteGuard;
  let now: bigint; // EVM block timestamp at end of beforeEach setup

  beforeEach(async function () {
    const MockFTSOv2Factory = await ethers.getContractFactory("MockFTSOv2");
    mock = (await MockFTSOv2Factory.deploy()) as MockFTSOv2;

    const ConcreteGuardFactory = await ethers.getContractFactory("ConcreteGuard");
    guard = (await ConcreteGuardFactory.deploy(mock.target)) as ConcreteGuard;

    // Capture EVM time AFTER all deployment transactions so `now` reflects
    // the Hardhat node's actual block.timestamp (not JS wall clock).
    now = await evmNow();
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("deployment", function () {
    it("stores the ftsoV2 address correctly", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      const [value] = await safePriceStatic(guard, FLR_USD_ID);
      expect(value).to.equal(100000n);
    });

    it("reverts on zero ftsoV2 address", async function () {
      const Factory = await ethers.getContractFactory("ConcreteGuard");
      await expect(
        Factory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("FTSOGuard: zero address");
    });

    it("DEFAULT_MAX_STALENESS is 300", async function () {
      expect(await guard.DEFAULT_MAX_STALENESS()).to.equal(300n);
    });

    it("BPS_DENOMINATOR is 10000", async function () {
      expect(await guard.BPS_DENOMINATOR()).to.equal(10_000n);
    });
  });

  // ── View helpers ───────────────────────────────────────────────────────────

  describe("view helpers", function () {
    it("getMaxStaleness() returns DEFAULT when not configured", async function () {
      expect(await guard.getMaxStaleness(FLR_USD_ID)).to.equal(300n);
    });

    it("getMaxStaleness() returns configured value after configureStaleness()", async function () {
      await guard.configureStaleness(FLR_USD_ID, 60);
      expect(await guard.getMaxStaleness(FLR_USD_ID)).to.equal(60n);
    });

    it("getMaxDeviationBps() returns 0 by default", async function () {
      expect(await guard.getMaxDeviationBps(FLR_USD_ID)).to.equal(0n);
    });

    it("getMaxDeviationBps() returns configured value after configureDeviation()", async function () {
      await guard.configureDeviation(FLR_USD_ID, 500);
      expect(await guard.getMaxDeviationBps(FLR_USD_ID)).to.equal(500n);
    });

    it("getLastKnownPrice() returns 0 before any price fetch", async function () {
      expect(await guard.getLastKnownPrice(FLR_USD_ID)).to.equal(0n);
    });

    it("getLastKnownPrice() returns last fetched price", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n });
      expect(await guard.getLastKnownPrice(FLR_USD_ID)).to.equal(100000n);
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe("happy path", function () {
    it("returns valid price and decimals", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      const [value, decimals] = await safePriceStatic(guard, FLR_USD_ID);
      expect(value).to.equal(100000n);
      expect(decimals).to.equal(5);
    });

    it("updates lastKnownPrice on each successful call", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n });
      expect(await guard.getLastKnownPrice(FLR_USD_ID)).to.equal(100000n);

      const now2 = await evmNow();
      await mock.setPrice(FLR_USD_ID, 105000n, 5, now2);
      await guard.safePrice(FLR_USD_ID, { value: 0n });
      expect(await guard.getLastKnownPrice(FLR_USD_ID)).to.equal(105000n);
    });

    it("emits MaxStalenessSet when configureStaleness() is called", async function () {
      await expect(guard.configureStaleness(FLR_USD_ID, 120))
        .to.emit(guard, "MaxStalenessSet")
        .withArgs(FLR_USD_ID, 120n);
    });

    it("emits MaxDeviationSet when configureDeviation() is called", async function () {
      await expect(guard.configureDeviation(FLR_USD_ID, 500))
        .to.emit(guard, "MaxDeviationSet")
        .withArgs(FLR_USD_ID, 500n);
    });
  });

  // ── Circuit Breaker 1: FeeMismatch ────────────────────────────────────────

  describe("circuit breaker: FeeMismatch", function () {
    const REQUIRED_FEE = ethers.parseEther("0.001");

    beforeEach(async function () {
      await guard.setMockFee(REQUIRED_FEE);
      const freshNow = await evmNow();
      await mock.setPrice(FLR_USD_ID, 100000n, 5, freshNow);
    });

    it("reverts with FeeMismatch when msg.value < required fee", async function () {
      const insufficient = REQUIRED_FEE - 1n;
      await expect(
        guard.safePrice.staticCall(FLR_USD_ID, { value: insufficient })
      )
        .to.be.revertedWithCustomError(guard, "FeeMismatch")
        .withArgs(REQUIRED_FEE, insufficient);
    });

    it("reverts with FeeMismatch when msg.value = 0 and fee > 0", async function () {
      await expect(
        guard.safePrice.staticCall(FLR_USD_ID, { value: 0n })
      )
        .to.be.revertedWithCustomError(guard, "FeeMismatch")
        .withArgs(REQUIRED_FEE, 0n);
    });

    it("succeeds when msg.value == required fee", async function () {
      // Real tx: signer sends REQUIRED_FEE → guard forwards it to payable mock
      // ETH flows: signer → guard (msg.value) → mock (call{value: fee})
      await expect(
        guard.safePrice(FLR_USD_ID, { value: REQUIRED_FEE })
      ).to.not.be.reverted;
      expect(await guard.getLastKnownPrice(FLR_USD_ID)).to.equal(100000n);
    });

    it("succeeds when fee is 0 with msg.value = 0", async function () {
      await guard.setMockFee(0n);
      const [value] = await safePriceStatic(guard, FLR_USD_ID, 0n);
      expect(value).to.equal(100000n);
    });
  });

  // ── Circuit Breaker 2: InvalidPrice (zero price) ──────────────────────────

  describe("circuit breaker: InvalidPrice (zero price)", function () {
    it("reverts with InvalidPrice when FTSO returns value = 0", async function () {
      await mock.setPrice(FLR_USD_ID, 1000n, 5, now);
      await mock.setZeroPrice(FLR_USD_ID);

      await expect(
        safePriceStatic(guard, FLR_USD_ID)
      ).to.be.revertedWithCustomError(guard, "InvalidPrice")
        .withArgs(FLR_USD_ID, 0n);
    });

    it("reverts with InvalidPrice for uninitialized feed (all zeros)", async function () {
      // Feed never set → value=0 → InvalidPrice fires (before staleness check)
      await expect(
        safePriceStatic(guard, FLR_USD_ID)
      ).to.be.revertedWithCustomError(guard, "InvalidPrice");
    });
  });

  // ── Circuit Breaker 3: StalePrice ─────────────────────────────────────────

  describe("circuit breaker: StalePrice", function () {
    it("reverts with StalePrice when price age exceeds DEFAULT_MAX_STALENESS (300s)", async function () {
      const staleTime = now - 301n; // 301 seconds in EVM past → exceeds 300s default
      await mock.setPrice(FLR_USD_ID, 100000n, 5, staleTime);

      await expect(
        safePriceStatic(guard, FLR_USD_ID)
      ).to.be.revertedWithCustomError(guard, "StalePrice");
    });

    it("reverts with StalePrice when price age exceeds configured staleness", async function () {
      await guard.configureStaleness(FLR_USD_ID, 60); // 60s custom limit
      const staleTime = now - 61n;
      await mock.setPrice(FLR_USD_ID, 100000n, 5, staleTime);

      await expect(
        safePriceStatic(guard, FLR_USD_ID)
      ).to.be.revertedWithCustomError(guard, "StalePrice");
    });

    it("succeeds when price age is within configured staleness", async function () {
      await guard.configureStaleness(FLR_USD_ID, 60);
      const freshTime = now - 5n; // 5s old, well within 60s limit
      await mock.setPrice(FLR_USD_ID, 100000n, 5, freshTime);

      const [value] = await safePriceStatic(guard, FLR_USD_ID);
      expect(value).to.equal(100000n);
    });

    it("StalePrice error includes correct feed ID, timestamp, age, maxAge", async function () {
      await guard.configureStaleness(FLR_USD_ID, 60);
      const staleTime = now - 120n; // 120s old, exceeds 60s
      await mock.setPrice(FLR_USD_ID, 100000n, 5, staleTime);

      await expect(safePriceStatic(guard, FLR_USD_ID))
        .to.be.revertedWithCustomError(guard, "StalePrice")
        .withArgs(
          FLR_USD_ID,
          staleTime,
          (age: bigint) => age >= 120n, // age >= 120s
          60n // maxAge
        );
    });
  });

  // ── Circuit Breaker 4: PriceDeviation ────────────────────────────────────

  describe("circuit breaker: PriceDeviation", function () {
    beforeEach(async function () {
      // Configure 10% (1000 bps) max deviation
      await guard.configureDeviation(FLR_USD_ID, 1000);
    });

    it("no deviation check on first call (no reference price yet)", async function () {
      // First call establishes the reference — no deviation error possible
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      const [value] = await safePriceStatic(guard, FLR_USD_ID);
      expect(value).to.equal(100000n);
    });

    it("reverts with PriceDeviation when price increases by more than 10%", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n }); // sets reference to 100000

      // New price 115000 = 15% increase → exceeds 10% limit
      const now2 = await evmNow();
      await mock.setPrice(FLR_USD_ID, 115000n, 5, now2);
      await expect(
        safePriceStatic(guard, FLR_USD_ID)
      ).to.be.revertedWithCustomError(guard, "PriceDeviation");
    });

    it("reverts with PriceDeviation when price decreases by more than 10%", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n }); // reference = 100000

      // New price 85000 = 15% decrease → exceeds 10% limit
      const now2 = await evmNow();
      await mock.setPrice(FLR_USD_ID, 85000n, 5, now2);
      await expect(
        safePriceStatic(guard, FLR_USD_ID)
      ).to.be.revertedWithCustomError(guard, "PriceDeviation");
    });

    it("succeeds when price moves within deviation limit", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n }); // reference = 100000

      // New price 105000 = 5% increase → within 10% limit
      const now2 = await evmNow();
      await mock.setPrice(FLR_USD_ID, 105000n, 5, now2);
      const [value] = await safePriceStatic(guard, FLR_USD_ID);
      expect(value).to.equal(105000n);
    });

    it("deviation check is skipped when maxDeviationBps = 0", async function () {
      await guard.configureDeviation(FLR_USD_ID, 0); // disabled

      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n }); // sets reference

      // Price jumps 50% — should NOT revert (deviation check disabled)
      const now2 = await evmNow();
      await mock.setPrice(FLR_USD_ID, 150000n, 5, now2);
      const [value] = await safePriceStatic(guard, FLR_USD_ID);
      expect(value).to.equal(150000n);
    });

    it("PriceDeviation error includes correct fields", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await guard.safePrice(FLR_USD_ID, { value: 0n }); // reference = 100000

      // 120000 = +20% → deviationBps = (20000 * 10000) / 100000 = 2000
      const now2 = await evmNow();
      await mock.setPrice(FLR_USD_ID, 120000n, 5, now2);
      await expect(safePriceStatic(guard, FLR_USD_ID))
        .to.be.revertedWithCustomError(guard, "PriceDeviation")
        .withArgs(
          FLR_USD_ID,
          120000n, // currentPrice
          100000n, // referencePrice
          2000n,   // deviationBps (20%)
          1000n    // maxDeviationBps (10%)
        );
    });

    it("configureDeviation reverts when bps > 10000", async function () {
      await expect(
        guard.configureDeviation(FLR_USD_ID, 10001)
      ).to.be.revertedWith("FTSOGuard: bps exceeds 100%");
    });
  });
});
