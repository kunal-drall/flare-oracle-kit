import { ethers, JsonRpcProvider } from "ethers";
import { getNetworkConfig } from "../networks/config.js";

// Module-level provider cache: one provider instance per unique rpcUrl
// This prevents creating a new connection on every getPrice() call
const _providerCache = new Map<string, JsonRpcProvider>();

/**
 * Returns a cached JsonRpcProvider for the given RPC URL.
 * Creates a new instance on first call; subsequent calls return the same object.
 *
 * Uses `staticNetwork` to suppress the automatic `eth_chainId` round-trip
 * that ethers v6 performs on every new provider, saving one RPC call.
 *
 * @param rpcUrl - The JSON-RPC endpoint URL
 * @param chainId - Optional chain ID for staticNetwork optimization
 */
export function getProvider(rpcUrl: string, chainId?: number): JsonRpcProvider {
  let provider = _providerCache.get(rpcUrl);
  if (!provider) {
    const network = chainId ? ethers.Network.from(chainId) : undefined;
    provider = new JsonRpcProvider(
      rpcUrl,
      chainId ? { chainId, name: `flare-${chainId}` } : undefined,
      { staticNetwork: network }
    );
    _providerCache.set(rpcUrl, provider);
  }
  return provider;
}

/**
 * Returns a cached provider for a named network using the default RPC URL.
 */
export function getNetworkProvider(networkName: string): JsonRpcProvider {
  const config = getNetworkConfig(networkName);
  return getProvider(config.rpcUrl, config.chainId);
}

/**
 * Clears the provider cache.
 * Useful in tests to prevent state leaking between test suites.
 */
export function clearProviderCache(): void {
  _providerCache.clear();
}
