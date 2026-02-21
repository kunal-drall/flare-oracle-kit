// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @notice Minimal ERC20 used ONLY in tests (e.g. as wFLR stand-in for OracleVault).
 *
 * NOT for production use.
 */
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Mints tokens to any address — unrestricted for test convenience
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
