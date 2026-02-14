import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareOracle } from "../src/FlareOracle.js";
import {
  FeedNotFoundError,
  ContractCallError,
  NetworkNotSupportedError,
} from "../src/utils/errors.js";
import * as contractsModule from "../src/networks/contracts.js";
import * as rpcModule from "../src/providers/rpc.js";

// ── Mock the contract module ─────────────────────────────────────────────────
vi.mock("../src/networks/contracts.js", () => ({
  getFtsoV2Contract: vi.fn(),
  getFeeCalculatorContract: vi.fn(),
  resolveContractAddress: vi.fn(),
  clearContractAddressCache: vi.fn(),
  FTSO_V2_ABI: [],
  FEE_CALCULATOR_ABI: [],
  REGISTRY_ABI: [],
}));

// Mock the provider factory to avoid real network connections
vi.mock("../src/providers/rpc.js", () => ({
  getProvider: vi.fn(),
  getNetworkProvider: vi.fn(),
  clearProviderCache: vi.fn(),
}));

/** Stable mock provider object — re-used across all tests */
const MOCK_PROVIDER = {
  getNetwork: vi.fn().mockResolvedValue({ chainId: 114n }),
};

// ── Test fixtures ─────────────────────────────────────────────────────────────
const NOW_SEC = Math.floor(Date.now() / 1000);
const MOCK_TIMESTAMP = BigInt(NOW_SEC - 5); // 5 seconds old

function makeMockFtsoV2(
  overrides: Partial<{
    getFeedById: [bigint, number, bigint];
    getFeedsById: [bigint[], number[], bigint];
  }> = {}
) {
  return {
    getFeedById: vi.fn().mockResolvedValue(
      overrides.getFeedById ?? [100000n, 5, MOCK_TIMESTAMP]
    ),
    getFeedsById: vi.fn().mockResolvedValue(
      overrides.getFeedsById ?? [[100000n, 200000n], [5, 8], MOCK_TIMESTAMP]
    ),
  };
}

function makeMockFeeCalc(fee = 0n) {
  return {
    calculateFeeByIds: vi.fn().mockResolvedValue(fee),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("FlareOracle", () => {
  let oracle: FlareOracle;
  let mockFtso: ReturnType<typeof makeMockFtsoV2>;
  let mockFeeCalc: ReturnType<typeof makeMockFeeCalc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFtso = makeMockFtsoV2();
    mockFeeCalc = makeMockFeeCalc();

    // Re-apply all mock implementations after clearAllMocks()
    vi.mocked(rpcModule.getProvider).mockReturnValue(MOCK_PROVIDER as never);
    vi.mocked(contractsModule.getFtsoV2Contract).mockResolvedValue(mockFtso as never);
    vi.mocked(contractsModule.getFeeCalculatorContract).mockResolvedValue(
      mockFeeCalc as never
    );
    vi.mocked(contractsModule.resolveContractAddress).mockResolvedValue(
      "0x1234567890123456789012345678901234567890"
    );

    oracle = new FlareOracle({ network: "coston2" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Constructor ─────────────────────────────────────────────────────────────
  describe("constructor", () => {
    it("creates oracle for coston2", () => {
      const o = new FlareOracle({ network: "coston2" });
      expect(o.getNetwork().name).toBe("coston2");
      expect(o.getNetwork().chainId).toBe(114);
    });

    it("creates oracle for flare mainnet", () => {
      const o = new FlareOracle({ network: "flare" });
      expect(o.getNetwork().name).toBe("flare");
      expect(o.getNetwork().chainId).toBe(14);
    });

    it("throws NetworkNotSupportedError for unknown network", () => {
      expect(() => new FlareOracle({ network: "unknown" as never })).toThrow(
        NetworkNotSupportedError
      );
    });
  });

  // ── getPrice ────────────────────────────────────────────────────────────────
  describe("getPrice()", () => {
    it("returns a PriceFeed with correct structure", async () => {
      const feed = await oracle.getPrice("FLR/USD");

      expect(feed.symbol).toBe("FLR/USD");
      expect(feed.feedId).toBe("0x01464c522f55534400000000000000000000000000");
      expect(feed.rawValue).toBe(100000n);
      expect(feed.decimals).toBe(5);
      expect(feed.network).toBe("coston2");
    });

    it("normalizes the price value correctly", async () => {
      // rawValue=100000, decimals=5 → value=1.0
      const feed = await oracle.getPrice("FLR/USD");
      expect(feed.value).toBeCloseTo(1.0);
    });

    it("returns age > 0 (seconds since timestamp)", async () => {
      const feed = await oracle.getPrice("FLR/USD");
      expect(feed.age).toBeGreaterThan(0);
      expect(feed.age).toBeLessThan(60); // mock timestamp is 5 seconds old
    });

    it("returns age close to 5 for a timestamp 5s ago", async () => {
      const feed = await oracle.getPrice("FLR/USD");
      expect(feed.age).toBeGreaterThanOrEqual(4); // allow 1s tolerance
      expect(feed.age).toBeLessThanOrEqual(10);
    });

    it("throws FeedNotFoundError for unknown symbol", async () => {
      await expect(oracle.getPrice("UNKNOWN/USD")).rejects.toBeInstanceOf(FeedNotFoundError);
    });

    it("throws FeedNotFoundError with the correct symbol", async () => {
      await expect(oracle.getPrice("FAKE/TOKEN")).rejects.toThrow(/FAKE\/TOKEN/);
    });

    it("throws ContractCallError when RPC fails", async () => {
      mockFtso.getFeedById.mockRejectedValue(new Error("RPC timeout"));
      await expect(oracle.getPrice("FLR/USD")).rejects.toBeInstanceOf(ContractCallError);
    });

    it("passes fee=0 as msg.value by default", async () => {
      await oracle.getPrice("FLR/USD");
      expect(mockFtso.getFeedById).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ value: 0n })
      );
    });

    it("is case-insensitive for symbol", async () => {
      const upperFeed = await oracle.getPrice("FLR/USD");
      const lowerFeed = await oracle.getPrice("flr/usd");
      expect(upperFeed.symbol).toBe(lowerFeed.symbol);
    });
  });

  // ── getPrices ───────────────────────────────────────────────────────────────
  describe("getPrices()", () => {
    it("returns an array of PriceFeeds", async () => {
      const feeds = await oracle.getPrices(["FLR/USD", "BTC/USD"]);
      expect(feeds).toHaveLength(2);
    });

    it("calls getFeedsById once (batch optimization)", async () => {
      await oracle.getPrices(["FLR/USD", "BTC/USD"]);
      expect(mockFtso.getFeedsById).toHaveBeenCalledTimes(1);
      expect(mockFtso.getFeedById).not.toHaveBeenCalled();
    });

    it("returns correct symbols in order", async () => {
      const feeds = await oracle.getPrices(["FLR/USD", "BTC/USD"]);
      expect(feeds[0]!.symbol).toBe("FLR/USD");
      expect(feeds[1]!.symbol).toBe("BTC/USD");
    });

    it("returns empty array for empty input", async () => {
      const feeds = await oracle.getPrices([]);
      expect(feeds).toEqual([]);
      expect(mockFtso.getFeedsById).not.toHaveBeenCalled();
    });

    it("throws FeedNotFoundError if any symbol is unknown", async () => {
      await expect(oracle.getPrices(["FLR/USD", "UNKNOWN/USD"])).rejects.toBeInstanceOf(
        FeedNotFoundError
      );
    });

    it("throws ContractCallError when RPC fails", async () => {
      mockFtso.getFeedsById.mockRejectedValue(new Error("Connection refused"));
      await expect(oracle.getPrices(["FLR/USD"])).rejects.toBeInstanceOf(ContractCallError);
    });
  });

  // ── getFeedId ───────────────────────────────────────────────────────────────
  describe("getFeedId()", () => {
    it("returns correct feedId without any network call", () => {
      const id = oracle.getFeedId("FLR/USD");
      expect(id).toBe("0x01464c522f55534400000000000000000000000000");
      // No contract calls should be made
      expect(mockFtso.getFeedById).not.toHaveBeenCalled();
    });

    it("throws FeedNotFoundError for unknown symbol", () => {
      expect(() => oracle.getFeedId("UNKNOWN/USD")).toThrow(FeedNotFoundError);
    });

    it("is case-insensitive", () => {
      expect(oracle.getFeedId("flr/usd")).toBe(oracle.getFeedId("FLR/USD"));
    });
  });

  // ── listFeeds ───────────────────────────────────────────────────────────────
  describe("listFeeds()", () => {
    it("returns all feeds without a network call", () => {
      const feeds = oracle.listFeeds();
      expect(feeds.length).toBeGreaterThan(50);
      expect(mockFtso.getFeedById).not.toHaveBeenCalled();
    });

    it("filters by crypto category", () => {
      const crypto = oracle.listFeeds("crypto");
      expect(crypto.every((f) => f.category === "crypto")).toBe(true);
      expect(crypto.some((f) => f.symbol === "FLR/USD")).toBe(true);
    });

    it("filters by forex category", () => {
      const forex = oracle.listFeeds("forex");
      expect(forex.every((f) => f.category === "forex")).toBe(true);
    });

    it("filters by commodity category", () => {
      const commodities = oracle.listFeeds("commodity");
      expect(commodities.every((f) => f.category === "commodity")).toBe(true);
    });
  });

  // ── getNetwork ──────────────────────────────────────────────────────────────
  describe("getNetwork()", () => {
    it("returns the correct network config", () => {
      const net = oracle.getNetwork();
      expect(net.name).toBe("coston2");
      expect(net.chainId).toBe(114);
      expect(net.isTestnet).toBe(true);
    });
  });

  // ── estimateFee ─────────────────────────────────────────────────────────────
  describe("estimateFee()", () => {
    it("returns 0n when fee calculator returns 0", async () => {
      const fee = await oracle.estimateFee("0x01464c522f55534400000000000000000000000000");
      expect(fee).toBe(0n);
    });

    it("returns 0n when fee calculator throws", async () => {
      vi.mocked(contractsModule.getFeeCalculatorContract).mockRejectedValueOnce(
        new Error("Contract not found")
      );
      const freshOracle = new FlareOracle({ network: "coston2" });
      const fee = await freshOracle.estimateFee(
        "0x01464c522f55534400000000000000000000000000"
      );
      expect(fee).toBe(0n);
    });

    it("propagates non-zero fees from the calculator", async () => {
      const feeCalcWith1Gwei = makeMockFeeCalc(1_000_000_000n); // 1 gwei
      vi.mocked(contractsModule.getFeeCalculatorContract).mockResolvedValue(
        feeCalcWith1Gwei as never
      );
      const freshOracle = new FlareOracle({ network: "coston2" });
      const fee = await freshOracle.estimateFee(
        "0x01464c522f55534400000000000000000000000000"
      );
      expect(fee).toBe(1_000_000_000n);
    });
  });

  // ── getContractAddress ──────────────────────────────────────────────────────
  describe("getContractAddress()", () => {
    it("delegates to resolveContractAddress", async () => {
      const addr = await oracle.getContractAddress("FtsoV2");
      expect(addr).toBe("0x1234567890123456789012345678901234567890");
      expect(contractsModule.resolveContractAddress).toHaveBeenCalledWith(
        "FtsoV2",
        "coston2",
        expect.anything()
      );
    });
  });
});
