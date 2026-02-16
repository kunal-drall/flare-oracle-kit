import { expect } from "chai";
import { ethers } from "hardhat";
import type { MockFTSOv2 } from "../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers.js";

// Known bytes21 feed IDs (verified against Flare protocol spec)
const FLR_USD_ID = "0x01464c522f55534400000000000000000000000000";
const BTC_USD_ID = "0x014254432f55534400000000000000000000000000";
const ETH_USD_ID = "0x014554482f55534400000000000000000000000000";

/**
 * Helper: calls getFeedById via staticCall (required because the function is `payable`).
 * In tests we want the return values, not a transaction receipt.
 */
async function feedById(mock: MockFTSOv2, feedId: string) {
  return mock.getFeedById.staticCall(feedId, { value: 0n });
}

async function feedsById(mock: MockFTSOv2, feedIds: string[]) {
  return mock.getFeedsById.staticCall(feedIds, { value: 0n });
}

async function feedByIdInWei(mock: MockFTSOv2, feedId: string) {
  return mock.getFeedByIdInWei.staticCall(feedId, { value: 0n });
}

describe("MockFTSOv2", function () {
  let mock: MockFTSOv2;
  let owner: HardhatEthersSigner;
  let nonOwner: HardhatEthersSigner;
  let now: bigint;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("MockFTSOv2");
    mock = (await factory.deploy()) as MockFTSOv2;
    now = BigInt(Math.floor(Date.now() / 1000));
  });

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("deployment", function () {
    it("sets deployer as owner", async function () {
      expect(await mock.owner()).to.equal(owner.address);
    });

    it("returns zeros for uninitialized feeds", async function () {
      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(0n);
      expect(result._decimals).to.equal(0);
      expect(result._timestamp).to.equal(0n);
    });
  });

  // ── setPrice ────────────────────────────────────────────────────────────────
  describe("setPrice()", function () {
    it("stores and retrieves a price via getFeedById", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(100000n);
      expect(result._decimals).to.equal(5);
      expect(result._timestamp).to.equal(now);
    });

    it("emits PriceSet event", async function () {
      await expect(mock.setPrice(FLR_USD_ID, 100000n, 5, now))
        .to.emit(mock, "PriceSet")
        .withArgs(FLR_USD_ID, 100000n, 5, now);
    });

    it("overwrites existing price", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await mock.setPrice(FLR_USD_ID, 200000n, 5, now + 1n);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(200000n);
      expect(result._timestamp).to.equal(now + 1n);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        mock.connect(nonOwner).setPrice(FLR_USD_ID, 100000n, 5, now)
      ).to.be.revertedWithCustomError(mock, "Unauthorized");
    });

    it("handles negative decimals", async function () {
      await mock.setPrice(FLR_USD_ID, 5n, -2, now);
      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(5n);
      expect(result._decimals).to.equal(-2);
    });
  });

  // ── setMultiplePrices ────────────────────────────────────────────────────────
  describe("setMultiplePrices()", function () {
    it("sets multiple prices and retrieves them", async function () {
      await mock.setMultiplePrices(
        [FLR_USD_ID, BTC_USD_ID],
        [100000n, 6500000000n],
        [5, 2],
        [now, now]
      );

      const flr = await feedById(mock, FLR_USD_ID);
      const btc = await feedById(mock, BTC_USD_ID);

      expect(flr._value).to.equal(100000n);
      expect(flr._decimals).to.equal(5);
      expect(btc._value).to.equal(6500000000n);
      expect(btc._decimals).to.equal(2);
    });

    it("reverts with ArrayLengthMismatch when values length differs", async function () {
      await expect(
        mock.setMultiplePrices(
          [FLR_USD_ID, BTC_USD_ID],
          [100000n], // only 1 value for 2 feeds
          [5, 2],
          [now, now]
        )
      ).to.be.revertedWithCustomError(mock, "ArrayLengthMismatch");
    });

    it("reverts with ArrayLengthMismatch when decimals length differs", async function () {
      await expect(
        mock.setMultiplePrices(
          [FLR_USD_ID],
          [100000n],
          [5, 2], // 2 decimals for 1 feed
          [now]
        )
      ).to.be.revertedWithCustomError(mock, "ArrayLengthMismatch");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        mock.connect(nonOwner).setMultiplePrices([FLR_USD_ID], [1n], [5], [now])
      ).to.be.revertedWithCustomError(mock, "Unauthorized");
    });

    it("emits PricesSet event", async function () {
      await expect(mock.setMultiplePrices([FLR_USD_ID], [100000n], [5], [now]))
        .to.emit(mock, "PricesSet");
    });
  });

  // ── getFeedsById ─────────────────────────────────────────────────────────────
  describe("getFeedsById()", function () {
    it("returns arrays for multiple feeds", async function () {
      await mock.setMultiplePrices(
        [FLR_USD_ID, BTC_USD_ID, ETH_USD_ID],
        [100000n, 6500000000n, 350000000n],
        [5, 2, 4],
        [now, now, now]
      );

      const result = await feedsById(mock, [FLR_USD_ID, BTC_USD_ID, ETH_USD_ID]);
      expect(result._values[0]).to.equal(100000n);
      expect(result._values[1]).to.equal(6500000000n);
      expect(result._values[2]).to.equal(350000000n);
      expect(result._decimals[0]).to.equal(5);
      expect(result._decimals[1]).to.equal(2);
      expect(result._timestamp).to.equal(now);
    });

    it("returns latest timestamp across all feeds", async function () {
      const laterTime = now + 100n;
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await mock.setPrice(BTC_USD_ID, 6500000000n, 2, laterTime);

      const result = await feedsById(mock, [FLR_USD_ID, BTC_USD_ID]);
      expect(result._timestamp).to.equal(laterTime);
    });

    it("returns empty arrays for empty input", async function () {
      const result = await feedsById(mock, []);
      expect(result._values).to.have.length(0);
      expect(result._decimals).to.have.length(0);
    });
  });

  // ── advanceTimestamp ─────────────────────────────────────────────────────────
  describe("advanceTimestamp()", function () {
    it("updates timestamp without changing price", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      const laterTime = now + 1000n;
      await mock.advanceTimestamp(FLR_USD_ID, laterTime);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(100000n);    // unchanged
      expect(result._decimals).to.equal(5);        // unchanged
      expect(result._timestamp).to.equal(laterTime); // updated
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        mock.connect(nonOwner).advanceTimestamp(FLR_USD_ID, now)
      ).to.be.revertedWithCustomError(mock, "Unauthorized");
    });
  });

  // ── setStale ──────────────────────────────────────────────────────────────────
  describe("setStale()", function () {
    it("sets timestamp to 0", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await mock.setStale(FLR_USD_ID);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._timestamp).to.equal(0n);
    });

    it("preserves price and decimals", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await mock.setStale(FLR_USD_ID);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(100000n);
      expect(result._decimals).to.equal(5);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        mock.connect(nonOwner).setStale(FLR_USD_ID)
      ).to.be.revertedWithCustomError(mock, "Unauthorized");
    });
  });

  // ── setZeroPrice ──────────────────────────────────────────────────────────────
  describe("setZeroPrice()", function () {
    it("sets price value to 0", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await mock.setZeroPrice(FLR_USD_ID);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._value).to.equal(0n);
    });

    it("preserves decimals and timestamp", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      await mock.setZeroPrice(FLR_USD_ID);

      const result = await feedById(mock, FLR_USD_ID);
      expect(result._decimals).to.equal(5);
      expect(result._timestamp).to.equal(now);
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        mock.connect(nonOwner).setZeroPrice(FLR_USD_ID)
      ).to.be.revertedWithCustomError(mock, "Unauthorized");
    });
  });

  // ── getFeedByIdInWei ─────────────────────────────────────────────────────────
  describe("getFeedByIdInWei()", function () {
    it("normalizes to 18 decimal places (5 decimals → *10^13)", async function () {
      // 100000 with 5 decimals = 1.0 → in 18dp = 1e18
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      const result = await feedByIdInWei(mock, FLR_USD_ID);
      expect(result._value).to.equal(10n ** 18n);
      expect(result._timestamp).to.equal(now);
    });
  });

  // ── getRawFeed ────────────────────────────────────────────────────────────────
  describe("getRawFeed()", function () {
    it("returns complete FeedData struct", async function () {
      await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
      const feed = await mock.getRawFeed(FLR_USD_ID);
      expect(feed.value).to.equal(100000n);
      expect(feed.decimals).to.equal(5);
      expect(feed.timestamp).to.equal(now);
    });
  });

  // ── transferOwnership ────────────────────────────────────────────────────────
  describe("transferOwnership()", function () {
    it("transfers ownership to new address", async function () {
      await mock.transferOwnership(nonOwner.address);
      expect(await mock.owner()).to.equal(nonOwner.address);
    });

    it("new owner can set prices", async function () {
      await mock.transferOwnership(nonOwner.address);
      await expect(mock.connect(nonOwner).setPrice(FLR_USD_ID, 1n, 0, now)).to.not.be.reverted;
    });

    it("old owner cannot set prices after transfer", async function () {
      await mock.transferOwnership(nonOwner.address);
      await expect(mock.setPrice(FLR_USD_ID, 1n, 0, now)).to.be.revertedWithCustomError(
        mock,
        "Unauthorized"
      );
    });
  });
});
