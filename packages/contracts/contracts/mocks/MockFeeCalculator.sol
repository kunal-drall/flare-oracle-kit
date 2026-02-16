// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../interfaces/IFeeCalculator.sol";

/**
 * @title MockFeeCalculator
 * @notice Simulates Flare's FeeCalculator for local testing.
 *
 * In production, FeeCalculator.calculateFeeByIds(bytes calldata) returns
 * the fee required for the given FTSO call. This mock returns a configurable
 * flat fee regardless of which feeds are requested.
 *
 * Usage:
 * - Deploy with fee=0 for normal tests (matches current Flare behavior)
 * - setFee(1_000_000_000) to test non-zero fee forwarding
 *
 * Deploy alongside MockFTSOv2 and pass both addresses to your consumer contracts.
 */
contract MockFeeCalculator is IFeeCalculator {
    address public owner;
    uint256 private _fee;

    event FeeSet(uint256 oldFee, uint256 newFee);
    error Unauthorized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /**
     * @param initialFee Initial fee in wei (pass 0 to match current Flare behavior)
     */
    constructor(uint256 initialFee) {
        owner = msg.sender;
        _fee = initialFee;
    }

    /**
     * @notice Returns the configured flat fee.
     * @dev Accepts calldata parameter to match IFeeCalculator signature, but ignores it.
     *      The mock always returns the same fee regardless of which feeds are requested.
     */
    function calculateFeeByIds(bytes calldata /* _calldata */) external view override returns (uint256) {
        return _fee;
    }

    /**
     * @notice Updates the simulated fee amount.
     * @param newFee New fee in wei
     */
    function setFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = _fee;
        _fee = newFee;
        emit FeeSet(oldFee, newFee);
    }

    /**
     * @notice Returns the current configured fee.
     */
    function getFee() external view returns (uint256) {
        return _fee;
    }
}
