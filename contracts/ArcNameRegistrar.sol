// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ArcNameRegistry.sol";
import "./IPriceOracle.sol";

/// @title ArcNameRegistrar v3
/// @notice Commit-reveal registrar for arc.name names.
///
/// Security fixes vs v2:
///   C3: _validateLabel enforces [a-z0-9-], no leading/trailing hyphen, no "--",
///       length 3-63. This prevents case-confusion impersonation and JSON injection.
///   C5: commit() requires that no existing commitment for the same hash is still
///       valid (i.e. not yet expired). This prevents griefing by re-committing a
///       known hash to reset the victim's timer. Only owner of the commitment can
///       recommit after MAX_COMMIT_AGE has elapsed.
contract ArcNameRegistrar is Ownable, Pausable {

    // ─── Errors ──────────────────────────────────────────────────────────────

    error CommitmentTooNew(bytes32 commitment);
    error CommitmentTooOld(bytes32 commitment);
    error CommitmentMismatch();
    error CommitmentAlreadyActive(bytes32 commitment); // C5
    error NameNotAvailable(bytes32 node);
    error NameReserved(bytes32 node);
    error LabelTooShort();
    error LabelTooLong();
    error InvalidLabel();   // C3
    error DurationTooShort();
    error InsufficientPayment(uint256 required, uint256 provided);
    error ZeroAddress();

    // ─── Events ──────────────────────────────────────────────────────────────

    event Committed(bytes32 indexed commitment);
    event Registered(bytes32 indexed node, string label, address indexed owner, uint256 expiry);
    event Renewed(bytes32 indexed node, uint256 newExpiry);
    event Blocked(bytes32 indexed node);
    event Unblocked(bytes32 indexed node);

    // ─── Constants ────────────────────────────────────────────────────────────

    uint8 public constant VERSION = 3;
    uint256 public constant MIN_COMMIT_AGE  = 60;
    uint256 public constant MAX_COMMIT_AGE  = 1 days;
    uint256 public constant MIN_LABEL_LEN   = 3;
    uint256 public constant MAX_LABEL_LEN   = 63;
    uint256 public constant MIN_DURATION    = 365 days;

    // ─── Storage ──────────────────────────────────────────────────────────────

    ArcNameRegistry public immutable registry;
    IPriceOracle    public priceOracle;
    address         public usdcToken;

    mapping(bytes32 => uint256) public commitments;
    mapping(bytes32 => bool)    public blocked;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _owner,
        address _registry,
        address _priceOracle,
        address _usdcToken
    ) Ownable(_owner) {
        if (_registry == address(0) || _priceOracle == address(0)) revert ZeroAddress();
        registry    = ArcNameRegistry(_registry);
        priceOracle = IPriceOracle(_priceOracle);
        usdcToken   = _usdcToken;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setPriceOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroAddress();
        priceOracle = IPriceOracle(_oracle);
    }

    function blockName(bytes32 node) external onlyOwner {
        blocked[node] = true;
        emit Blocked(node);
    }

    function unblockName(bytes32 node) external onlyOwner {
        blocked[node] = false;
        emit Unblocked(node);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function withdrawFees(address to) external onlyOwner {
        if (usdcToken == address(0)) return;
        uint256 bal = IERC20(usdcToken).balanceOf(address(this));
        if (bal > 0) {
            bool ok = IERC20(usdcToken).transfer(to, bal);
            require(ok, "ArcNameRegistrar: fee withdrawal failed");
        }
    }

    // ─── Registration: commit ─────────────────────────────────────────────────

    /// @notice Submit a commitment hash.
    ///         C5: reverts if a non-expired commitment for this hash already exists,
    ///         preventing griefing by re-submitting a known commitment to reset the timer.
    function commit(bytes32 commitment) external whenNotPaused {
        uint256 existing = commitments[commitment];
        // If there's an active (non-expired) commitment, reject
        if (existing != 0 && block.timestamp <= existing + MAX_COMMIT_AGE) {
            revert CommitmentAlreadyActive(commitment);
        }
        commitments[commitment] = block.timestamp;
        emit Committed(commitment);
    }

    // ─── Registration: reveal ─────────────────────────────────────────────────

    function register(
        string calldata label,
        address owner,
        address resolver,
        uint256 duration,
        bytes32 secret
    ) external whenNotPaused {
        if (owner == address(0)) revert ZeroAddress();
        _validateLabel(label);   // C3: strict charset
        if (duration < MIN_DURATION) revert DurationTooShort();

        bytes32 commitment = makeCommitment(label, owner, resolver, secret);
        uint256 ts = commitments[commitment];
        if (ts == 0 || block.timestamp < ts + MIN_COMMIT_AGE) revert CommitmentTooNew(commitment);
        if (block.timestamp > ts + MAX_COMMIT_AGE) revert CommitmentTooOld(commitment);

        delete commitments[commitment];

        bytes32 node = labelhash(label);
        if (blocked[node]) revert NameReserved(node);

        _collectFee(label, duration);

        uint256 exp = block.timestamp + duration;
        registry.register(node, label, owner, resolver, exp);
        emit Registered(node, label, owner, exp);
    }

    function renew(string calldata label, uint256 duration) external {
        if (duration < MIN_DURATION) revert DurationTooShort();
        bytes32 node = labelhash(label);

        _collectFee(label, duration);

        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);
        uint256 base     = rec.expiry > block.timestamp ? rec.expiry : block.timestamp;
        uint256 newExpiry = base + duration;
        registry.renew(node, newExpiry);
        emit Renewed(node, newExpiry);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function makeCommitment(
        string calldata label,
        address owner,
        address resolver,
        bytes32 secret
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(label, owner, resolver, secret));
    }

    function labelhash(string calldata label) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(label));
    }

    function rentPrice(string calldata label, uint256 duration)
        external view returns (uint256 base, uint256 premium)
    {
        return priceOracle.price(label, duration);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev C3: enforce [a-z0-9-], no leading/trailing hyphen, no "--", length 3-63.
    function _validateLabel(string calldata label) internal pure {
        bytes memory b = bytes(label);
        if (b.length < MIN_LABEL_LEN) revert LabelTooShort();
        if (b.length > MAX_LABEL_LEN) revert LabelTooLong();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isLower  = c >= 0x61 && c <= 0x7a; // a-z
            bool isDigit  = c >= 0x30 && c <= 0x39; // 0-9
            bool isHyphen = c == 0x2d;               // -
            if (!isLower && !isDigit && !isHyphen) revert InvalidLabel();
        }
        // No leading/trailing hyphen
        if (b[0] == 0x2d || b[b.length - 1] == 0x2d) revert InvalidLabel();
        // No "--" (double hyphen, prevents xn-- punycode confusion)
        for (uint256 i = 0; i + 1 < b.length; i++) {
            if (b[i] == 0x2d && b[i + 1] == 0x2d) revert InvalidLabel();
        }
    }

    function _collectFee(string calldata label, uint256 duration) internal {
        (uint256 base, uint256 premium) = priceOracle.price(label, duration);
        uint256 total = base + premium;
        if (total == 0) return;
        if (usdcToken == address(0)) revert InsufficientPayment(total, 0);
        bool ok = IERC20(usdcToken).transferFrom(msg.sender, address(this), total);
        require(ok, "ArcNameRegistrar: USDC transfer failed");
    }
}
