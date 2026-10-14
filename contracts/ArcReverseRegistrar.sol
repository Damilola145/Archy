// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ArcNameRegistry.sol";

/// @title ArcReverseRegistrar v3
/// @notice Stores the primary name (reverse record) for a wallet address.
///
/// Security fix C4 vs v2:
///   setName now verifies that msg.sender actually owns the name they are
///   claiming. Specifically: registry.ownerOf(labelhash(name)) == msg.sender
///   AND the name is not expired. This prevents anyone from setting a primary
///   name they don't own. Empty string clears the record unconditionally.
///   name(addr) returns empty when the caller no longer owns the claimed name.
contract ArcReverseRegistrar is Ownable {

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotNameOwner(string name);
    error ZeroAddress();

    // ─── Events ──────────────────────────────────────────────────────────────

    event NameChanged(address indexed addr, string name);

    // ─── Storage ──────────────────────────────────────────────────────────────

    ArcNameRegistry public immutable registry;
    mapping(address => string) private _names;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _owner, address _registry) Ownable(_owner) {
        if (_registry == address(0)) revert ZeroAddress();
        registry = ArcNameRegistry(_registry);
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Set caller's primary name (label only, e.g. "alice").
    ///         C4: caller must own the name and it must not be expired.
    ///         Pass empty string to clear.
    function setName(string calldata name) external {
        if (bytes(name).length > 0) {
            bytes32 node = keccak256(abi.encodePacked(name));
            // Ownership check
            address tokenOwner;
            try registry.ownerOf(uint256(node)) returns (address o) {
                tokenOwner = o;
            } catch {
                tokenOwner = address(0);
            }
            if (tokenOwner != msg.sender) revert NotNameOwner(name);
            // Expiry check
            uint256 exp = registry.expiry(node);
            if (exp != 0 && block.timestamp > exp) revert NotNameOwner(name);
        }
        _names[msg.sender] = name;
        emit NameChanged(msg.sender, name);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Returns the primary name for addr.
    ///         C4: returns empty when the stored name is no longer owned by addr
    ///         (e.g. transferred away or expired).
    function name(address addr) external view returns (string memory) {
        string memory n = _names[addr];
        if (bytes(n).length == 0) return "";
        bytes32 node = keccak256(abi.encodePacked(n));
        address tokenOwner;
        try registry.ownerOf(uint256(node)) returns (address o) {
            tokenOwner = o;
        } catch {
            return "";
        }
        if (tokenOwner != addr) return "";
        uint256 exp = registry.expiry(node);
        if (exp != 0 && block.timestamp > exp) return "";
        return n;
    }
}
