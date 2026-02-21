// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../guards/FTSOGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OracleVault
 * @notice Example DeFi consumer demonstrating FTSOGuard integration.
 *
 * ## What This Shows
 * - How to inherit FTSOGuard for safe oracle access
 * - Per-feed staleness and deviation configuration
 * - Passing msg.value through to the FTSO fee mechanism
 * - USD-denominated collateral tracking with dynamic FTSO decimals
 *
 * ## Limitations (Intentional — This Is An Example)
 * - No liquidation logic
 * - No interest accrual
 * - Single-asset vault (wFLR only)
 * - Owner controls guard parameters (production would use governance)
 *
 * ## Testing
 * Deploy this with MockFTSOv2 address to test all guard scenarios locally
 * without connecting to any testnet.
 *
 * ```typescript
 * const mock = await MockFTSOv2.deploy();
 * const vault = await OracleVault.deploy(wflr.target, mock.target);
 *
 * // Set a fresh, valid price
 * await mock.setPrice(FLR_USD_ID, 100000n, 5, currentTimestamp);
 *
 * // Deposit wFLR
 * await wflr.approve(vault.target, depositAmount);
 * await vault.deposit(depositAmount);
 *
 * // Withdraw (fetches FTSO price for event logging)
 * await vault.withdraw(depositAmount, { value: 0 });
 * ```
 */
contract OracleVault is FTSOGuard {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────────────────────

    /// @notice FLR/USD feed ID (category 0x01 = crypto, symbol "FLR/USD")
    bytes21 public constant FLR_USD_FEED_ID =
        bytes21(0x01464c522f55534400000000000000000000000000);

    // ── State ─────────────────────────────────────────────────────────────────

    IERC20 public immutable wFLR;
    address public owner;

    /// @notice Tracks each user's deposited wFLR token amount
    mapping(address => uint256) public deposits;

    // ── Events ────────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 usdValueAtWithdrawal);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param _wFLR Address of the wrapped FLR token
     * @param _ftsoV2 Address of the FTSO v2 contract (or MockFTSOv2 for testing)
     */
    constructor(address _wFLR, address _ftsoV2) FTSOGuard(_ftsoV2) {
        require(_wFLR != address(0), "OracleVault: zero wFLR address");
        wFLR = IERC20(_wFLR);
        owner = msg.sender;

        // Configure guard parameters for FLR/USD feed
        _setMaxStaleness(FLR_USD_FEED_ID, 120);   // 2 minutes max staleness
        _setMaxDeviation(FLR_USD_FEED_ID, 1000);  // 10% max deviation per update
    }

    // ── External Functions ────────────────────────────────────────────────────

    /**
     * @notice Deposits wFLR tokens into the vault.
     * @param amount Amount of wFLR tokens to deposit (must be > 0)
     */
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        wFLR.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraws wFLR tokens from the vault.
     *
     * Fetches the current FTSO price to log the USD value at withdrawal time.
     * This demonstrates FTSOGuard integration — the guard will revert if:
     * - The price is stale (older than 2 minutes)
     * - The price deviated more than 10% since last check
     * - The price is zero
     * - msg.value < FTSO fee (currently 0)
     *
     * @param amount Amount of wFLR to withdraw
     */
    function withdraw(uint256 amount) external payable {
        if (amount == 0) revert ZeroAmount();
        if (deposits[msg.sender] < amount)
            revert InsufficientBalance(amount, deposits[msg.sender]);

        // _getSafePrice validates: non-zero, fresh, within deviation limits
        (uint256 rawPrice, int8 priceDecimals) = _getSafePrice(FLR_USD_FEED_ID);

        // Calculate USD value of withdrawn amount for event logging
        uint256 usdValue = _calculateUSDValue(amount, rawPrice, priceDecimals);

        deposits[msg.sender] -= amount;
        wFLR.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, usdValue);
    }

    // ── Owner Configuration ───────────────────────────────────────────────────

    /**
     * @notice Updates the maximum acceptable price staleness.
     * @param seconds_ Maximum price age in seconds
     */
    function setMaxStaleness(uint256 seconds_) external onlyOwner {
        _setMaxStaleness(FLR_USD_FEED_ID, seconds_);
    }

    /**
     * @notice Updates the maximum acceptable price deviation.
     * @param bps Maximum deviation in basis points (e.g. 500 = 5%)
     */
    function setMaxDeviation(uint256 bps) external onlyOwner {
        _setMaxDeviation(FLR_USD_FEED_ID, bps);
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /**
     * @notice Returns the number of wFLR tokens deposited by a user.
     */
    function getDeposit(address user) external view returns (uint256) {
        return deposits[user];
    }

    // ── Internal Helpers ──────────────────────────────────────────────────────

    /**
     * @notice Converts a token amount to USD value using FTSO price data.
     * @dev Handles positive and negative decimal counts.
     *      Does NOT account for wFLR token decimals (simplified for demo).
     *
     * @param tokenAmount Amount of wFLR tokens (assumes 1:1 with FLR for simplicity)
     * @param rawPrice Raw price value from FTSO (uint256)
     * @param priceDecimals Decimal places (int8, can be negative)
     * @return USD value (scaled by 10^18 for precision)
     */
    function _calculateUSDValue(
        uint256 tokenAmount,
        uint256 rawPrice,
        int8 priceDecimals
    ) internal pure returns (uint256) {
        if (priceDecimals >= 0) {
            uint256 divisor = 10 ** uint256(uint8(priceDecimals));
            return (tokenAmount * rawPrice) / divisor;
        } else {
            // Negative decimals: multiply
            uint256 multiplier = 10 ** uint256(uint8(-priceDecimals));
            return tokenAmount * rawPrice * multiplier;
        }
    }

    receive() external payable {}
}
