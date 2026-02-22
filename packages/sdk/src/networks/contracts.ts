import { Contract, type Provider } from "ethers";
import { FLARE_CONTRACT_REGISTRY } from "./config.js";
import type { NetworkConfig } from "./config.js";

// ── Minimal ABIs ─────────────────────────────────────────────────────────────
// We use human-readable ABI fragments to avoid bundling the full periphery ABIs.
// These match the interfaces in @flarenetwork/flare-periphery-contracts exactly.

const REGISTRY_ABI = [
  "function getContractAddressByName(string calldata _name) external view returns (address)",
];

const FTSO_V2_ABI = [
  "function getFeedById(bytes21 _feedId) external payable returns (uint256 _value, int8 _decimals, uint64 _timestamp)",
  "function getFeedsById(bytes21[] calldata _feedIds) external payable returns (uint256[] memory _values, int8[] memory _decimals, uint64 _timestamp)",
  "function getFeedByIdInWei(bytes21 _feedId) external payable returns (uint256 _value, uint64 _timestamp)",
];

const FEE_CALCULATOR_ABI = [
  "function calculateFeeByIds(bytes calldata _calldata) external view returns (uint256)",
];

// ── Address Cache ─────────────────────────────────────────────────────────────
// Key format: "<contractName>:<networkName>" → address string
// Cache is scoped to the process lifetime; invalidated on restart.
const _addressCache = new Map<string, string>();

/**
 * Resolves a Flare contract address by name via the FlareContractRegistry.
 * Results are cached in-process — call `clearContractAddressCache()` for tests.
 *
 * @param contractName - e.g. "FtsoV2", "FeeCalculator"
 * @param network - e.g. "flare", "coston2"
 * @param provider - ethers Provider connected to the target network
 */
export async function resolveContractAddress(
  contractName: string,
  network: string,
  provider: Provider
): Promise<string> {
  const cacheKey = `${contractName}:${network}`;
  const cached = _addressCache.get(cacheKey);
  if (cached) return cached;

  const registry = new Contract(FLARE_CONTRACT_REGISTRY, REGISTRY_ABI, provider);
  const address = (await registry.getFunction("getContractAddressByName")(contractName)) as string;

  if (!address || address === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `Contract "${contractName}" not found in FlareContractRegistry on network "${network}". ` +
        `Ensure you are connected to a Flare-compatible network.`
    );
  }

  _addressCache.set(cacheKey, address);
  return address;
}

/**
 * Returns an instantiated FtsoV2 Contract instance, with address resolved
 * from the FlareContractRegistry.
 */
export async function getFtsoV2Contract(
  config: NetworkConfig,
  provider: Provider
): Promise<Contract> {
  const address = await resolveContractAddress("FtsoV2", config.name, provider);
  return new Contract(address, FTSO_V2_ABI, provider);
}

/**
 * Returns an instantiated FeeCalculator Contract instance.
 */
export async function getFeeCalculatorContract(
  config: NetworkConfig,
  provider: Provider
): Promise<Contract> {
  const address = await resolveContractAddress("FeeCalculator", config.name, provider);
  return new Contract(address, FEE_CALCULATOR_ABI, provider);
}

/**
 * Clears the contract address cache.
 * Call this in test teardown to prevent cross-test address state.
 */
export function clearContractAddressCache(): void {
  _addressCache.clear();
}

// Export ABIs for consumers who want to instantiate contracts themselves
export { FTSO_V2_ABI, FEE_CALCULATOR_ABI, REGISTRY_ABI };
