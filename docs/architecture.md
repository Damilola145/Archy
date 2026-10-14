# arc.name — Architecture Document

> Version 0.1 — Arc Testnet (chain ID 5042002)
> Status: Phase 1 complete; contracts undeployed (pending `deploy` command)

---

## 1. What this system does

arc.name is a decentralised naming and payments protocol on Arc.
Users mint a unique `.arc` name (e.g. `alice.arc`), attach their wallet address to it,
and send/receive USDC payments by name instead of by raw address.

---

## 2. Custody rule (non-negotiable)

Every operation is self-custodial:

| Operation | Who signs | Who holds the name NFT |
|---|---|---|
| Register a name | User's wallet | User's wallet |
| Transfer a name | User's wallet (current owner) | Recipient's wallet |
| Set address record | Owner or designated manager | — |
| Set primary name | User's wallet (only their own address) | — |
| Send USDC by name | User's wallet | — |

The registry, registrar, resolver, and reverse-registrar contracts never hold name NFTs
or user funds on behalf of users. The only value they ever hold is collected USDC fees
(currently $0), withdrawable by the multisig owner to a designated treasury.

---

## 3. On-chain architecture

```
┌──────────────────────────────────────────────────────┐
│                   User's browser wallet               │
└──────────────┬────────────────────────────────────────┘
               │  signs transactions
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  ArcNameRegistrar (upgradeable via owner-swap)                  │
│  • commit(bytes32 commitment)                                   │
│  • register(label, owner, resolver, duration, secret)           │
│  • renew(label, duration)                                       │
│  • blockName / unblockName (owner/multisig only)                │
│  • pause / unpause (registrations only)                         │
│  Owns: priceOracle pointer (FreeOracle → future PricedOracle)   │
└───────────────────────┬─────────────────────────────────────────┘
                        │  onlyRegistrar
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ArcNameRegistry (IMMUTABLE — ERC-721)                          │
│  • register / renew (registrar only)                            │
│  • setResolver / setManager (owner only)                        │
│  • available(node) → bool                                       │
│  • TokenId = uint256(keccak256(label))                          │
│  • Transfer blocked after expiry                                │
│  Invariant: one owner per namehash at all times                 │
└──────────────┬──────────────────────────────────────────────────┘
               │  reads registry for auth
               ▼
┌───────────────────────────────────┐
│  ArcResolver (replaceable)        │
│  • setAddr(node, address)         │
│  • setText(node, key, value)      │
│  Auth: owner or manager of node   │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  ArcReverseRegistrar              │
│  • setName(label) — msg.sender    │
│  • name(addr) → string            │
│  Auth: caller sets own record only│
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  FreeOracle (swappable)           │
│  • price(label, duration) → 0,0   │
│  Future: PricedOracle, Dutch auct.│
└───────────────────────────────────┘
```

### Name-hash scheme
- `node = keccak256(abi.encodePacked(label))` — labelhash of the normalised label.
- Normalisation is enforced **off-chain** (client) before calling the registrar.
  The contract cannot re-normalise (no Unicode lib in EVM), so the UI must be the
  trusted normaliser. The registry stores the raw label; uniqueness is enforced by
  the hash.

### Commit-reveal flow

```
t=0       commit(keccak256(abi.encode(label, owner, resolver, secret)))
t ≥ 60s   register(label, owner, resolver, duration, secret)
t > 24h   commitment expires — must restart
```

This prevents front-running: the hash reveals nothing about the label until registration.

---

## 4. Upgradeability strategy

| Contract | Upgradeable? | How |
|---|---|---|
| ArcNameRegistry | **No** — immutable | Migration: deploy new registrar, owner calls `setRegistrar(newRegistrar)` |
| ArcNameRegistrar | Indirectly | Owner can deploy new registrar + point registry at it |
| ArcResolver | Indirectly | Per-name: owner calls `registry.setResolver(node, newResolver)` |
| ArcReverseRegistrar | No | Deploy new one; users re-set their primary name |

---

## 5. Threat model

| Threat | Mitigation |
|---|---|
| Front-running registration | Commit-reveal (60 s min, 24 h max) |
| Name spoofing / homoglyphs | Client-side ENSIP-15 normalisation before hashing; mixed-script/invisible-char block |
| Squatting brand names | `blockName` / reserved list managed by multisig |
| Registry takeover | Registry is immutable; only the registrar (a single, transparent address) can mint/renew |
| Phishing via lookalike UI | CSP headers, IPFS deployment, ENS-style TXT records for app verification (roadmap) |
| Signature replay on payment requests | EIP-712 typed data with chainId, verifyingContract, and expiry in the domain |
| Malicious resolver swap | User must sign `setResolver` themselves; resolver change emits `ResolverSet` event |
| Record changed between resolve and send | Re-resolve at send time in frontend; warn if owner/resolver changed in last 30 blocks |
| Expiring name confusion | UI warns if name expires < 30 days; send blocked on expired names |
| Emergency (bug in registrar) | `pause()` halts new registrations; existing names and transfers unaffected |
| USDC freeze (Circle blacklist) | USDC freezes affect the underlying token; the registry holds no USDC |
| Admin key compromise | Owner should be a multisig (e.g. Safe) + timelock; no individual EOA |

### Out of scope (mainnet audit required)
- Validator manipulation of `block.timestamp` (low risk on Arc; commit window is 60 s–24 h)
- MEV / searcher attacks on the Arc sequencer
- Cross-chain name collision (different chain, same label — by design separate namespaces)

---

## 6. Compliance questions (legal counsel required — no conclusions stated)

1. **Payments regulation**: does sending USDC by name constitute operating a money-transmission service?
2. **Sanctions screening**: are name registrants and payment recipients subject to OFAC or equivalent screening? Who is responsible?
3. **USDC issuer freeze**: Circle may freeze a USDC address. What is the operator's liability if a frozen address holds a `.arc` name pointing to it?
4. **Public balance privacy**: resolver address records are public on-chain. Do KYC/AML obligations follow from that?
5. **NFT classification**: is a `.arc` name NFT a security, a commodity, or neither in relevant jurisdictions?
6. **Bug bounty payouts**: are USDC bounty payouts reportable income?

---

## 7. File layout

```
contracts/
  ArcNameRegistry.sol       ← immutable ERC-721 registry
  ArcNameRegistrar.sol      ← commit-reveal registrar + admin
  ArcResolver.sol           ← address + text records
  ArcReverseRegistrar.sol   ← primary name (reverse record)
  FreeOracle.sol            ← zero-fee oracle (placeholder)
  IPriceOracle.sol          ← oracle interface
  test/
    ArcName.t.sol           ← 19 unit + fuzz tests

src/
  App.tsx                   ← thin composition root + tab nav
  config.ts                 ← wagmi + ConnectKit config
  contracts/index.ts        ← contract addresses + ABIs
  hooks/
    useNameRegistry.ts      ← commit, register, isAvailable hooks
    useResolver.ts          ← resolve name→address, re-resolve on send
    usePaymentRequest.ts    ← EIP-712 signed payment request
  utils/
    nameNormalize.ts        ← ENSIP-style normalisation + validation
    formatAddress.ts        ← address formatting + error parser
  components/
    MintScreen.tsx          ← search → commit → wait → register flow
    DashboardScreen.tsx     ← USDC balance + owned names
    SendScreen.tsx          ← name→address resolution + USDC send
    RequestScreen.tsx       ← EIP-712 signed payment request + QR
    SettingsScreen.tsx      ← manage records, primary name, renew
    BottomSheet.tsx         ← reusable bottom-sheet modal
    NameCard.tsx            ← name NFT display card
    TxButton.tsx            ← transaction CTA with all states

docs/
  architecture.md           ← this file
```

---

## 8. Observability plan (pre-mainnet)

- **On-chain events to index**: `NameRegistered`, `NameRenewed`, `NameTransferred`, `AddrChanged`, `TextChanged`, `NameChanged` (reverse)
- **Alerts**: registrar paused, large batch registrations (squatting), failed renewals before expiry
- **Incident runbook**: (1) pause registrar; (2) identify affected names via event logs; (3) deploy patched registrar; (4) owner calls `registry.setRegistrar(new)`; (5) unpause
- **Backend**: Ponder indexer (TypeScript) over Arc Testnet RPC; API for name search, availability, and expiry; payment-request storage (no user keys ever touched)

---

## 9. Next steps before mainnet

- [ ] Third-party Solidity audit (Critical + High findings resolved)
- [ ] Bug bounty programme live before mainnet launch
- [ ] Multisig (Safe) + timelock deployed and set as registry owner
- [ ] ENS normalisation library audit for the client-side normaliser
- [ ] Frontend: SIWE server-side session (currently wallet-only)
- [ ] Backend: Ponder indexer deployed + API endpoints live
- [ ] Legal review on all compliance questions above
- [ ] Deploy contracts to Arc mainnet after audit sign-off
