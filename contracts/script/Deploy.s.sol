// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../ArcNameRegistry.sol";
import "../ArcNameRegistrar.sol";
import "../ArcResolver.sol";
import "../ArcReverseRegistrar.sol";
import "../FreeOracle.sol";

/// @notice Full deployment script for arc.name contracts.
///
/// Usage (Arc Testnet, deployer = your hardware wallet or private key):
///   forge script contracts/script/Deploy.s.sol \
///     --rpc-url $RPC_URL \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvvv
///
/// The deployer becomes the registry/registrar/resolver owner.
/// The script calls registry.setRegistrar() in the same broadcast so the
/// system is fully wired before the script exits.
///
/// After the script succeeds, copy the printed env block into your .env file.
///
/// Required env vars:
///   RPC_URL       — Arc Testnet RPC (e.g. https://rpc.testnet.arc.io)
///   USDC_ADDRESS  — USDC ERC-20 address on target chain (set to address(0) for fee-free)
contract Deploy is Script {

    function run() external {
        address deployer  = msg.sender;
        address usdcToken = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast();

        // 1. Oracle (no deps)
        FreeOracle oracle = new FreeOracle();

        // 2. Registry  (owner = deployer)
        ArcNameRegistry registry = new ArcNameRegistry(deployer);

        // 3. Registrar (owner = deployer, registry, oracle)
        ArcNameRegistrar registrar = new ArcNameRegistrar(
            deployer,
            address(registry),
            address(oracle),
            usdcToken
        );

        // 4. Resolver  (owner = deployer, registry)
        ArcResolver resolver = new ArcResolver(deployer, address(registry));

        // 5. ReverseRegistrar (owner = deployer, registry)
        ArcReverseRegistrar reverseReg = new ArcReverseRegistrar(deployer, address(registry));

        // 6. Wire: registry.setRegistrar — in same broadcast so it's atomic
        registry.setRegistrar(address(registrar));

        vm.stopBroadcast();

        // ── Print .env block ──────────────────────────────────────────────────
        console2.log("\n========  COPY INTO .env  ========");
        console2.log("VITE_REGISTRY_ADDRESS=%s",          address(registry));
        console2.log("VITE_REGISTRAR_ADDRESS=%s",         address(registrar));
        console2.log("VITE_RESOLVER_ADDRESS=%s",          address(resolver));
        console2.log("VITE_REVERSE_REGISTRAR_ADDRESS=%s", address(reverseReg));
        console2.log("VITE_FREE_ORACLE_ADDRESS=%s",        address(oracle));
        console2.log("==================================\n");

        // Verify wiring
        require(registry.registrar() == address(registrar), "Deploy: setRegistrar failed");
        console2.log("Wiring verified: registry.registrar() ==", registry.registrar());
    }
}
