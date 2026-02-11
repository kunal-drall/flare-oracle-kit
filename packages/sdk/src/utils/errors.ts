/**
 * Thrown when a symbol is not found in the feed registry.
 * @example throw new FeedNotFoundError("UNKNOWN/USD")
 */
export class FeedNotFoundError extends Error {
  readonly symbol: string;

  constructor(symbol: string) {
    super(
      `Feed not found in registry: "${symbol}". ` +
        `Call listFeeds() to see all supported feeds, or use feedExists() to check.`
    );
    this.name = "FeedNotFoundError";
    this.symbol = symbol;
    // Restore prototype chain in TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an unsupported network name is provided.
 */
export class NetworkNotSupportedError extends Error {
  readonly network: string;

  constructor(network: string, supported: string[]) {
    super(
      `Network "${network}" is not supported. ` +
        `Supported networks: ${supported.join(", ")}.`
    );
    this.name = "NetworkNotSupportedError";
    this.network = network;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a contract call (e.g. getFeedById) fails.
 * Wraps the underlying RPC or contract error.
 */
export class ContractCallError extends Error {
  readonly contractName: string;
  readonly method: string;

  constructor(contractName: string, method: string, cause?: unknown) {
    const causeMsg =
      cause instanceof Error ? `: ${cause.message}` : cause != null ? `: ${String(cause)}` : "";
    super(`Contract call failed: ${contractName}.${method}()${causeMsg}`);
    this.name = "ContractCallError";
    this.contractName = contractName;
    this.method = method;
    if (cause) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown by the TypeScript SDK when a price is older than the staleness threshold.
 * (Contrast with the Solidity StalePrice custom error in FTSOGuard.)
 */
export class StalePriceError extends Error {
  readonly symbol: string;
  readonly ageSeconds: number;
  readonly maxStalenessSeconds: number;

  constructor(symbol: string, ageSeconds: number, maxStalenessSeconds: number) {
    super(
      `Price for "${symbol}" is stale: age=${ageSeconds}s exceeds max=${maxStalenessSeconds}s. ` +
        `Fetch a fresh price or increase the staleness threshold.`
    );
    this.name = "StalePriceError";
    this.symbol = symbol;
    this.ageSeconds = ageSeconds;
    this.maxStalenessSeconds = maxStalenessSeconds;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a feedId string is malformed.
 */
export class InvalidFeedIdError extends Error {
  readonly feedId: string;

  constructor(feedId: string, reason: string) {
    super(`Invalid feedId "${feedId}": ${reason}`);
    this.name = "InvalidFeedIdError";
    this.feedId = feedId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
