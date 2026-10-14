/**
 * useMyNames — single source of truth for names owned by a wallet.
 *
 * Priority order (fastest → most complete):
 *  1. localStorage cache  → instant paint
 *  2. reverseRecord       → single eth_call, arrives in ~1s, verified with ownerOf
 *  3. getLogs scan        → background enrichment (best-effort, non-fatal)
 *
 * The skeleton only shows when we have nothing at all (no cache, no reverse record).
 * As soon as reverseRecord resolves we verify and show it — no log scan needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, keccak256, toBytes } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import {
  REGISTRY_ADDRESS, CONTRACTS_DEPLOYED,
  REVERSE_REGISTRAR_ADDRESS, REVERSE_REGISTRAR_ABI,
  REGISTRY_ABI,
} from '@/contracts'
import { activeChain } from '@/config'

const CHAIN_ID = activeChain.id
const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_REGISTRY_DEPLOY_BLOCK ?? '0')
const CHUNK = 10_000n
const CACHE_PREFIX = 'arc-name-owned:'
const ACTIVE_PREFIX = 'arc-name-active:'

export type MyNamesStatus = 'loading' | 'ready' | 'error'

export interface UseMyNamesResult {
  names: string[]
  activeName: string | null
  status: MyNamesStatus
  refetch: () => void
  setPreferredName: (label: string) => void
}

// ── Viem client ───────────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(activeChain.rpcUrls.default.http[0]),
})

// ── Minimal ABI ───────────────────────────────────────────────────────────────
const OWN_ABI = [
  {
    type: 'function', name: 'ownerOf',
    inputs:  [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event', name: 'NameRegistered',
    inputs: [
      { name: 'node',   type: 'bytes32', indexed: true  },
      { name: 'label',  type: 'string',  indexed: false },
      { name: 'owner',  type: 'address', indexed: true  },
      { name: 'expiry', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'Transfer',
    inputs: [
      { name: 'from',    type: 'address', indexed: true },
      { name: 'to',      type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const

// ── localStorage ──────────────────────────────────────────────────────────────
function readCache(addr: string): string[] {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + addr.toLowerCase())
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}
function writeCache(addr: string, names: string[]) {
  try { localStorage.setItem(CACHE_PREFIX + addr.toLowerCase(), JSON.stringify(names)) } catch { /* noop */ }
}
function readActivePreference(addr: string): string | null {
  try { return localStorage.getItem(ACTIVE_PREFIX + addr.toLowerCase()) } catch { return null }
}
export function writeActivePreference(addr: string, label: string) {
  try { localStorage.setItem(ACTIVE_PREFIX + addr.toLowerCase(), label) } catch { /* noop */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(label)) as `0x${string}`
}

async function isOwned(label: string, address: `0x${string}`): Promise<boolean> {
  try {
    const tokenId = BigInt(labelhash(label))
    const owner = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: OWN_ABI,
      functionName: 'ownerOf',
      args: [tokenId],
    })
    return typeof owner === 'string' && owner.toLowerCase() === address.toLowerCase()
  } catch {
    return false
  }
}

// Best-effort log scan — returns [] on any failure
async function scanLabelsFromLogs(
  address: `0x${string}`,
  signal: AbortSignal,
): Promise<string[]> {
  try {
    const latest = await publicClient.getBlockNumber()
    const labelSet = new Set<string>()

    for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK + 1n) {
      if (signal.aborted) return [...labelSet]
      const to = from + CHUNK > latest ? latest : from + CHUNK
      try {
        const logs = await publicClient.getLogs({
          address: REGISTRY_ADDRESS,
          event: OWN_ABI[1],
          args: { owner: address },
          fromBlock: from,
          toBlock: to,
        })
        for (const l of logs) if (l.args.label) labelSet.add(l.args.label)
      } catch { /* skip chunk */ }
      if (signal.aborted) return [...labelSet]
      try {
        const transfers = await publicClient.getLogs({
          address: REGISTRY_ADDRESS,
          event: OWN_ABI[2],
          args: { to: address },
          fromBlock: from,
          toBlock: to,
        })
        // For transfers we only have tokenId; skip getRecord (it's a bonus)
        void transfers
      } catch { /* skip */ }
    }
    return [...labelSet]
  } catch {
    return []
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useMyNames(): UseMyNamesResult {
  const { address } = useAccount()

  const [names, setNames]   = useState<string[]>([])
  const [status, setStatus] = useState<MyNamesStatus>('loading')
  const [tick, setTick]     = useState(0)
  const scanAbortRef  = useRef<AbortController | null>(null)

  // ── wagmi reads ────────────────────────────────────────────────────────────
  const { data: reverseRecord } = useReadContract({
    address: REVERSE_REGISTRAR_ADDRESS,
    abi: REVERSE_REGISTRAR_ABI,
    functionName: 'name',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(address) },
  })

  const { data: balance } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(address) },
  })

  const refetch = useCallback(() => setTick(t => t + 1), [])

  const setPreferredName = useCallback((label: string) => {
    if (!address) return
    writeActivePreference(address, label)
    setTick(t => t + 1)
  }, [address])

  // ── Step 1: seed from cache immediately on address change ──────────────────
  useEffect(() => {
    if (!address) { setNames([]); setStatus('ready'); return }
    const cached = readCache(address)
    if (cached.length > 0) {
      setNames(cached)
      setStatus('ready')
    } else {
      setNames([])
      setStatus('loading')
    }
  }, [address])

  // ── Step 2: fast path — reverseRecord as a single verified candidate ───────
  // Runs as soon as reverseRecord resolves. No log scan needed.
  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    if (typeof reverseRecord !== 'string' || reverseRecord.length === 0) return

    const rev = reverseRecord
    void (async () => {
      const owned = await isOwned(rev, address)
      if (!owned) return

      // Merge with whatever we already have
      setNames(prev => {
        const merged = [...new Set([rev, ...prev])]
        writeCache(address, merged)
        return merged
      })
      setStatus('ready')
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, reverseRecord])

  // ── Step 3: confirmed zero balance — clear ─────────────────────────────────
  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    if (balance !== 0n) return
    // Don't override a list that already has names (reverse record may have populated it)
    setNames(prev => {
      if (prev.length > 0) return prev
      writeCache(address, [])
      setStatus('ready')
      return []
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, balance === 0n])

  // ── Step 4: background log scan for full name list ────────────────────────
  // Only runs when balance > 0 and we still need more names.
  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    if (balance === undefined || balance === 0n) return

    scanAbortRef.current?.abort()
    const ctrl = new AbortController()
    scanAbortRef.current = ctrl

    void (async () => {
      const cached = readCache(address)
      const revCandidate = (typeof reverseRecord === 'string' && reverseRecord.length > 0)
        ? reverseRecord : null

      const eventLabels = await scanLabelsFromLogs(address, ctrl.signal)
      if (ctrl.signal.aborted) return

      const candidates = [...new Set([
        ...(revCandidate ? [revCandidate] : []),
        ...cached,
        ...eventLabels,
      ])]

      if (candidates.length === 0) {
        // Scan found nothing — if we don't already have names show error
        setStatus(s => s === 'loading' ? 'error' : s)
        return
      }

      // Verify all candidates in parallel (fast)
      const results = await Promise.all(
        candidates.map(async lbl => ({
          lbl,
          owned: await isOwned(lbl, address),
        }))
      )
      if (ctrl.signal.aborted) return

      const verified = results.filter(r => r.owned).map(r => r.lbl)
      writeCache(address, verified)
      setNames(verified)
      setStatus('ready')
    })()

    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tick, balance !== undefined && balance > 0n ? 1 : 0])

  // ── Derive activeName ──────────────────────────────────────────────────────
  const activeName: string | null = (() => {
    if (names.length === 0) return null
    if (address) {
      const pref = readActivePreference(address)
      if (pref && names.includes(pref)) return pref
    }
    if (typeof reverseRecord === 'string' && reverseRecord.length > 0 && names.includes(reverseRecord)) {
      return reverseRecord
    }
    return names[0]
  })()

  return { names, activeName, status, refetch, setPreferredName }
}
