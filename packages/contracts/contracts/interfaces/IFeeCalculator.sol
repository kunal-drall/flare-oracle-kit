// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title IFeeCalculator
 * @notice Interface for Flare's FeeCalculator contract.
 *
 * The FeeCalculator determines the ETH fee required for FTSO calls.
 * Current fee is 0 on Flare mainnet, but can change via governance.
 * Always query this before calling payable FTSO functions.
 */
interface IFeeCalculator {
    /**
     * @notice Returns the fee required for a given FTSO call.
     * @param _calldata ABI-encoded calldata of the intended FTSO function call
     *        (e.g., abi.encodeWithSelector(IFtsoV2.getFeedsById.selector, feedIds))
     * @return Required fee in wei
     */
    function calculateFeeByIds(bytes calldata _calldata) external view returns (uint256);
}
