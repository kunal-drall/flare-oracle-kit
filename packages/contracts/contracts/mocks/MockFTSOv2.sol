// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../interfaces/IFtsoV2.sol";

/**
 * @title MockFTSOv2
 * @notice A configurable mock implementing IFtsoV2 for local Hardhat testing.
 *
 * Design philosophy:
 * - Implements the EXACT same interface as production FtsoV2Interface.
 *   The same consumer contract works with both mock (testing) and production (mainnet)
 *   with only an address swap.
 * - Owner-only state mutation (setPrice, setMultiplePrices).
 * - Test helpers for staleness and circuit-breaker scenarios (setStale, setZeroPrice).
 * - Emits events on price updates for test assertion convenience.
 *
 * Usage in Hardhat test:
 * ```typescript
 * const MockFTSOv2 = await ethers.getContractFactory("MockFTSOv2");
 * const mock = await MockFTSOv2.deploy();
 * await mock.setPrice(FLR_USD_ID, 100000n, 5, currentTimestamp);
 * // Pass mock.target wherever production FtsoV2 address is expected
 * ```
 */
contract MockFTSOv2 is IFtsoV2 {
    // ── State ─────────────────────────────────────────────────────────────────

    address public owner;

    struct FeedData {
        uint256 value;
        int8 decimals;
        uint64 timestamp;
    }

    mapping(bytes21 => FeedData) private _feeds;

    // ── Events ────────────────────────────────────────────────────────────────

    event PriceSet(
        bytes21 indexed feedId,
        uint256 value,
        int8 decimals,
        uint64 timestamp
    );
    event PricesSet(bytes21[] feedIds, uint256 count);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Custom Errors ─────────────────────────────────────────────────────────

    error Unauthorized();
    error ArrayLengthMismatch();

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ── IFtsoV2 Implementation ────────────────────────────────────────────────

    /**
     * @notice Returns the current price for a single feed.
     * Returns zeros for uninitialized feeds (matching production behavior where
     * an unregistered feedId returns zeros rather than reverting).
     */
    function getFeedById(bytes21 _feedId)
        external
        payable
        override
        returns (uint256 _value, int8 _decimals, uint64 _timestamp)
    {
        FeedData storage feed = _feeds[_feedId];
        return (feed.value, feed.decimals, feed.timestamp);
    }

    /**
     * @notice Returns prices for multiple feeds.
     * Returns the maximum timestamp across all requested feeds.
     */
    function getFeedsById(bytes21[] calldata _feedIds)
        external
        payable
        override
        returns (
            uint256[] memory _values,
            int8[] memory _decimals,
            uint64 _timestamp
        )
    {
        uint256 len = _feedIds.length;
        _values = new uint256[](len);
        _decimals = new int8[](len);
        uint64 latestTimestamp = 0;

        for (uint256 i = 0; i < len; i++) {
            FeedData storage feed = _feeds[_feedIds[i]];
            _values[i] = feed.value;
            _decimals[i] = feed.decimals;
            if (feed.timestamp > latestTimestamp) {
                latestTimestamp = feed.timestamp;
            }
        }
        _timestamp = latestTimestamp;
    }

    /**
     * @notice Returns price normalized to 18 decimal places.
     */
    function getFeedByIdInWei(bytes21 _feedId)
        external
        payable
        override
        returns (uint256 _value, uint64 _timestamp)
    {
        FeedData storage feed = _feeds[_feedId];
        _timestamp = feed.timestamp;

        int8 decimals = feed.decimals;
        if (decimals >= 0) {
            // Most common: divide by 10^decimals, then multiply to 18dp
            // Simplified: assume decimals <= 18
            uint256 scale = 10 ** uint256(uint8(18 - decimals));
            _value = feed.value * scale;
        } else {
            // Negative decimals: divide
            uint256 scale = 10 ** uint256(uint8(-decimals));
            _value = (feed.value * 10 ** 18) / scale;
        }
    }

    // ── Test Setup Functions (Owner Only) ─────────────────────────────────────

    /**
     * @notice Sets price data for a single feed.
     * @param _feedId bytes21 encoded feed ID
     * @param _value  Raw price value (will be returned as-is by getFeedById)
     * @param _decimals  Decimal places (typically 5–8 for FTSO feeds)
     * @param _timestamp  Unix timestamp to use for this price
     */
    function setPrice(
        bytes21 _feedId,
        uint256 _value,
        int8 _decimals,
        uint64 _timestamp
    ) external onlyOwner {
        _feeds[_feedId] = FeedData(_value, _decimals, _timestamp);
        emit PriceSet(_feedId, _value, _decimals, _timestamp);
    }

    /**
     * @notice Batch-sets prices for multiple feeds in one transaction.
     * @dev All arrays must have the same length, otherwise reverts with ArrayLengthMismatch.
     */
    function setMultiplePrices(
        bytes21[] calldata _feedIds,
        uint256[] calldata _values,
        int8[] calldata _decimals,
        uint64[] calldata _timestamps
    ) external onlyOwner {
        uint256 len = _feedIds.length;
        if (
            _values.length != len ||
            _decimals.length != len ||
            _timestamps.length != len
        ) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < len; i++) {
            _feeds[_feedIds[i]] = FeedData(_values[i], _decimals[i], _timestamps[i]);
        }
        emit PricesSet(_feedIds, len);
    }

    /**
     * @notice Sets the timestamp for a feed to a new value.
     * Use to simulate time passing (advancing the timestamp).
     * @param _feedId bytes21 feed ID
     * @param _newTimestamp New timestamp (typically block.timestamp in tests)
     */
    function advanceTimestamp(bytes21 _feedId, uint64 _newTimestamp) external onlyOwner {
        _feeds[_feedId].timestamp = _newTimestamp;
    }

    /**
     * @notice Sets timestamp to 0, simulating a completely stale/uninitialized feed.
     * Use to trigger staleness guards in FTSOGuard.
     */
    function setStale(bytes21 _feedId) external onlyOwner {
        _feeds[_feedId].timestamp = 0;
    }

    /**
     * @notice Sets price value to 0, simulating a zero-price event.
     * Use to trigger the zero-price guard in FTSOGuard.
     */
    function setZeroPrice(bytes21 _feedId) external onlyOwner {
        _feeds[_feedId].value = 0;
    }

    /**
     * @notice Transfers ownership to a new address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MockFTSOv2: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── View Helpers ──────────────────────────────────────────────────────────

    /**
     * @notice Returns the raw FeedData struct for a feedId (useful in tests).
     */
    function getRawFeed(bytes21 _feedId) external view returns (FeedData memory) {
        return _feeds[_feedId];
    }

    receive() external payable {}
}
