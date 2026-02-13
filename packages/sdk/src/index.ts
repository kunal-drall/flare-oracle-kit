// ── Main Class ───────────────────────────────────────────────────────────────
export { FlareOracle } from "./FlareOracle.js";
export type { FlareOracleConfig } from "./FlareOracle.js";

// ── Feed Utilities ───────────────────────────────────────────────────────────
export { encodeFeedId, decodeFeedId } from "./feeds/decoder.js";
export {
  getFeedInfo,
  listFeeds,
  feedExists,
  feedCount,
  feedRegistry,
} from "./feeds/registry.js";

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  PriceFeed,
  FeedInfo,
  FeedCategory,
  DecodedFeed,
} from "./feeds/types.js";

// ── Network ──────────────────────────────────────────────────────────────────
export {
  NETWORK_CONFIGS,
  FLARE_CONTRACT_REGISTRY,
  getNetworkConfig,
} from "./networks/config.js";
export type { NetworkConfig } from "./networks/config.js";

// ── Contract ABIs ─────────────────────────────────────────────────────────────
export { FTSO_V2_ABI, FEE_CALCULATOR_ABI, REGISTRY_ABI } from "./networks/contracts.js";

// ── Utils ────────────────────────────────────────────────────────────────────
export { normalizePriceValue, formatPrice } from "./utils/decimals.js";

// ── Errors ───────────────────────────────────────────────────────────────────
export {
  FeedNotFoundError,
  NetworkNotSupportedError,
  ContractCallError,
  StalePriceError,
  InvalidFeedIdError,
} from "./utils/errors.js";
