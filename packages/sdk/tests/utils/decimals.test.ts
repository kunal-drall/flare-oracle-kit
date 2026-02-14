import { describe, it, expect } from "vitest";
import { normalizePriceValue, formatPrice } from "../../src/utils/decimals.js";

describe("normalizePriceValue", () => {
  describe("positive decimals", () => {
    it("normalizes with 5 decimals", () => {
      expect(normalizePriceValue(100000n, 5)).toBeCloseTo(1.0);
    });

    it("normalizes with 7 decimals (typical FTSO precision)", () => {
      expect(normalizePriceValue(234000n, 7)).toBeCloseTo(0.0234);
    });

    it("normalizes BTC-like value with 2 decimals", () => {
      expect(normalizePriceValue(6500000n, 2)).toBeCloseTo(65000.0);
    });

    it("normalizes large raw value", () => {
      expect(normalizePriceValue(999999999n, 8)).toBeCloseTo(9.99999999);
    });
  });

  describe("zero decimals", () => {
    it("returns raw value as number when decimals=0", () => {
      expect(normalizePriceValue(1234n, 0)).toBe(1234);
      expect(normalizePriceValue(0n, 0)).toBe(0);
      expect(normalizePriceValue(1n, 0)).toBe(1);
    });
  });

  describe("negative decimals", () => {
    it("multiplies when decimals=-1", () => {
      expect(normalizePriceValue(5n, -1)).toBe(50);
    });

    it("multiplies when decimals=-2", () => {
      expect(normalizePriceValue(5n, -2)).toBe(500);
    });

    it("multiplies when decimals=-3", () => {
      expect(normalizePriceValue(1n, -3)).toBe(1000);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for zero raw value", () => {
      expect(normalizePriceValue(0n, 5)).toBe(0);
      expect(normalizePriceValue(0n, 0)).toBe(0);
    });

    it("handles very small value with large decimals", () => {
      expect(normalizePriceValue(1n, 10)).toBeCloseTo(0.0000000001);
    });
  });
});

describe("formatPrice", () => {
  it("formats with default 6 decimal places", () => {
    expect(formatPrice(1.23456789)).toBe("1.234568");
  });

  it("formats with custom precision", () => {
    expect(formatPrice(1.23456789, 2)).toBe("1.23");
    expect(formatPrice(65432.1, 2)).toBe("65432.10");
    expect(formatPrice(0.0234, 4)).toBe("0.0234");
  });

  it("formats zero correctly", () => {
    expect(formatPrice(0)).toBe("0.000000");
    expect(formatPrice(0, 2)).toBe("0.00");
  });
});
