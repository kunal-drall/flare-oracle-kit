// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title IFtsoV2
 * @notice Interface for Flare's FTSO v2 (Fast Updates) price feed contract.
 *
 * This interface mirrors the production FtsoV2Interface deployed on Flare Network.
 * It is intentionally kept minimal — only the functions used by flare-oracle-kit.
 *
 * IMPORTANT: getFeedById and getFeedsById are `payable`.
 * Always query IFeeCalculator first and pass the correct fee as msg.value.
 * Current fee is 0 but can change via governance.
 *
 * Source: https://dev.flare.network/ftso/getting-started
 */
interface IFtsoV2 {
    /**
     * @notice Returns the current price for a single feed.
     * @param _feedId bytes21 encoded feed ID (category byte + padded UTF-8 symbol)
     * @return _value  Raw uint256 price value
     * @return _decimals  int8 decimal places (can be negative for very large values)
     * @return _timestamp  uint64 Unix timestamp of last update
     */
    function getFeedById(bytes21 _feedId)
        external
        payable
        returns (uint256 _value, int8 _decimals, uint64 _timestamp);

    /**
     * @notice Returns prices for multiple feeds in one call.
     * @param _feedIds Array of bytes21 feed IDs
     * @return _values  Array of raw uint256 price values (same order as input)
     * @return _decimals  Array of int8 decimal places (same order as input)
     * @return _timestamp  uint64 timestamp (single value, applies to all feeds)
     */
    function getFeedsById(bytes21[] calldata _feedIds)
        external
        payable
        returns (
            uint256[] memory _values,
            int8[] memory _decimals,
            uint64 _timestamp
        );

    /**
     * @notice Returns a price normalized to 18 decimal places (wei-style).
     * @param _feedId bytes21 encoded feed ID
     * @return _value  Price in 18-decimal fixed point
     * @return _timestamp  uint64 Unix timestamp
     */
    function getFeedByIdInWei(bytes21 _feedId)
        external
        payable
        returns (uint256 _value, uint64 _timestamp);
}
