/**
 * arc.name — deployed contract addresses and ABIs (Arc Testnet / Mainnet)
 *
 * Single source of truth for addresses — read from .env only.
 * After a redeploy run `forge script contracts/script/Deploy.s.sol ...`
 * and paste the printed env block into .env, then restart the dev server.
 *
 * Env vars:
 *   VITE_REGISTRY_ADDRESS
 *   VITE_REGISTRAR_ADDRESS
 *   VITE_RESOLVER_ADDRESS
 *   VITE_REVERSE_REGISTRAR_ADDRESS
 *   VITE_FREE_ORACLE_ADDRESS        (optional)
 */

// ── Addresses ────────────────────────────────────────────────────────────────
export const REGISTRY_ADDRESS   = (import.meta.env.VITE_REGISTRY_ADDRESS   ?? '') as `0x${string}`
export const REGISTRAR_ADDRESS  = (import.meta.env.VITE_REGISTRAR_ADDRESS  ?? '') as `0x${string}`
export const RESOLVER_ADDRESS   = (import.meta.env.VITE_RESOLVER_ADDRESS   ?? '') as `0x${string}`
export const REVERSE_REGISTRAR_ADDRESS = (import.meta.env.VITE_REVERSE_REGISTRAR_ADDRESS ?? '') as `0x${string}`

export const CONTRACTS_DEPLOYED = Boolean(
  REGISTRY_ADDRESS && REGISTRAR_ADDRESS && RESOLVER_ADDRESS && REVERSE_REGISTRAR_ADDRESS
)

// ── ArcNameRegistry ABI (v3) ─────────────────────────────────────────────────
// Includes `generation(bytes32)` added in v3 (C2 fix).
// `getRecord` tuple now has 5 components (generation added).
export const REGISTRY_ABI = [
  // Ownable
  { name: 'owner',        type: 'function', stateMutability: 'view',        inputs: [],                                                                        outputs: [{ name: '', type: 'address' }] },
  { name: 'registrar',    type: 'function', stateMutability: 'view',        inputs: [],                                                                        outputs: [{ name: '', type: 'address' }] },
  // Admin — owner only
  { name: 'setRegistrar', type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: '_registrar', type: 'address' }],                                 outputs: [] },
  // ERC-721
  { name: 'balanceOf',    type: 'function', stateMutability: 'view',        inputs: [{ name: 'owner', type: 'address' }],                                       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'ownerOf',      type: 'function', stateMutability: 'view',        inputs: [{ name: 'tokenId', type: 'uint256' }],                                    outputs: [{ name: '', type: 'address' }] },
  { name: 'transferFrom', type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
  // Registry reads
  { name: 'available',    type: 'function', stateMutability: 'view',        inputs: [{ name: 'node', type: 'bytes32' }],                                       outputs: [{ name: '', type: 'bool' }] },
  { name: 'resolver',     type: 'function', stateMutability: 'view',        inputs: [{ name: 'node', type: 'bytes32' }],                                       outputs: [{ name: '', type: 'address' }] },
  { name: 'expiry',       type: 'function', stateMutability: 'view',        inputs: [{ name: 'node', type: 'bytes32' }],                                       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'generation',   type: 'function', stateMutability: 'view',        inputs: [{ name: 'node', type: 'bytes32' }],                                       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getRecord',    type: 'function', stateMutability: 'view',        inputs: [{ name: 'node', type: 'bytes32' }],                                       outputs: [{ name: '', type: 'tuple', components: [{ name: 'label', type: 'string' }, { name: 'resolver', type: 'address' }, { name: 'manager', type: 'address' }, { name: 'expiry', type: 'uint256' }, { name: 'generation', type: 'uint256' }] }] },
  // Registry writes (name owner)
  { name: 'setResolver',  type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'node', type: 'bytes32' }, { name: 'resolver', type: 'address' }], outputs: [] },
  { name: 'setManager',   type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'node', type: 'bytes32' }, { name: 'manager', type: 'address' }], outputs: [] },
  // Constants
  { name: 'GRACE_PERIOD', type: 'function', stateMutability: 'view',        inputs: [],                                                                        outputs: [{ name: '', type: 'uint256' }] },
  // Events
  { name: 'NameRegistered',  type: 'event', inputs: [{ name: 'node', type: 'bytes32', indexed: true }, { name: 'label', type: 'string', indexed: false }, { name: 'owner', type: 'address', indexed: true }, { name: 'expiry', type: 'uint256', indexed: false }] },
  { name: 'NameRenewed',     type: 'event', inputs: [{ name: 'node', type: 'bytes32', indexed: true }, { name: 'newExpiry', type: 'uint256', indexed: false }] },
  { name: 'Transfer',        type: 'event', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }] },
  { name: 'RegistrarSet',    type: 'event', inputs: [{ name: 'registrar', type: 'address', indexed: true }] },
] as const

// ── ArcNameRegistrar ABI (v3) ─────────────────────────────────────────────────
export const REGISTRAR_ABI = [
  // Commit-reveal
  { name: 'commit',          type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'commitment', type: 'bytes32' }], outputs: [] },
  { name: 'register',        type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'label', type: 'string' }, { name: 'owner', type: 'address' }, { name: 'resolver', type: 'address' }, { name: 'duration', type: 'uint256' }, { name: 'secret', type: 'bytes32' }], outputs: [] },
  { name: 'renew',           type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'label', type: 'string' }, { name: 'duration', type: 'uint256' }], outputs: [] },
  // Views
  { name: 'makeCommitment',  type: 'function', stateMutability: 'pure',       inputs: [{ name: 'label', type: 'string' }, { name: 'owner', type: 'address' }, { name: 'resolver', type: 'address' }, { name: 'secret', type: 'bytes32' }], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'labelhash',       type: 'function', stateMutability: 'pure',       inputs: [{ name: 'label', type: 'string' }], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'rentPrice',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'label', type: 'string' }, { name: 'duration', type: 'uint256' }], outputs: [{ name: 'base', type: 'uint256' }, { name: 'premium', type: 'uint256' }] },
  { name: 'commitments',     type: 'function', stateMutability: 'view',       inputs: [{ name: 'commitment', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'blocked',         type: 'function', stateMutability: 'view',       inputs: [{ name: 'labelhash', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'MIN_COMMIT_AGE',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'MAX_COMMIT_AGE',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'MIN_DURATION',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'paused',          type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'bool' }] },
  // Events
  { name: 'Committed',     type: 'event', inputs: [{ name: 'commitment', type: 'bytes32', indexed: true }] },
  { name: 'Registered',    type: 'event', inputs: [{ name: 'node', type: 'bytes32', indexed: true }, { name: 'label', type: 'string', indexed: false }, { name: 'owner', type: 'address', indexed: true }, { name: 'expiry', type: 'uint256', indexed: false }] },
  { name: 'Renewed',       type: 'event', inputs: [{ name: 'node', type: 'bytes32', indexed: true }, { name: 'newExpiry', type: 'uint256', indexed: false }] },
] as const

// ── ArcResolver ABI (v3) ─────────────────────────────────────────────────────
export const RESOLVER_ABI = [
  { name: 'registry', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'addr',     type: 'function', stateMutability: 'view',       inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'text',     type: 'function', stateMutability: 'view',       inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
  { name: 'setAddr',  type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'addr', type: 'address' }], outputs: [] },
  { name: 'setText',  type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }, { name: 'value', type: 'string' }], outputs: [] },
  { name: 'AddrChanged',  type: 'event', inputs: [{ name: 'node', type: 'bytes32', indexed: true }, { name: 'addr', type: 'address', indexed: false }] },
  { name: 'TextChanged',  type: 'event', inputs: [{ name: 'node', type: 'bytes32', indexed: true }, { name: 'key', type: 'string', indexed: true }, { name: 'value', type: 'string', indexed: false }] },
] as const

// ── ArcReverseRegistrar ABI (v3) ─────────────────────────────────────────────
export const REVERSE_REGISTRAR_ABI = [
  { name: 'registry', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'setName',  type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }], outputs: [] },
  { name: 'name',     type: 'function', stateMutability: 'view',       inputs: [{ name: 'addr', type: 'address' }], outputs: [{ name: '', type: 'string' }] },
  { name: 'NameChanged', type: 'event', inputs: [{ name: 'addr', type: 'address', indexed: true }, { name: 'name', type: 'string', indexed: false }] },
] as const
