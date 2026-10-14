// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPriceOracle
/// @notice Pluggable pricing interface for arc.name registrations.
/// @dev Returns the registration price in USDC (6-decimal units, i.e. 1e6 = $1).
///      The current implementation (FreeOracle) returns 0. Governance can upgrade the
///      Registrar to point at a different oracle that charges by name length / auction.
interface IPriceOracle {
    /// @param label  The plain UTF-8 label (e.g. "alice"), already normalized.
    /// @param duration  Registration duration in seconds.
    /// @return base  Base registration fee in USDC units.
    /// @return premium  Optional premium (e.g. for short names or Dutch auction). Can be 0.
    function price(string calldata label, uint256 duration)
        external
        view
        returns (uint256 base, uint256 premium);
}
