import { describe, it, expect } from "vitest";
import { encodeFeedId, decodeFeedId } from "../../src/feeds/decoder.js";

describe("encodeFeedId", () => {
  describe("crypto feeds (0x01)", () => {
    it("encodes FLR/USD correctly", () => {
      expect(encodeFeedId("FLR/USD", "crypto")).toBe(
        "0x01464c522f55534400000000000000000000000000"
      );
    });

    it("encodes BTC/USD correctly", () => {
      expect(encodeFeedId("BTC/USD", "crypto")).toBe(
        "0x014254432f55534400000000000000000000000000"
      );
    });

    it("encodes ETH/USD correctly", () => {
      expect(encodeFeedId("ETH/USD", "crypto")).toBe(
        "0x014554482f55534400000000000000000000000000"
      );
    });

    it("produces a 44-char string (0x + 42 hex chars = 21 bytes)", () => {
      const id = encodeFeedId("FLR/USD", "crypto");
      expect(id).toHaveLength(44);
      expect(id.startsWith("0x")).toBe(true);
    });

    it("category byte is 0x01 for crypto", () => {
      const id = encodeFeedId("FLR/USD", "crypto");
      expect(id.slice(0, 4)).toBe("0x01");
    });
  });

  describe("forex feeds (0x02)", () => {
    it("encodes EUR/USD with 0x02 category prefix", () => {
      const id = encodeFeedId("EUR/USD", "forex");
      expect(id.slice(0, 4)).toBe("0x02");
    });

    it("produces a 44-char string for forex", () => {
      expect(encodeFeedId("GBP/USD", "forex")).toHaveLength(44);
    });
  });

  describe("commodity feeds (0x03)", () => {
    it("encodes XAU/USD with 0x03 category prefix", () => {
      const id = encodeFeedId("XAU/USD", "commodity");
      expect(id.slice(0, 4)).toBe("0x03");
    });
  });

  describe("stock feeds (0x04)", () => {
    it("encodes with 0x04 category prefix", () => {
      const id = encodeFeedId("AAPL/USD", "stock");
      expect(id.slice(0, 4)).toBe("0x04");
    });
  });

  describe("edge cases", () => {
    it("throws if symbol encodes to more than 20 UTF-8 bytes", () => {
      // 21 ASCII chars = 21 bytes, exceeds limit
      expect(() => encodeFeedId("A".repeat(21), "crypto")).toThrow(/maximum is 20/);
    });

    it("accepts exactly 20-byte symbol without throwing", () => {
      expect(() => encodeFeedId("A".repeat(20), "crypto")).not.toThrow();
    });

    it("zero-pads the remaining bytes", () => {
      const id = encodeFeedId("FLR/USD", "crypto");
      // "FLR/USD" = 7 bytes → 13 zero-padding bytes = 26 hex chars
      // Full 20-byte symbol field: 464c522f553344 + 00*13
      expect(id.endsWith("00000000000000000000000000")).toBe(true); // 26 trailing zeros
    });
  });
});

describe("decodeFeedId", () => {
  describe("round-trip: encode → decode", () => {
    it("round-trips FLR/USD crypto", () => {
      const encoded = encodeFeedId("FLR/USD", "crypto");
      const decoded = decodeFeedId(encoded);
      expect(decoded.symbol).toBe("FLR/USD");
      expect(decoded.category).toBe("crypto");
      expect(decoded.categoryByte).toBe(0x01);
      expect(decoded.feedId).toBe(encoded.toLowerCase());
    });

    it("round-trips EUR/USD forex", () => {
      const encoded = encodeFeedId("EUR/USD", "forex");
      const decoded = decodeFeedId(encoded);
      expect(decoded.symbol).toBe("EUR/USD");
      expect(decoded.category).toBe("forex");
      expect(decoded.categoryByte).toBe(0x02);
    });

    it("round-trips XAU/USD commodity", () => {
      const encoded = encodeFeedId("XAU/USD", "commodity");
      const decoded = decodeFeedId(encoded);
      expect(decoded.symbol).toBe("XAU/USD");
      expect(decoded.category).toBe("commodity");
      expect(decoded.categoryByte).toBe(0x03);
    });
  });

  describe("known feed IDs (golden file)", () => {
    it("decodes the canonical FLR/USD feed ID", () => {
      const decoded = decodeFeedId("0x01464c522f55534400000000000000000000000000");
      expect(decoded.symbol).toBe("FLR/USD");
      expect(decoded.category).toBe("crypto");
    });

    it("decodes the canonical BTC/USD feed ID", () => {
      const decoded = decodeFeedId("0x014254432f55534400000000000000000000000000");
      expect(decoded.symbol).toBe("BTC/USD");
    });

    it("decodes the canonical ETH/USD feed ID", () => {
      const decoded = decodeFeedId("0x014554482f55534400000000000000000000000000");
      expect(decoded.symbol).toBe("ETH/USD");
    });
  });

  describe("input normalization", () => {
    it("accepts feedId without 0x prefix", () => {
      const decoded = decodeFeedId("01464c522f55534400000000000000000000000000");
      expect(decoded.symbol).toBe("FLR/USD");
    });

    it("returns feedId in lowercase with 0x prefix", () => {
      const decoded = decodeFeedId("0x01464C522F55534400000000000000000000000000");
      expect(decoded.feedId).toBe("0x01464c522f55534400000000000000000000000000");
    });
  });

  describe("error cases", () => {
    it("throws on invalid length (too short)", () => {
      expect(() => decodeFeedId("0x1234")).toThrow(/Invalid feedId length/);
    });

    it("throws on invalid length (too long)", () => {
      expect(() => decodeFeedId("0x" + "01".repeat(22))).toThrow(/Invalid feedId length/);
    });

    it("throws on unknown category byte 0xff", () => {
      const badId = "0xff" + "00".repeat(20);
      expect(() => decodeFeedId(badId)).toThrow(/Unknown category byte/);
    });

    it("throws on zero category byte 0x00", () => {
      const badId = "0x00" + "00".repeat(20);
      expect(() => decodeFeedId(badId)).toThrow(/Unknown category byte/);
    });
  });
});
