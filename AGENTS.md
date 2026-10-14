# arc.name — Project Memory

Decentralised naming + payments on Arc. Users mint a unique `.arc` name, it resolves to their wallet, and they send/receive USDC by name. Self-custody only — users sign every transaction with their own wallet.

## Contract Versions

All contracts are **v3** (this session). Key changes vs v2:
- C1: manager reset to new owner on transfer (prevents ex-owner from redirecting payments)
- C2: generation counter — resolver records key on (node, generation), auto-invalidate on transfer/re-mint; `addr()` defaults to `ownerOf()` so no separate "link" tx needed after minting
- C3: strict label charset `[a-z0-9-]`, no leading/trailing hyphen, no `--`
- C4: `ArcReverseRegistrar.setName` checks ownership before accepting; `name()` returns empty when ownership lost
- C5: `commit()` rejects re-submission of an active commitment (prevents griefing timer resets)

## Deploy

```bash
export RPC_URL=https://rpc.testnet.arc.io
export PRIVATE_KEY=<your_key>
export USDC_ADDRESS=0x3600000000000000000000000000000000000000

forge script contracts/script/Deploy.s.sol \
  --rpc-url $RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY \
  -vvvv
```

Copy the printed `.env` block into `.env` and restart the dev server.
The deploy script calls `registry.setRegistrar(registrar)` in the same broadcast — the system is fully wired immediately.

## Deployed Addresses (Arc Testnet — v3, current)

| Contract | Address |
|---|---|
| FreeOracle | 0x70c32215f6c27093b67f3163ac5723d8aaf4071d |
| ArcNameRegistry | 0x2f2ceaa4f2347d4e63762341e43450d6d74f70a9 |
| ArcNameRegistrar | 0x20e5baa697ce56ed210222a78cfb080c4b21824d |
| ArcResolver | 0x717257b367474cc99d5686cf8ecdd94661a93385 |
| ArcReverseRegistrar | 0x3a3cac954f459de02881794ef099259c73b8c2cb |

**Owner:** `0x9b8AcF5ec33eb1e809E3c249A3546e1537c346B9` (your wallet — set at deploy time).
**Pending:** call `registry.setRegistrar(registrar)` once from your wallet via the AdminBanner in the app.

## Chain

- Default: Arc Testnet (chain ID 5042002). Set `VITE_CHAIN=mainnet` to target Arc Mainnet (5042).
- RPC: `https://rpc.testnet.arc.io` (testnet), `https://rpc.mainnet.arc.io` (mainnet)
- USDC (ERC-20, 6 decimals): `0x3600000000000000000000000000000000000000` (same address on both)
- Explorer: `https://explorer.testnet.arc.io` (testnet), `https://explorer.arc.io` (mainnet)

## Owner

The deployer wallet becomes the registry/registrar/resolver owner. The AdminBanner reads `registry.owner()` from chain at runtime — no hardcoded constant. The owner wallet sees the banner and can call `setRegistrar` from the UI if needed (should not be needed after the Deploy script runs).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit (injected + WalletConnect connectors only)
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, tests in `contracts/test/ArcName.t.sol` (37 tests).
- Build: `bun run build`, Test: `bun run contracts:test` or `forge test`
- Netlify: `https://golden-torte-4d47e9.netlify.app`

## Key Files

- `src/config.ts` — chain definition (single source of truth for RPC/explorer URLs)
- `src/contracts/index.ts` — ABI + addresses (reads from .env)
- `src/hooks/useMintFlow.ts` — full commit-reveal state machine (M3–M8)
- `src/hooks/useBootCheck.ts` — verifies contract wiring on startup (M2)
- `src/components/MintScreen.tsx` — mint UI
- `contracts/script/Deploy.s.sol` — full deploy + wire script
