import { NetworkNotSupportedError } from "../utils/errors.js";

/**
 * Configuration for a supported Flare network.
 */
export interface NetworkConfig {
  name: "flare" | "coston2" | "songbird" | "coston";
  chainId: number;
  /** Default public RPC endpoint */
  rpcUrl: string;
  isTestnet: boolean;
  /**
   * FlareContractRegistry address — identical on all Flare networks.
   * This is the ONLY address we hardcode; everything else is resolved through the registry.
   */
  registryAddress: string;
}

/**
 * The FlareContractRegistry is deployed at the same address on every Flare network.
 * Only this address needs to be hardcoded.
 */
export const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

export const NETWORK_CONFIGS: Readonly<Record<string, NetworkConfig>> = {
  flare: {
    name: "flare",
    chainId: 14,
    rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
    isTestnet: false,
    registryAddress: FLARE_CONTRACT_REGISTRY,
  },
  coston2: {
    name: "coston2",
    chainId: 114,
    rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
    isTestnet: true,
    registryAddress: FLARE_CONTRACT_REGISTRY,
  },
  songbird: {
    name: "songbird",
    chainId: 19,
    rpcUrl: "https://songbird-api.flare.network/ext/C/rpc",
    isTestnet: false,
    registryAddress: FLARE_CONTRACT_REGISTRY,
  },
  coston: {
    name: "coston",
    chainId: 16,
    rpcUrl: "https://coston-api.flare.network/ext/C/rpc",
    isTestnet: true,
    registryAddress: FLARE_CONTRACT_REGISTRY,
  },
} as const;

/**
 * Returns the NetworkConfig for a named network.
 * @throws {NetworkNotSupportedError} if the network name is not recognized
 */
export function getNetworkConfig(network: string): NetworkConfig {
  const config = NETWORK_CONFIGS[network];
  if (!config) {
    throw new NetworkNotSupportedError(network, Object.keys(NETWORK_CONFIGS));
  }
  return config;
}
