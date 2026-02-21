// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../guards/FTSOGuard.sol";

/**
 * @title ConcreteGuard
 * @notice Minimal concrete implementation of FTSOGuard used ONLY in tests.
 *
 * Exposes all protected internals as public functions so test suites can:
 * - Trigger each circuit-breaker scenario in isolation
 * - Override the estimated fee to test FeeMismatch
 * - Configure staleness and deviation per-feed
 *
 * NOT for production use.
 */
contract ConcreteGuard is FTSOGuard {
    uint256 private _mockFee;

    constructor(address _ftsoV2) FTSOGuard(_ftsoV2) {}

    // ── Test Helpers ──────────────────────────────────────────────────────────

    /// @notice Override the fee returned by _estimateFee (default = 0)
    function setMockFee(uint256 fee_) external {
        _mockFee = fee_;
    }

    /// @notice Expose _setMaxStaleness for test configuration
    function configureStaleness(bytes21 feedId, uint256 seconds_) external {
        _setMaxStaleness(feedId, seconds_);
    }

    /// @notice Expose _setMaxDeviation for test configuration
    function configureDeviation(bytes21 feedId, uint256 bps) external {
        _setMaxDeviation(feedId, bps);
    }

    /// @notice Expose _getSafePrice as payable public function
    function safePrice(bytes21 feedId)
        external
        payable
        returns (uint256 value, int8 decimals)
    {
        return _getSafePrice(feedId);
    }

    // ── Override fee estimation ───────────────────────────────────────────────

    function _estimateFee(bytes21 /* feedId */)
        internal
        view
        override
        returns (uint256)
    {
        return _mockFee;
    }
}
