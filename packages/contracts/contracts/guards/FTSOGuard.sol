// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../interfaces/IFtsoV2.sol";
import "../interfaces/IFTSOGuard.sol";

/**
 * @title FTSOGuard
 * @notice Abstract base contract providing safe FTSO v2 price access with
 *         configurable staleness, deviation, and zero-price circuit breakers.
 *
 * ## Design Principles
 *
 * 1. **Abstract**: Inherit this contract — never deploy it standalone.
 *    Inheriting contracts control which addresses and guard parameters are used.
 *
 * 2. **Per-feed configuration**: Different assets need different tolerances.
 *    Crypto prices can move fast; commodities slower. Set per-feed.
 *
 * 3. **Basis points for deviation**: 1 bps = 0.01%, so 500 bps = 5%.
 *    Basis points provide integer precision without floating-point issues.
 *
 * 4. **Fee forwarding**: `_getSafePrice()` checks `msg.value >= requiredFee`
 *    and refunds excess. Callers must forward enough ETH.
 *    Currently fee = 0 on Flare but this future-proofs your contract.
 *
 * 5. **Deviation reference**: On first call, there's no reference price.
 *    The deviation check is skipped until a reference is established.
 *    This prevents false positives on contract initialization.
 *
 * ## Usage
 *
 * ```solidity
 * contract MyProtocol is FTSOGuard {
 *     bytes21 constant FLR_USD = 0x01464c522f55534400000000000000000000000000;
 *
 *     constructor(address _ftsoV2) FTSOGuard(_ftsoV2) {
 *         _setMaxStaleness(FLR_USD, 120);   // 2 minutes
 *         _setMaxDeviation(FLR_USD, 500);   // 5%
 *     }
 *
 *     function getPriceForAction() external payable returns (uint256) {
 *         (uint256 price, int8 decimals) = _getSafePrice(FLR_USD);
 *         return price / (10 ** uint256(uint8(decimals)));
 *     }
 * }
 * ```
 */
abstract contract FTSOGuard is IFTSOGuard {
    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice The FTSO v2 oracle this guard reads from (set in constructor, immutable)
    address internal immutable ftsoV2;

    /// @notice Default maximum price age if not configured per-feed (300 seconds = 5 minutes)
    uint256 public constant DEFAULT_MAX_STALENESS = 300;

    /// @notice Denominator for basis points calculations (10000 bps = 100%)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Per-feed maximum staleness in seconds (0 = use DEFAULT_MAX_STALENESS)
    mapping(bytes21 => uint256) private _maxStaleness;

    /// @notice Per-feed maximum deviation in basis points (0 = deviation check disabled)
    mapping(bytes21 => uint256) private _maxDeviationBps;

    /// @notice Last recorded price per feed — used as deviation reference point
    mapping(bytes21 => uint256) private _lastKnownPrice;

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _ftsoV2) {
        require(_ftsoV2 != address(0), "FTSOGuard: zero address");
        ftsoV2 = _ftsoV2;
    }

    // ── Internal: Safe Price Fetching ─────────────────────────────────────────

    /**
     * @notice Fetches and validates a price from FTSO v2.
     *
     * Validation order:
     * 1. Fee check: msg.value >= required fee (excess refunded)
     * 2. Zero price check: price > 0
     * 3. Staleness check: age <= maxStaleness
     * 4. Deviation check: |new - reference| / reference <= maxDeviationBps (if reference exists)
     *
     * After successful validation, updates the deviation reference price.
     *
     * @param _feedId bytes21 feed ID to fetch
     * @return value  Validated raw price (uint256)
     * @return decimals  Decimal places (int8)
     *
     * @dev Callers must be payable and forward msg.value >= estimateFee()
     */
    function _getSafePrice(bytes21 _feedId)
        internal
        returns (uint256 value, int8 decimals)
    {
        // ── 1. Fee validation and forwarding ─────────────────────────────────
        uint256 requiredFee = _estimateFee(_feedId);
        if (msg.value < requiredFee) {
            revert FeeMismatch(requiredFee, msg.value);
        }

        // ── 2. Call FTSO ──────────────────────────────────────────────────────
        uint64 timestamp;
        {
            // Scope to avoid stack too deep
            bytes4 selector = IFtsoV2.getFeedById.selector;
            (bool success, bytes memory data) = ftsoV2.call{value: requiredFee}(
                abi.encodeWithSelector(selector, _feedId)
            );
            require(success, "FTSOGuard: FTSO call failed");
            (value, decimals, timestamp) = abi.decode(data, (uint256, int8, uint64));
        }

        // ── 3. Zero price check ───────────────────────────────────────────────
        if (value == 0) {
            revert InvalidPrice(_feedId, value);
        }

        // ── 4. Staleness check ────────────────────────────────────────────────
        {
            uint256 maxAge = _maxStaleness[_feedId];
            if (maxAge == 0) maxAge = DEFAULT_MAX_STALENESS;

            uint256 age = block.timestamp - uint256(timestamp);
            if (age > maxAge) {
                revert StalePrice(_feedId, timestamp, age, maxAge);
            }
        }

        // ── 5. Deviation check (only when reference price is established) ─────
        {
            uint256 referencePrice = _lastKnownPrice[_feedId];
            uint256 maxDevBps = _maxDeviationBps[_feedId];

            if (referencePrice != 0 && maxDevBps != 0) {
                uint256 diff = value > referencePrice
                    ? value - referencePrice
                    : referencePrice - value;
                uint256 deviationBps = (diff * BPS_DENOMINATOR) / referencePrice;
                if (deviationBps > maxDevBps) {
                    revert PriceDeviation(
                        _feedId,
                        value,
                        referencePrice,
                        deviationBps,
                        maxDevBps
                    );
                }
            }
        }

        // ── 6. Update reference price ─────────────────────────────────────────
        _lastKnownPrice[_feedId] = value;

        // ── 7. Refund excess fee ──────────────────────────────────────────────
        uint256 excess = msg.value - requiredFee;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "FTSOGuard: fee refund failed");
        }
    }

    // ── Internal: Configuration ───────────────────────────────────────────────

    /**
     * @notice Sets the maximum acceptable price age for a specific feed.
     * @param _feedId bytes21 feed ID
     * @param _seconds Maximum age in seconds (0 = use DEFAULT_MAX_STALENESS)
     */
    function _setMaxStaleness(bytes21 _feedId, uint256 _seconds) internal {
        _maxStaleness[_feedId] = _seconds;
        emit MaxStalenessSet(_feedId, _seconds);
    }

    /**
     * @notice Sets the maximum acceptable price deviation for a specific feed.
     * @param _feedId bytes21 feed ID
     * @param _bps Maximum deviation in basis points (e.g. 500 = 5%)
     *             Set to 0 to disable the deviation check.
     */
    function _setMaxDeviation(bytes21 _feedId, uint256 _bps) internal {
        require(_bps <= BPS_DENOMINATOR, "FTSOGuard: bps exceeds 100%");
        _maxDeviationBps[_feedId] = _bps;
        emit MaxDeviationSet(_feedId, _bps);
    }

    // ── Internal: Fee Estimation ──────────────────────────────────────────────

    /**
     * @notice Estimates the FTSO fee for a single feed.
     * @dev Default implementation returns 0 (current Flare behavior).
     *      Override in subclasses to integrate with the real FeeCalculator.
     *
     * @return Required fee in wei
     */
    function _estimateFee(bytes21 /* _feedId */) internal view virtual returns (uint256) {
        return 0;
    }

    // ── External: View Helpers ────────────────────────────────────────────────

    /**
     * @notice Returns the effective max staleness for a feed (applying default if not set).
     */
    function getMaxStaleness(bytes21 _feedId) external view returns (uint256) {
        uint256 s = _maxStaleness[_feedId];
        return s == 0 ? DEFAULT_MAX_STALENESS : s;
    }

    /**
     * @notice Returns the max deviation in basis points for a feed.
     */
    function getMaxDeviationBps(bytes21 _feedId) external view returns (uint256) {
        return _maxDeviationBps[_feedId];
    }

    /**
     * @notice Returns the last known price used as deviation reference.
     *         Returns 0 if no price has been fetched yet.
     */
    function getLastKnownPrice(bytes21 _feedId) external view returns (uint256) {
        return _lastKnownPrice[_feedId];
    }
}
