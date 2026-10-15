# ArcName — Decentralised Naming and Payments on Arc

> Mint a `.arc` name. Send USDC by name, not by address.

**Live app:** [https://famous-peony-5d24c3.netlify.app](https://famous-peony-5d24c3.netlify.app)

---

## What is ArcName?

ArcName is a decentralised naming and payments protocol built on [Arc](https://arc.io) — the blockchain where USDC is the native gas token. Instead of sharing a long hex wallet address, you mint a short, human-readable `.arc` name (e.g. `alice.arc`), and anyone can send you USDC by typing that name.

Every operation is fully self-custodial. No keys are ever held by ArcName. Every transaction is signed by the user's own wallet.

> **Important:** Sending USDC by name only works inside the ArcName app. `.arc` names are resolved by the ArcName resolver contracts on Arc Mainnet. If someone gives you a `.arc` name, they must use the ArcName app to send to it — external wallets or dapps that have not integrated the ArcName resolver will not be able to look up the address behind the name.

---

## Features

- **Mint a `.arc` name** — claim a unique name that resolves to your wallet address
- **Send USDC by name** — type `alice.arc`, resolve it on-chain, and send USDC directly with no intermediary
- **Receive payments** — share your `.arc` name instead of a raw address
- **Reverse record** — set a primary `.arc` name for your address so apps can display your name instead of `0x...`
- **Self-custody** — every action (mint, transfer, send) requires a signature from the user's own wallet
- **Front-running protection** — commit-reveal registration flow prevents anyone from stealing your name while you mint it
- **Expiry and renewal** — names expire and can be renewed; the UI warns when a name is expiring soon and blocks sends to expired names

---

## How Minting Works (Commit-Reveal)

Registrations use a two-step commit-reveal scheme to prevent front-running:

```
Step 1 — Commit   (t = 0)
  commit( keccak256(label + owner + resolver + secret) )

Step 2 — Register (t ≥ 60 seconds, t ≤ 24 hours)
  register(label, owner, resolver, duration, secret)
```

The hash in step 1 reveals nothing about the label until step 2. A random 32-byte secret is generated in the browser and stored in `localStorage` so you can resume if you close the tab. After 24 hours the commitment expires and you must start over.

---

## Smart Contracts

All contracts are deployed on **Arc Mainnet (chain ID 5042)**. The system is immutable and permissionless — no proxy, no upgrade key, no admin back-door on the core registry.

| Contract | Address | Role |
|---|---|---|
| `ArcNameRegistry` | [`0x18C70A528F76384bB643BB4DbdFa80316B9C4b9D`](https://explorer.arc.io/address/0x18C70A528F76384bB643BB4DbdFa80316B9C4b9D) | Immutable ERC-721 registry — source of truth for name ownership |
| `ArcNameRegistrar` | [`0xbf9A7cFa59Ce6dF0833e251912c9d451E140b444`](https://explorer.arc.io/address/0xbf9A7cFa59Ce6dF0833e251912c9d451E140b444) | Commit-reveal registration, renewal, and admin controls |
| `ArcResolver` | [`0x2729D7cE217791bc167234Ca91343Ec33f26fCd2`](https://explorer.arc.io/address/0x2729D7cE217791bc167234Ca91343Ec33f26fCd2) | Address and text record storage per name |
| `ArcReverseRegistrar` | [`0xEC65a94E503B323fE796C969C1156392edC3e812`](https://explorer.arc.io/address/0xEC65a94E503B323fE796C969C1156392edC3e812) | Primary name (reverse record) per address |
| `FreeOracle` | [`0xDcE9E1fafFa27Fc799cc213Af7815455c2F7d2f7`](https://explorer.arc.io/address/0xDcE9E1fafFa27Fc799cc213Af7815455c2F7d2f7) | Price oracle — currently free (0 USDC per registration) |

**Deploy block:** 25937202  
**Owner:** `0x9b8AcF5ec33eb1e809E3c249A3546e1537c346B9`  
**Verify on chain:** check `ArcNameRegistry` at the address above on [explorer.arc.io](https://explorer.arc.io) to confirm the contracts are live on Arc Mainnet.

### Contract Architecture

```
User's wallet
    │  signs transactions
    ▼
ArcNameRegistrar  ←  commit() / register() / renew()
    │  onlyRegistrar
    ▼
ArcNameRegistry (ERC-721, immutable)
    │  reads for auth
    ▼
ArcResolver           — setAddr(), setText()
ArcReverseRegistrar   — setName() / name()
FreeOracle            — price() → 0
```

---

## Onchain Security Properties

| Threat | Mitigation |
|---|---|
| Front-running a registration | Commit-reveal with 60 s min / 24 h max window |
| Name spoofing / homoglyphs | Client-side ENSIP-15 normalisation before hashing |
| Squatting brand names | `blockName` / reserved list managed by the multisig owner |
| Registry takeover | Registry is immutable; only one registrar address can mint/renew |
| Malicious resolver swap | User must sign `setResolver` themselves |
| Record changed between resolve and send | Re-resolved at send time in the frontend |
| Sending to an expired name | UI blocks the send and shows an expiry warning |
| Emergency (bug in registrar) | `pause()` halts new registrations; existing names and transfers unaffected |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Web3 | wagmi v2, viem v2, ConnectKit |
| Contracts | Solidity 0.8.28, Foundry |
| Chain | Arc Mainnet (chain ID 5042), USDC as native gas |
| USDC | ERC-20 at `0x3600000000000000000000000000000000000000` (6 decimals) |
| Hosting | Netlify |

---

## Project Structure

```
contracts/
  ArcNameRegistry.sol       ← immutable ERC-721 registry
  ArcNameRegistrar.sol      ← commit-reveal registrar + admin
  ArcResolver.sol           ← address + text records
  ArcReverseRegistrar.sol   ← primary name (reverse record)
  FreeOracle.sol            ← zero-fee oracle
  IPriceOracle.sol          ← oracle interface
  script/
    Deploy.s.sol            ← full deploy + wire script
  test/
    ArcName.t.sol           ← 40 unit + fuzz tests (all passing)

src/
  App.tsx                   ← thin composition root + bottom-tab nav
  config.ts                 ← wagmi + ConnectKit config, chain selection
  contracts/index.ts        ← contract addresses + ABIs (reads from .env)
  hooks/
    useMintFlow.ts          ← full commit-reveal state machine
    useNameRegistry.ts      ← commit, register, availability hooks
    useResolver.ts          ← name → address resolution
    useMyNames.ts           ← owned names for connected wallet
    usePaymentRequest.ts    ← EIP-712 signed payment request
    useBootCheck.ts         ← verifies contract wiring on startup
  utils/
    nameNormalize.ts        ← ENSIP-style normalisation + validation
    formatAddress.ts        ← address formatting + error parser
  components/
    MintScreen.tsx          ← search → commit → wait → register flow
    DashboardScreen.tsx     ← USDC balance + owned names
    SendScreen.tsx          ← name → address resolution + USDC send
    ReceiveScreen.tsx       ← share your name / payment request
    SettingsScreen.tsx      ← manage records, primary name, renew
    BottomSheet.tsx         ← reusable bottom-sheet modal
    NameCard.tsx            ← name NFT display card
    TxButton.tsx            ← transaction CTA with all states
    AdminBanner.tsx         ← owner-only admin controls

docs/
  architecture.md           ← full architecture + threat model
```

---

## Running Locally

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Foundry](https://book.getfoundry.sh) (for contract work)

### Install and run

```bash
git clone https://github.com/Damilola145/Archy.git
cd Archy
bun install
```

Create a `.env` file in the project root:

```env
VITE_REGISTRY_ADDRESS=0x18C70A528F76384bB643BB4DbdFa80316B9C4b9D
VITE_REGISTRAR_ADDRESS=0xbf9A7cFa59Ce6dF0833e251912c9d451E140b444
VITE_RESOLVER_ADDRESS=0x2729D7cE217791bc167234Ca91343Ec33f26fCd2
VITE_REVERSE_REGISTRAR_ADDRESS=0xEC65a94E503B323fE796C969C1156392edC3e812
VITE_FREE_ORACLE_ADDRESS=0xDcE9E1fafFa27Fc799cc213Af7815455c2F7d2f7
VITE_WALLETCONNECT_PROJECT_ID=<your_project_id>
VITE_REGISTRY_DEPLOY_BLOCK=25937202
VITE_CHAIN=mainnet
```

Then start the dev server:

```bash
bun run dev
```

The app runs at `http://localhost:5173`.

### Contracts

```bash
# Compile
bun run contracts:build   # or: forge build

# Test (40 tests)
bun run contracts:test    # or: forge test

# Deploy your own instance
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

---

## Name Rules

`.arc` names follow these rules, enforced both on-chain and in the UI:

- Allowed characters: `a-z`, `0-9`, `-` (hyphen)
- Minimum length: 3 characters
- Maximum length: 63 characters
- No leading or trailing hyphens
- No consecutive hyphens (`--`)
- No uppercase, spaces, dots, or special characters

---

## Custody Model

ArcName never holds your keys or your USDC. Every operation is a direct on-chain transaction signed by your wallet:

| Operation | Who signs |
|---|---|
| Register a name | Your wallet |
| Transfer a name | Your wallet (current owner) |
| Set address record | Name owner or designated manager |
| Set primary name | Your wallet (only your own address) |
| Send USDC by name | Your wallet |

The contracts never hold user funds. The only value they can hold is collected registration fees (currently $0 — registration is free).

---

## Important: Name-Based Sending is ArcName-Only

`.arc` names are resolved by the ArcName resolver contracts on Arc Mainnet. **Sending by name only works inside the ArcName app.** External wallets (MetaMask, Coinbase Wallet, Rainbow, etc.) and other dapps that have not integrated the ArcName resolver will not recognise a `.arc` name — they require a raw `0x` address. If you want to receive a payment by name, the sender must use the ArcName app at [https://famous-peony-5d24c3.netlify.app](https://famous-peony-5d24c3.netlify.app).

---

## License

MIT
