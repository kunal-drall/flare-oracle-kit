// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title IFTSOGuard
 * @notice Errors and events for the FTSOGuard abstract contract.
 *
 * Consumed by contracts that inherit FTSOGuard to provide type-safe
 * circuit-breaker errors in their test assertions.
 */
interface IFTSOGuard {
    // ── Custom Errors ────────────────────────────────────────────────────────

    /**
     * @notice Price is older than the configured maxStaleness threshold.
     * @param feedId The bytes21 feed ID that triggered the error
     * @param timestamp The last update timestamp of the price
     * @param age Seconds elapsed since the last update
     * @param maxAge Configured maximum allowed age in seconds
     */
    error StalePrice(bytes21 feedId, uint64 timestamp, uint256 age, uint256 maxAge);

    /**
     * @notice Price deviation exceeds the configured threshold.
     * @param feedId The bytes21 feed ID that triggered the error
     * @param currentPrice The latest price value from the oracle
     * @param referencePrice The previously recorded reference price
     * @param deviationBps Actual deviation in basis points
     * @param maxDeviationBps Configured maximum deviation in basis points
     */
    error PriceDeviation(
        bytes21 feedId,
        uint256 currentPrice,
        uint256 referencePrice,
        uint256 deviationBps,
        uint256 maxDeviationBps
    );

    /**
     * @notice Price value is zero or otherwise invalid.
     * @param feedId The bytes21 feed ID that triggered the error
     * @param value The invalid price value (0)
     */
    error InvalidPrice(bytes21 feedId, uint256 value);

    /**
     * @notice msg.value is less than the required FTSO fee.
     * @param required Required fee in wei
     * @param provided Actual msg.value
     */
    error FeeMismatch(uint256 required, uint256 provided);

    // ── Events ───────────────────────────────────────────────────────────────

    /** @notice Emitted when max staleness is updated for a feed */
    event MaxStalenessSet(bytes21 indexed feedId, uint256 maxStaleness);

    /** @notice Emitted when max deviation is updated for a feed */
    event MaxDeviationSet(bytes21 indexed feedId, uint256 maxDeviationBps);
}
