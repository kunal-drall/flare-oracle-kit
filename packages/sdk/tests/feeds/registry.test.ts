import { describe, it, expect } from "vitest";
import { getFeedInfo, listFeeds, feedExists, feedCount, feedRegistry } from "../../src/feeds/registry.js";

describe("feedRegistry", () => {
  it("contains at least 60 feeds", () => {
    expect(feedCount()).toBeGreaterThanOrEqual(60);
  });

  it("keys are uppercase symbols", () => {
    for (const key of feedRegistry.keys()) {
      expect(key).toBe(key.toUpperCase());
    }
  });
});

describe("getFeedInfo", () => {
  it("returns FeedInfo for FLR/USD", () => {
    const info = getFeedInfo("FLR/USD");
    expect(info).toBeDefined();
    expect(info!.symbol).toBe("FLR/USD");
    expect(info!.category).toBe("crypto");
    expect(info!.feedId).toBe("0x01464c522f55534400000000000000000000000000");
  });

  it("is case-insensitive", () => {
    expect(getFeedInfo("flr/usd")).toEqual(getFeedInfo("FLR/USD"));
    expect(getFeedInfo("Flr/USD")).toEqual(getFeedInfo("FLR/USD"));
  });

  it("returns undefined for unknown symbol", () => {
    expect(getFeedInfo("UNKNOWN/USD")).toBeUndefined();
    expect(getFeedInfo("")).toBeUndefined();
  });

  it("returns correct feedId for BTC/USD", () => {
    const info = getFeedInfo("BTC/USD");
    expect(info!.feedId).toBe("0x014254432f55534400000000000000000000000000");
  });

  it("returns correct feedId for ETH/USD", () => {
    const info = getFeedInfo("ETH/USD");
    expect(info!.feedId).toBe("0x014554482f55534400000000000000000000000000");
  });

  it("returns correct category for EUR/USD", () => {
    const info = getFeedInfo("EUR/USD");
    expect(info!.category).toBe("forex");
  });

  it("returns correct category for XAU/USD", () => {
    const info = getFeedInfo("XAU/USD");
    expect(info!.category).toBe("commodity");
  });
});

describe("listFeeds", () => {
  it("returns all feeds when no category filter", () => {
    const feeds = listFeeds();
    expect(feeds.length).toBeGreaterThanOrEqual(60);
  });

  it("returns only crypto feeds when filtered", () => {
    const crypto = listFeeds("crypto");
    expect(crypto.length).toBeGreaterThan(0);
    expect(crypto.every((f) => f.category === "crypto")).toBe(true);
  });

  it("returns only forex feeds when filtered", () => {
    const forex = listFeeds("forex");
    expect(forex.every((f) => f.category === "forex")).toBe(true);
    expect(forex.some((f) => f.symbol === "EUR/USD")).toBe(true);
    expect(forex.some((f) => f.symbol === "GBP/USD")).toBe(true);
  });

  it("returns only commodity feeds when filtered", () => {
    const commodity = listFeeds("commodity");
    expect(commodity.every((f) => f.category === "commodity")).toBe(true);
    expect(commodity.some((f) => f.symbol === "XAU/USD")).toBe(true);
  });

  it("every returned feed has a valid 44-char feedId", () => {
    for (const feed of listFeeds()) {
      expect(feed.feedId).toHaveLength(44);
      expect(feed.feedId.startsWith("0x")).toBe(true);
    }
  });
});

describe("feedExists", () => {
  it("returns true for known symbols", () => {
    expect(feedExists("FLR/USD")).toBe(true);
    expect(feedExists("BTC/USD")).toBe(true);
    expect(feedExists("EUR/USD")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(feedExists("flr/usd")).toBe(true);
    expect(feedExists("FLR/usd")).toBe(true);
  });

  it("returns false for unknown symbols", () => {
    expect(feedExists("UNKNOWN/USD")).toBe(false);
    expect(feedExists("")).toBe(false);
  });
});
