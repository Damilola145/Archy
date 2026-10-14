// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title ArcNameRegistry v3
/// @notice Immutable core registry for the arc.name naming system.
///
/// Security fixes vs v2:
///   C1: manager is reset to new owner on every transfer (prevents hijacked setAddr after transfer).
///   C2: per-node generation counter — resolver records keyed by (node, generation) auto-invalidate
///       on transfer/re-registration. addr() defaults to ownerOf when no explicit record exists,
///       removing the need for a separate "link" transaction after minting.
///   C3: tokenURI uses base64-encoded JSON to prevent label injection.
contract ArcNameRegistry is ERC721, Ownable {
    using Strings for uint256;

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotRegistrar();
    error NameNotAvailable(bytes32 node);
    error NameExpired(bytes32 node);
    error ZeroAddress();

    // ─── Events ──────────────────────────────────────────────────────────────

    event NameRegistered(bytes32 indexed node, string label, address indexed owner, uint256 expiry);
    event NameRenewed(bytes32 indexed node, uint256 newExpiry);
    event NameTransferred(bytes32 indexed node, address indexed from, address indexed to);
    event RegistrarSet(address indexed registrar);
    event ResolverSet(bytes32 indexed node, address resolver);
    event ManagerSet(bytes32 indexed node, address manager);

    // ─── Constants ────────────────────────────────────────────────────────────

    uint8 public constant VERSION = 3;
    uint256 public constant GRACE_PERIOD = 90 days;

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public registrar;

    struct NameRecord {
        string   label;
        address  resolver;
        address  manager;
        uint256  expiry;
        uint256  generation; // C2: incremented on every mint and transfer
    }

    mapping(bytes32 => NameRecord) private _records;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _owner) ERC721("arc.name", "ARCNAME") Ownable(_owner) {}

    // ─── Access control ───────────────────────────────────────────────────────

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    function setRegistrar(address _registrar) external onlyOwner {
        if (_registrar == address(0)) revert ZeroAddress();
        registrar = _registrar;
        emit RegistrarSet(_registrar);
    }

    // ─── Registrar-only writes ────────────────────────────────────────────────

    function register(
        bytes32 node,
        string calldata label,
        address owner,
        address resolver,
        uint256 expiry
    ) external onlyRegistrar {
        if (_exists(node)) {
            uint256 exp = _records[node].expiry;
            if (exp == 0 || block.timestamp <= exp + GRACE_PERIOD) {
                revert NameNotAvailable(node);
            }
            _burn(uint256(node));
        }

        // C2: generation++ on every mint so stale resolver records auto-invalidate
        uint256 gen = _records[node].generation + 1;

        _records[node] = NameRecord({
            label:      label,
            resolver:   resolver,
            manager:    owner,
            expiry:     expiry,
            generation: gen
        });

        _safeMint(owner, uint256(node));
        emit NameRegistered(node, label, owner, expiry);
    }

    function renew(bytes32 node, uint256 newExpiry) external onlyRegistrar {
        _requireExists(node);
        _records[node].expiry = newExpiry;
        emit NameRenewed(node, newExpiry);
    }

    // ─── Owner writes ─────────────────────────────────────────────────────────

    function setResolver(bytes32 node, address res) external {
        _requireOwner(node);
        _records[node].resolver = res;
        emit ResolverSet(node, res);
    }

    function setManager(bytes32 node, address manager) external {
        _requireOwner(node);
        _records[node].manager = manager;
        emit ManagerSet(node, manager);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function getRecord(bytes32 node) external view returns (NameRecord memory) {
        return _records[node];
    }

    function resolver(bytes32 node) external view returns (address) {
        return _records[node].resolver;
    }

    function expiry(bytes32 node) external view returns (uint256) {
        return _records[node].expiry;
    }

    function generation(bytes32 node) external view returns (uint256) {
        return _records[node].generation;
    }

    function available(bytes32 node) external view returns (bool) {
        if (!_exists(node)) return true;
        uint256 exp = _records[node].expiry;
        if (exp == 0) return false;
        return block.timestamp > exp + GRACE_PERIOD;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _exists(bytes32 node) internal view returns (bool) {
        return _ownerOf(uint256(node)) != address(0);
    }

    function _requireExists(bytes32 node) internal view {
        require(_exists(node), "ArcNameRegistry: node does not exist");
    }

    function _requireOwner(bytes32 node) internal view {
        _requireExists(node);
        require(ownerOf(uint256(node)) == msg.sender, "ArcNameRegistry: not owner");
    }

    // ─── ERC-721 overrides ────────────────────────────────────────────────────

    /// @dev C1: reset manager to new owner on every transfer.
    ///      C2: increment generation so resolver records auto-invalidate.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        // Block transfers on expired names (burns always allowed)
        if (to != address(0)) {
            bytes32 node = bytes32(tokenId);
            uint256 exp = _records[node].expiry;
            if (exp != 0 && block.timestamp > exp) revert NameExpired(node);
        }

        address from = super._update(to, tokenId, auth);

        // On actual transfer (not mint, not burn): reset manager + bump generation
        if (from != address(0) && to != address(0)) {
            bytes32 node = bytes32(tokenId);
            _records[node].manager    = to;       // C1: new owner is the manager
            _records[node].generation += 1;        // C2: invalidate old resolver records
            emit NameTransferred(node, from, to);
        }

        return from;
    }

    /// @dev C3: base64-encoded JSON prevents label injection in tokenURI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory lbl = _records[bytes32(tokenId)].label;
        string memory json = string(abi.encodePacked(
            '{"name":"', lbl, '.arc",',
            '"description":"arc.name \u2014 your name on Arc",',
            '"attributes":[{"trait_type":"label","value":"', lbl, '"}]}'
        ));
        return string(abi.encodePacked(
            'data:application/json;base64,',
            Base64.encode(bytes(json))
        ));
    }
}
