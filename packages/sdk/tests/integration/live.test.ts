/**
 * Live integration tests against Coston2 testnet.
 *
 * These tests are SKIPPED by default to keep CI fast and free from testnet
 * dependencies. Run them manually with:
 *
 *   LIVE_TEST=1 pnpm --filter @flare-oracle-kit/sdk test:integration
 *
 * Requirements:
 *   - Network access to https://coston2-api.flare.network/ext/C/rpc
 *   - Coston2 FTSO v2 must be live (it is — as of Feb 2026)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { FlareOracle } from "../../src/FlareOracle.js";

const SKIP = process.env["LIVE_TEST"] !== "1";

describe.skipIf(SKIP)("FlareOracle live integration (Coston2)", () => {
  let oracle: FlareOracle;

  beforeAll(() => {
    oracle = new FlareOracle({ network: "coston2" });
  });

  it(
    "fetches FLR/USD from live Coston2 FTSO",
    async () => {
      const feed = await oracle.getPrice("FLR/USD");

      expect(feed.symbol).toBe("FLR/USD");
      expect(feed.value).toBeGreaterThan(0);
      expect(feed.rawValue).toBeGreaterThan(0n);
      expect(feed.decimals).toBeGreaterThanOrEqual(0);
      expect(feed.timestamp).toBeGreaterThan(0);
      expect(feed.age).toBeGreaterThanOrEqual(0);
      expect(feed.age).toBeLessThan(600); // Not older than 10 minutes
      expect(feed.network).toBe("coston2");
      expect(feed.feedId).toBe("0x01464c522f55534400000000000000000000000000");
    },
    30_000
  );

  it(
    "fetches BTC/USD from live Coston2 FTSO",
    async () => {
      const feed = await oracle.getPrice("BTC/USD");
      expect(feed.symbol).toBe("BTC/USD");
      expect(feed.value).toBeGreaterThan(1000); // BTC is > $1000
      expect(feed.age).toBeLessThan(600);
    },
    30_000
  );

  it(
    "batch-fetches multiple prices in a single call",
    async () => {
      const feeds = await oracle.getPrices(["FLR/USD", "BTC/USD", "ETH/USD"]);

      expect(feeds).toHaveLength(3);
      expect(feeds.every((f) => f.value > 0)).toBe(true);
      expect(feeds.every((f) => f.age < 600)).toBe(true);
      expect(feeds[0]!.symbol).toBe("FLR/USD");
      expect(feeds[1]!.symbol).toBe("BTC/USD");
      expect(feeds[2]!.symbol).toBe("ETH/USD");
    },
    30_000
  );

  it(
    "getFeedId returns consistent bytes21",
    () => {
      const id = oracle.getFeedId("FLR/USD");
      expect(id).toBe("0x01464c522f55534400000000000000000000000000");
    }
  );

  it(
    "estimateFee returns 0 on Coston2 (current protocol state)",
    async () => {
      const fee = await oracle.estimateFee("0x01464c522f55534400000000000000000000000000");
      expect(fee).toBe(0n);
    },
    15_000
  );

  it(
    "getContractAddress resolves FtsoV2 to a non-zero address",
    async () => {
      const address = await oracle.getContractAddress("FtsoV2");
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(address).not.toBe("0x0000000000000000000000000000000000000000");
    },
    15_000
  );
});
