// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ArcNameRegistry.sol";

/// @title ArcResolver v3
/// @notice Stores address and text records for arc.name names.
///
/// Security fixes vs v2:
///   C2: records are keyed by (node, generation). When a name is transferred or
///       re-registered the registry bumps generation, automatically invalidating
///       all prior records without any explicit clear step.
///       addr() defaults to ownerOf(node) when no explicit record exists for
///       the current generation, removing the need for a separate "link" tx after mint.
contract ArcResolver is Ownable {

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotAuthorised(bytes32 node);
    error ZeroAddress();

    // ─── Events ──────────────────────────────────────────────────────────────

    event AddrChanged(bytes32 indexed node, address addr);
    event TextChanged(bytes32 indexed node, string indexed key, string value);

    // ─── Constants ────────────────────────────────────────────────────────────

    uint8 public constant VERSION = 3;

    // ─── Storage ──────────────────────────────────────────────────────────────

    ArcNameRegistry public immutable registry;

    /// @notice (node, generation) → address record
    mapping(bytes32 => mapping(uint256 => address)) private _addrs;

    /// @notice (node, generation) → key → text record
    mapping(bytes32 => mapping(uint256 => mapping(string => string))) private _texts;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _owner, address _registry) Ownable(_owner) {
        if (_registry == address(0)) revert ZeroAddress();
        registry = ArcNameRegistry(_registry);
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Set the address record for a name.
    function setAddr(bytes32 node, address a) external {
        _authorise(node);
        uint256 gen = registry.generation(node);
        _addrs[node][gen] = a;
        emit AddrChanged(node, a);
    }

    /// @notice Set a text record for a name.
    function setText(bytes32 node, string calldata key, string calldata value) external {
        _authorise(node);
        uint256 gen = registry.generation(node);
        _texts[node][gen][key] = value;
        emit TextChanged(node, key, value);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Resolve addr for node.
    ///         C2: returns explicit record for current generation when set,
    ///         otherwise falls back to ownerOf — so a freshly minted name
    ///         already resolves without a separate setAddr tx.
    function addr(bytes32 node) external view returns (address) {
        uint256 gen = registry.generation(node);
        address explicit = _addrs[node][gen];
        if (explicit != address(0)) return explicit;
        // Default: ownerOf (may revert if node not minted — caller should guard)
        try registry.ownerOf(uint256(node)) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        uint256 gen = registry.generation(node);
        return _texts[node][gen][key];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _authorise(bytes32 node) internal view {
        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);
        uint256 tokenId = uint256(node);
        address owner;
        try registry.ownerOf(tokenId) returns (address o) { owner = o; } catch { owner = address(0); }
        if (owner == address(0)) revert NotAuthorised(node);
        if (msg.sender != owner && msg.sender != rec.manager) revert NotAuthorised(node);
    }
}
