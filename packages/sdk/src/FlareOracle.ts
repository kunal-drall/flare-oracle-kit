import { type Provider, type Signer, type Contract } from "ethers";
import { getProvider } from "./providers/rpc.js";
import { getNetworkConfig, type NetworkConfig } from "./networks/config.js";
import {
  getFtsoV2Contract,
  getFeeCalculatorContract,
  resolveContractAddress,
} from "./networks/contracts.js";
import { getFeedInfo, listFeeds as _listFeeds } from "./feeds/registry.js";
import { normalizePriceValue } from "./utils/decimals.js";
import { estimateFtsoFee } from "./utils/fees.js";
import { FeedNotFoundError, ContractCallError } from "./utils/errors.js";
import type { PriceFeed, FeedInfo, FeedCategory } from "./feeds/types.js";

/**
 * Configuration for a FlareOracle instance.
 */
export interface FlareOracleConfig {
  /** Target network name */
  network: "flare" | "songbird" | "coston" | "coston2";
  /** Override the default RPC URL for the network */
  rpcUrl?: string;
  /** Bring your own ethers.js Provider (takes precedence over rpcUrl) */
  provider?: Provider;
  /** Signer for future write operations */
  signer?: Signer;
}

/**
 * FlareOracle — the primary developer-facing class for querying FTSO v2 price feeds.
 *
 * @example
 * ```typescript
 * import { FlareOracle } from "@flare-oracle-kit/sdk";
 *
 * const oracle = new FlareOracle({ network: "flare" });
 *
 * // Single price
 * const price = await oracle.getPrice("FLR/USD");
 * console.log(price.value);     // 0.0234  (normalized float)
 * console.log(price.rawValue);  // 234000n (uint256 from contract)
 * console.log(price.decimals);  // 7
 * console.log(price.age);       // 12  (seconds since last oracle update)
 *
 * // Batch query (single contract call, more efficient)
 * const prices = await oracle.getPrices(["BTC/USD", "ETH/USD", "FLR/USD"]);
 *
 * // Feed discovery
 * const cryptoFeeds = oracle.listFeeds("crypto");
 * const flrFeedId = oracle.getFeedId("FLR/USD"); // no network call
 * ```
 */
export class FlareOracle {
  private readonly _config: FlareOracleConfig;
  private readonly _networkConfig: NetworkConfig;
  private readonly _provider: Provider;

  // Lazily initialized, cached after first use
  private _ftsoV2: Contract | null = null;
  private _feeCalculator: Contract | null = null;

  constructor(config: FlareOracleConfig) {
    this._config = config;
    this._networkConfig = getNetworkConfig(config.network);

    if (config.provider) {
      this._provider = config.provider;
    } else {
      const rpcUrl = config.rpcUrl ?? this._networkConfig.rpcUrl;
      this._provider = getProvider(rpcUrl, this._networkConfig.chainId);
    }
  }

  // ── Contract Lazy Accessors ───────────────────────────────────────────────

  private async _ftsoV2Contract(): Promise<Contract> {
    if (!this._ftsoV2) {
      this._ftsoV2 = await getFtsoV2Contract(this._networkConfig, this._provider);
    }
    return this._ftsoV2;
  }

  private async _feeCalculatorContract(): Promise<Contract> {
    if (!this._feeCalculator) {
      this._feeCalculator = await getFeeCalculatorContract(
        this._networkConfig,
        this._provider
      );
    }
    return this._feeCalculator;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetches the current price for a single feed symbol.
   *
   * Automatically estimates and forwards the required FTSO fee (currently 0 on Flare).
   * Always call this even if you expect fee=0 — fees may activate in future protocol upgrades.
   *
   * @param symbol - Human-readable symbol, e.g. "FLR/USD" (case-insensitive)
   * @throws {FeedNotFoundError} if the symbol is not in the registry
   * @throws {ContractCallError} if the RPC or contract call fails
   */
  async getPrice(symbol: string): Promise<PriceFeed> {
    const feedInfo = getFeedInfo(symbol);
    if (!feedInfo) throw new FeedNotFoundError(symbol);

    const contract = await this._ftsoV2Contract();
    const fee = await this.estimateFee(feedInfo.feedId);

    try {
      const result = await contract.getFeedById(feedInfo.feedId, { value: fee });
      const [rawValue, decimals, timestamp] = result as [bigint, number, bigint];
      return this._buildPriceFeed(feedInfo.symbol, feedInfo.feedId, rawValue, decimals, timestamp);
    } catch (err) {
      throw new ContractCallError("FtsoV2", "getFeedById", err);
    }
  }

  /**
   * Fetches prices for multiple feeds in a single contract call.
   * More gas-efficient than calling getPrice() N times.
   *
   * @param symbols - Array of feed symbols (case-insensitive)
   * @throws {FeedNotFoundError} if any symbol is not in the registry
   * @throws {ContractCallError} if the RPC or contract call fails
   */
  async getPrices(symbols: string[]): Promise<PriceFeed[]> {
    if (symbols.length === 0) return [];

    // Validate all symbols before making any network calls
    const feedInfos = symbols.map((sym) => {
      const info = getFeedInfo(sym);
      if (!info) throw new FeedNotFoundError(sym);
      return info;
    });

    const feedIds = feedInfos.map((f) => f.feedId);
    const contract = await this._ftsoV2Contract();
    const feeCalc = await this._feeCalculatorContract();
    const totalFee = await estimateFtsoFee(feeCalc, feedIds);

    try {
      const result = await contract.getFeedsById(feedIds, { value: totalFee });
      const [rawValues, decimalsList, timestamp] = result as [bigint[], number[], bigint];

      return feedInfos.map((info, i) =>
        this._buildPriceFeed(
          info.symbol,
          info.feedId,
          rawValues[i] ?? 0n,
          decimalsList[i] ?? 0,
          timestamp
        )
      );
    } catch (err) {
      throw new ContractCallError("FtsoV2", "getFeedsById", err);
    }
  }

  /**
   * Returns the bytes21 feedId hex string for a symbol.
   * No network call — resolved from the static registry.
   *
   * @throws {FeedNotFoundError} if the symbol is not in the registry
   */
  getFeedId(symbol: string): string {
    const info = getFeedInfo(symbol);
    if (!info) throw new FeedNotFoundError(symbol);
    return info.feedId;
  }

  /**
   * Returns FeedInfo for a symbol from the static registry.
   *
   * @throws {FeedNotFoundError} if the symbol is not in the registry
   */
  async getFeedInfo(symbol: string): Promise<FeedInfo> {
    const info = getFeedInfo(symbol);
    if (!info) throw new FeedNotFoundError(symbol);
    return info;
  }

  /**
   * Fetches the current decimal count for a feed from the contract.
   * Note: decimals can change via governance — never cache or hardcode them.
   *
   * @throws {FeedNotFoundError} if the symbol is not in the registry
   */
  async getDecimals(symbol: string): Promise<number> {
    const feedInfo = getFeedInfo(symbol);
    if (!feedInfo) throw new FeedNotFoundError(symbol);

    const contract = await this._ftsoV2Contract();
    try {
      const result = await contract.getFeedById(feedInfo.feedId, { value: 0n });
      const [, decimals] = result as [bigint, number, bigint];
      return Number(decimals);
    } catch (err) {
      throw new ContractCallError("FtsoV2", "getFeedById", err);
    }
  }

  /**
   * Estimates the wei fee required for a getFeedById call.
   * Currently returns 0n on Flare mainnet and Coston2, but should always be called.
   */
  async estimateFee(feedId: string): Promise<bigint> {
    try {
      const feeCalc = await this._feeCalculatorContract();
      return await estimateFtsoFee(feeCalc, [feedId]);
    } catch {
      return 0n;
    }
  }

  /**
   * Lists all registered feeds, optionally filtered by category.
   * No network call — returns from the static compile-time registry.
   */
  listFeeds(category?: FeedCategory): FeedInfo[] {
    return _listFeeds(category);
  }

  /**
   * Returns the NetworkConfig for this oracle instance.
   */
  getNetwork(): NetworkConfig {
    return this._networkConfig;
  }

  /**
   * Resolves a contract address by name via the FlareContractRegistry.
   * Results are cached in-process.
   *
   * @param name - Contract name, e.g. "FtsoV2", "FeeCalculator", "FlareSystemsProxy"
   */
  async getContractAddress(name: string): Promise<string> {
    return resolveContractAddress(name, this._networkConfig.name, this._provider);
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private _buildPriceFeed(
    symbol: string,
    feedId: string,
    rawValue: bigint,
    decimals: number,
    timestamp: bigint
  ): PriceFeed {
    const ts = Number(timestamp);
    const nowSecs = Math.floor(Date.now() / 1000);

    return {
      symbol,
      feedId,
      value: normalizePriceValue(rawValue, decimals),
      rawValue,
      decimals: Number(decimals),
      timestamp: ts,
      age: nowSecs - ts,
      network: this._networkConfig.name,
    };
  }
}
