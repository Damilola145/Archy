// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ArcNameRegistry.sol";
import "../ArcNameRegistrar.sol";
import "../ArcResolver.sol";
import "../ArcReverseRegistrar.sol";
import "../FreeOracle.sol";

/// @dev Minimal ERC-20 mock for USDC.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ArcNameTest is Test {
    ArcNameRegistry      registry;
    ArcNameRegistrar     registrar;
    ArcResolver          resolver;
    ArcReverseRegistrar  reverseReg;
    FreeOracle           oracle;
    MockUSDC             usdc;

    address owner = address(0xA11CE);
    address alice = address(0xA1CE);
    address bob   = address(0xB0B);

    bytes32 constant ALICE_SECRET = keccak256("alice-secret");

    function setUp() public {
        vm.startPrank(owner);

        oracle     = new FreeOracle();
        usdc       = new MockUSDC();
        registry   = new ArcNameRegistry(owner);
        registrar  = new ArcNameRegistrar(owner, address(registry), address(oracle), address(usdc));
        resolver   = new ArcResolver(owner, address(registry));
        reverseReg = new ArcReverseRegistrar(owner, address(registry));

        registry.setRegistrar(address(registrar));

        vm.stopPrank();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _commit(address actor, string memory label) internal returns (bytes32 commitment) {
        commitment = registrar.makeCommitment(label, actor, address(resolver), ALICE_SECRET);
        vm.prank(actor);
        registrar.commit(commitment);
    }

    function _register(address actor, string memory label) internal {
        vm.warp(block.timestamp + 65);
        vm.prank(actor);
        registrar.register(label, actor, address(resolver), 365 days, ALICE_SECRET);
    }

    function _commitAndRegister(address actor, string memory label) internal {
        _commit(actor, label);
        _register(actor, label);
    }

    // ─── Registry: access control ─────────────────────────────────────────────

    function test_onlyRegistrarCanRegister() public {
        bytes32 node = keccak256(abi.encodePacked("alice"));
        vm.expectRevert(ArcNameRegistry.NotRegistrar.selector);
        registry.register(node, "alice", alice, address(resolver), block.timestamp + 365 days);
    }

    function test_onlyOwnerCanSetRegistrar() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.setRegistrar(alice);
    }

    // ─── Registrar: commit-reveal ─────────────────────────────────────────────

    function test_commitReveal_happyPath() public {
        _commitAndRegister(alice, "alice");

        bytes32 node = registrar.labelhash("alice");
        assertEq(registry.ownerOf(uint256(node)), alice);
        assertFalse(registry.available(node));
    }

    function test_register_tooSoon() public {
        bytes32 commitment = _commit(alice, "alice");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcNameRegistrar.CommitmentTooNew.selector, commitment));
        registrar.register("alice", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_register_tooLate() public {
        bytes32 commitment = _commit(alice, "alice");
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcNameRegistrar.CommitmentTooOld.selector, commitment));
        registrar.register("alice", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_register_wrongSecret() public {
        _commit(alice, "alice");
        vm.warp(block.timestamp + 65);
        bytes32 badCommitment = registrar.makeCommitment("alice", alice, address(resolver), keccak256("wrong"));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcNameRegistrar.CommitmentTooNew.selector, badCommitment));
        registrar.register("alice", alice, address(resolver), 365 days, keccak256("wrong"));
    }

    // ─── Uniqueness invariant ─────────────────────────────────────────────────

    function test_nameUniqueness_cannotRegisterTwice() public {
        _commitAndRegister(alice, "alice");

        bytes32 bobCommitment = registrar.makeCommitment("alice", bob, address(resolver), keccak256("bob-secret"));
        vm.prank(bob);
        registrar.commit(bobCommitment);
        vm.warp(block.timestamp + 65);
        vm.prank(bob);
        vm.expectRevert();
        registrar.register("alice", bob, address(resolver), 365 days, keccak256("bob-secret"));
    }

    function test_nameUniqueness_availableAfterGracePeriod() public {
        _commitAndRegister(alice, "alice");

        bytes32 node = registrar.labelhash("alice");
        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);

        vm.warp(rec.expiry + registry.GRACE_PERIOD() + 1);
        assertTrue(registry.available(node));
    }

    // ─── C3: Label charset validation ─────────────────────────────────────────

    function test_C3_labelTooShort() public {
        bytes32 commitment = registrar.makeCommitment("ab", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.LabelTooShort.selector);
        registrar.register("ab", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_labelTooLong() public {
        string memory long66 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        bytes32 commitment = registrar.makeCommitment(long66, alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.LabelTooLong.selector);
        registrar.register(long66, alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_uppercaseRejected() public {
        bytes32 commitment = registrar.makeCommitment("Alice", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.InvalidLabel.selector);
        registrar.register("Alice", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_spacesRejected() public {
        bytes32 commitment = registrar.makeCommitment("ali ce", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.InvalidLabel.selector);
        registrar.register("ali ce", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_dotsRejected() public {
        bytes32 commitment = registrar.makeCommitment("ali.ce", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.InvalidLabel.selector);
        registrar.register("ali.ce", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_leadingHyphenRejected() public {
        bytes32 commitment = registrar.makeCommitment("-alice", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.InvalidLabel.selector);
        registrar.register("-alice", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_trailingHyphenRejected() public {
        bytes32 commitment = registrar.makeCommitment("alice-", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.InvalidLabel.selector);
        registrar.register("alice-", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_doubleHyphenRejected() public {
        bytes32 commitment = registrar.makeCommitment("ali--ce", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(ArcNameRegistrar.InvalidLabel.selector);
        registrar.register("ali--ce", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    function test_C3_validHyphenAndDigits() public {
        _commit(alice, "al1-ce");
        _register(alice, "al1-ce");
        bytes32 node = registrar.labelhash("al1-ce");
        assertEq(registry.ownerOf(uint256(node)), alice);
    }

    // ─── Blocked names ────────────────────────────────────────────────────────

    function test_blockedName() public {
        bytes32 node = registrar.labelhash("circle");
        vm.prank(owner);
        registrar.blockName(node);

        bytes32 commitment = registrar.makeCommitment("circle", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcNameRegistrar.NameReserved.selector, node));
        registrar.register("circle", alice, address(resolver), 365 days, ALICE_SECRET);
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function test_pause_blocksRegistrations() public {
        vm.prank(owner);
        registrar.pause();

        bytes32 commitment = registrar.makeCommitment("alice", alice, address(resolver), ALICE_SECRET);
        vm.prank(alice);
        vm.expectRevert();
        registrar.commit(commitment);
    }

    // ─── C5: commit griefing prevention ──────────────────────────────────────

    function test_C5_cannotRecommitActiveCommitment() public {
        bytes32 commitment = _commit(alice, "alice");

        // bob tries to re-submit alice's commitment to reset the timer
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(
            ArcNameRegistrar.CommitmentAlreadyActive.selector,
            commitment
        ));
        registrar.commit(commitment);

        // Alice's timer is intact — she can still register after MIN_COMMIT_AGE
        _register(alice, "alice");
        bytes32 node = registrar.labelhash("alice");
        assertEq(registry.ownerOf(uint256(node)), alice);
    }

    function test_C5_canRecommitAfterExpiry() public {
        bytes32 commitment = _commit(alice, "alice");
        // Warp past MAX_COMMIT_AGE so the old commitment is expired
        vm.warp(block.timestamp + 2 days);
        // Now anyone can commit the same hash again (starts a fresh timer)
        vm.prank(alice);
        registrar.commit(commitment); // should not revert
    }

    // ─── C1: manager reset on transfer ────────────────────────────────────────

    function test_C1_managerResetAfterTransfer() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // Transfer from alice → bob
        vm.prank(alice);
        registry.transferFrom(alice, bob, uint256(node));

        // Manager must now be bob
        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);
        assertEq(rec.manager, bob, "manager should be bob after transfer");

        // alice can no longer setAddr (not owner, not manager)
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcResolver.NotAuthorised.selector, node));
        resolver.setAddr(node, alice);

        // bob can setAddr
        vm.prank(bob);
        resolver.setAddr(node, bob);
        assertEq(resolver.addr(node), bob);
    }

    function test_C1_managerCannotActAfterTransfer() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // alice designates herself explicitly as manager (redundant but valid)
        vm.prank(alice);
        registry.setManager(node, alice);

        // Transfer to bob
        vm.prank(alice);
        registry.transferFrom(alice, bob, uint256(node));

        // alice was the manager but the transfer reset it to bob; alice is now unauthorised
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcResolver.NotAuthorised.selector, node));
        resolver.setAddr(node, alice);
    }

    // ─── C2: generation-based record invalidation ─────────────────────────────

    function test_C2_recordsInvalidatedAfterTransfer() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // Alice sets her addr record explicitly
        vm.prank(alice);
        resolver.setAddr(node, alice);
        assertEq(resolver.addr(node), alice);

        // Alice transfers to bob
        vm.prank(alice);
        registry.transferFrom(alice, bob, uint256(node));

        // Old explicit record is gone (different generation) — addr() now defaults to bob
        assertEq(resolver.addr(node), bob, "addr should default to bob after transfer");
    }

    function test_C2_recordsInvalidatedAfterReRegistration() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // Alice sets her addr record
        vm.prank(alice);
        resolver.setAddr(node, alice);
        assertEq(resolver.addr(node), alice);

        // Fast-forward past expiry + grace period
        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);
        vm.warp(rec.expiry + registry.GRACE_PERIOD() + 1);
        assertTrue(registry.available(node));

        // Bob re-registers the name
        bytes32 bobSecret = keccak256("bob-secret");
        bytes32 bobCommit = registrar.makeCommitment("alice", bob, address(resolver), bobSecret);
        vm.prank(bob);
        registrar.commit(bobCommit);
        vm.warp(block.timestamp + 65);
        vm.prank(bob);
        registrar.register("alice", bob, address(resolver), 365 days, bobSecret);

        // Alice's old record is gone — addr() defaults to bob (new owner)
        assertEq(resolver.addr(node), bob, "addr should default to bob after re-registration");
    }

    function test_C2_addrDefaultsToOwnerOnFreshMint() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // No explicit setAddr called — should default to alice (the owner)
        assertEq(resolver.addr(node), alice, "addr should default to owner on fresh mint");
    }

    // ─── C4: reverse registrar ownership check ────────────────────────────────

    function test_C4_cannotClaimNameYouDontOwn() public {
        _commitAndRegister(alice, "alice");

        // bob tries to set "alice" as his primary name
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcReverseRegistrar.NotNameOwner.selector, "alice"));
        reverseReg.setName("alice");
    }

    function test_C4_ownerCanSetPrimaryName() public {
        _commitAndRegister(alice, "alice");

        vm.prank(alice);
        reverseReg.setName("alice");
        assertEq(reverseReg.name(alice), "alice");
    }

    function test_C4_primaryNameClearedAfterTransfer() public {
        _commitAndRegister(alice, "alice");

        vm.prank(alice);
        reverseReg.setName("alice");
        assertEq(reverseReg.name(alice), "alice");

        bytes32 node = registrar.labelhash("alice");
        // alice transfers to bob
        vm.prank(alice);
        registry.transferFrom(alice, bob, uint256(node));

        // alice no longer owns the name → name() returns empty for her
        assertEq(reverseReg.name(alice), "", "primary name should be empty after losing ownership");
    }

    function test_C4_clearPrimaryName() public {
        _commitAndRegister(alice, "alice");

        vm.prank(alice);
        reverseReg.setName("alice");

        vm.prank(alice);
        reverseReg.setName(""); // clear
        assertEq(reverseReg.name(alice), "");
    }

    function test_C4_cannotSetExpiredNameAsPrimary() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");
        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);

        // Warp past expiry (but not grace period)
        vm.warp(rec.expiry + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcReverseRegistrar.NotNameOwner.selector, "alice"));
        reverseReg.setName("alice");
    }

    // ─── Wrong-registry isolation (new tests) ────────────────────────────────

    /// @dev C-RESOLVE-1: resolver built against a different registry must revert setAddr
    ///      and return zero for addr().
    function test_resolverWrongRegistry_setAddrReverts() public {
        // Deploy a fresh registry that registrar does NOT use
        ArcNameRegistry otherRegistry = new ArcNameRegistry(owner);
        // Resolver wired to the OTHER registry
        ArcResolver wrongResolver = new ArcResolver(owner, address(otherRegistry));

        // Register alice on the REAL registry (not the other one)
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // wrongResolver has no knowledge of alice's name → NotAuthorised
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcResolver.NotAuthorised.selector, node));
        wrongResolver.setAddr(node, alice);
    }

    /// @dev C-RESOLVE-2: resolver built against a different registry returns address(0) for addr()
    function test_resolverWrongRegistry_addrReturnsZero() public {
        ArcNameRegistry otherRegistry = new ArcNameRegistry(owner);
        ArcResolver wrongResolver = new ArcResolver(owner, address(otherRegistry));

        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // No explicit record on wrongResolver → returns address(0), not alice
        assertEq(wrongResolver.addr(node), address(0));
    }

    /// @dev C-RESOLVE-3: addr(node) defaults to owner immediately after register, no setAddr needed
    function test_addrDefaultsToOwnerAfterMint() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        // No setAddr called — resolver must return alice as the default
        assertEq(resolver.addr(node), alice, "addr should equal owner right after mint");
    }

    // ─── Resolver ─────────────────────────────────────────────────────────────

    function test_resolver_setAddr() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        vm.prank(alice);
        resolver.setAddr(node, alice);
        assertEq(resolver.addr(node), alice);
    }

    function test_resolver_onlyOwnerOrManager() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcResolver.NotAuthorised.selector, node));
        resolver.setAddr(node, bob);
    }

    function test_resolver_managerCanSetRecords() public {
        _commitAndRegister(alice, "alice");
        bytes32 node = registrar.labelhash("alice");

        vm.prank(alice);
        registry.setManager(node, bob);

        vm.prank(bob);
        resolver.setAddr(node, bob);
        assertEq(resolver.addr(node), bob);
    }

    // ─── Reverse registrar ────────────────────────────────────────────────────

    function test_reverseRecord() public {
        _commitAndRegister(alice, "alice");
        vm.prank(alice);
        reverseReg.setName("alice");
        assertEq(reverseReg.name(alice), "alice");
    }

    // ─── NFT: transfer blocked when expired ───────────────────────────────────

    function test_transfer_blockedAfterExpiry() public {
        _commitAndRegister(alice, "alice");

        bytes32 node = registrar.labelhash("alice");
        ArcNameRegistry.NameRecord memory rec = registry.getRecord(node);

        vm.warp(rec.expiry + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcNameRegistry.NameExpired.selector, node));
        registry.transferFrom(alice, bob, uint256(node));
    }

    // ─── Fuzz: name uniqueness invariant ──────────────────────────────────────

    function testFuzz_uniqueness(address actor1, address actor2) public {
        vm.assume(actor1 != address(0) && actor2 != address(0));
        vm.assume(actor1 != actor2);
        vm.assume(actor1.code.length == 0 && actor2.code.length == 0);

        bytes32 s1 = keccak256(abi.encode(actor1, "secret"));
        bytes32 c1 = registrar.makeCommitment("fuzzy", actor1, address(resolver), s1);
        vm.prank(actor1);
        registrar.commit(c1);

        vm.warp(block.timestamp + 65);
        vm.prank(actor1);
        registrar.register("fuzzy", actor1, address(resolver), 365 days, s1);

        bytes32 node = registrar.labelhash("fuzzy");
        assertEq(registry.ownerOf(uint256(node)), actor1);

        // actor2 tries to register the same name — must fail
        bytes32 s2 = keccak256(abi.encode(actor2, "secret2"));
        bytes32 c2 = registrar.makeCommitment("fuzzy", actor2, address(resolver), s2);
        vm.prank(actor2);
        registrar.commit(c2);
        vm.warp(block.timestamp + 65);
        vm.prank(actor2);
        vm.expectRevert();
        registrar.register("fuzzy", actor2, address(resolver), 365 days, s2);
    }
}
