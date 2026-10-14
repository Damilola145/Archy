// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPriceOracle.sol";

/// @title FreeOracle
/// @notice Returns zero price for all registrations. Users only pay gas (in USDC on Arc).
/// @dev Replace via Registrar upgrade when governance adds fees.
contract FreeOracle is IPriceOracle {
    function price(string calldata, uint256)
        external
        pure
        override
        returns (uint256 base, uint256 premium)
    {
        return (0, 0);
    }
}
