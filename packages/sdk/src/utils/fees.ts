import { Interface, type Contract } from "ethers";

/** ABI fragment for the getFeedsById call — used to encode the fee query calldata */
const FEEDS_BY_ID_IFACE = new Interface([
  "function getFeedsById(bytes21[] calldata _feedIds) external payable",
]);

/**
 * Estimates the fee required to call getFeedsById() with the given feed IDs.
 *
 * The FeeCalculator contract accepts the ABI-encoded calldata for getFeedsById
 * and returns the required ETH fee in wei.
 *
 * Current behavior on Flare: fee is always 0. This function is future-proof —
 * always call it and forward the result as `msg.value`. If Flare activates
 * dynamic fees, your code will continue to work without changes.
 *
 * @param feeCalculatorContract - Instantiated FeeCalculator contract
 * @param feedIds - Array of bytes21 feed ID hex strings
 * @returns Required fee in wei (currently 0n on live networks)
 */
export async function estimateFtsoFee(
  feeCalculatorContract: Contract,
  feedIds: string[]
): Promise<bigint> {
  try {
    const calldata = FEEDS_BY_ID_IFACE.encodeFunctionData("getFeedsById", [feedIds]);
    const fee = (await feeCalculatorContract.calculateFeeByIds(calldata)) as bigint;
    return fee;
  } catch {
    // If the FeeCalculator call fails (e.g., contract unavailable or returns unexpected type),
    // default to 0 — the current correct behavior on Flare mainnet and Coston2.
    return 0n;
  }
}
