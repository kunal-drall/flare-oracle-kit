import { describe, it, expect } from "vitest";
import {
  FeedNotFoundError,
  NetworkNotSupportedError,
  ContractCallError,
  StalePriceError,
  InvalidFeedIdError,
} from "../../src/utils/errors.js";

describe("FeedNotFoundError", () => {
  it("has correct name and message", () => {
    const err = new FeedNotFoundError("FAKE/USD");
    expect(err.name).toBe("FeedNotFoundError");
    expect(err.message).toContain("FAKE/USD");
    expect(err.symbol).toBe("FAKE/USD");
  });

  it("is instanceof Error", () => {
    expect(new FeedNotFoundError("X")).toBeInstanceOf(Error);
  });
});

describe("NetworkNotSupportedError", () => {
  it("includes network name and supported list", () => {
    const err = new NetworkNotSupportedError("bsc", ["flare", "coston2"]);
    expect(err.name).toBe("NetworkNotSupportedError");
    expect(err.message).toContain("bsc");
    expect(err.message).toContain("flare");
    expect(err.network).toBe("bsc");
  });
});

describe("ContractCallError", () => {
  it("includes contract name and method", () => {
    const err = new ContractCallError("FtsoV2", "getFeedById");
    expect(err.name).toBe("ContractCallError");
    expect(err.message).toContain("FtsoV2");
    expect(err.message).toContain("getFeedById");
    expect(err.contractName).toBe("FtsoV2");
    expect(err.method).toBe("getFeedById");
  });

  it("wraps cause error message", () => {
    const cause = new Error("timeout");
    const err = new ContractCallError("FtsoV2", "getFeedById", cause);
    expect(err.message).toContain("timeout");
    expect(err.cause).toBe(cause);
  });
});

describe("StalePriceError", () => {
  it("includes symbol, age, and max staleness", () => {
    const err = new StalePriceError("FLR/USD", 400, 300);
    expect(err.name).toBe("StalePriceError");
    expect(err.message).toContain("FLR/USD");
    expect(err.ageSeconds).toBe(400);
    expect(err.maxStalenessSeconds).toBe(300);
  });
});

describe("InvalidFeedIdError", () => {
  it("includes feedId and reason", () => {
    const err = new InvalidFeedIdError("0x1234", "too short");
    expect(err.name).toBe("InvalidFeedIdError");
    expect(err.feedId).toBe("0x1234");
    expect(err.message).toContain("too short");
  });
});
