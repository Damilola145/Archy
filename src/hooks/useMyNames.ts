/**
 * useMyNames — single source of truth for names owned by a wallet.
 *
 * Design (one name per wallet):
 *  - seedName(label) is the AUTHORITATIVE write path — used after a mint.
 *    It writes synchronously to state + localStorage and marks status ready.
 *    The log scan NEVER overwrites a seeded name.
 *  - reverseRecord (onchain) is used to recover the name on page reload.
 *  - balanceOf = 0 confirms no name (fast empty path).
 *  - getLogs is background-only enrichment — its results only ADD names,
 *    never REMOVE or OVERWRITE names that are already in state.
 *  - A 10s timeout sets status = 'ready' when nothing else resolves it,
 *    so the UI never stays stuck on 'loading' forever.
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
const CACHE_PREFIX  = `arc-name-owned:${CHAIN_ID}:`
const ACTIVE_PREFIX = `arc-name-active:${CHAIN_ID}:`

export type MyNamesStatus = 'loading' | 'ready' | 'error'

export interface UseMyNamesResult {
  names: string[]
  activeName: string | null
  status: MyNamesStatus
  refetch: () => void
  setPreferredName: (label: string) => void
  /** Call immediately after mint — writes name to state + cache, never blocked by RPC */
  seedName: (label: string) => void
}

// ── Viem public client ────────────────────────────────────────────────────────
const viemClient = createPublicClient({
  chain: activeChain,
  transport: http(activeChain.rpcUrls.default.http[0]),
})

// ── Minimal ABI slices ────────────────────────────────────────────────────────
const OWNER_OF_ABI = [
  {
    type: 'function', name: 'ownerOf',
    inputs:  [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

const NAME_REGISTERED_EVENT = {
  type: 'event', name: 'NameRegistered',
  inputs: [
    { name: 'node',   type: 'bytes32', indexed: true  },
    { name: 'label',  type: 'string',  indexed: false },
    { name: 'owner',  type: 'address', indexed: true  },
    { name: 'expiry', type: 'uint256', indexed: false },
  ],
} as const

// ── localStorage helpers ──────────────────────────────────────────────────────
function cacheKey(addr: string)  { return CACHE_PREFIX  + addr.toLowerCase() }
function activeKey(addr: string) { return ACTIVE_PREFIX + addr.toLowerCase() }

function readCache(addr: string): string[] {
  try { return JSON.parse(localStorage.getItem(cacheKey(addr)) ?? '[]') as string[] }
  catch { return [] }
}
function writeCache(addr: string, names: string[]) {
  try { localStorage.setItem(cacheKey(addr), JSON.stringify(names.slice(0, 1))) } catch { /* noop */ }
}
function readActivePref(addr: string): string | null {
  try { return localStorage.getItem(activeKey(addr)) } catch { return null }
}
export function writeActivePreference(addr: string, label: string) {
  try { localStorage.setItem(activeKey(addr), label) } catch { /* noop */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(label)) as `0x${string}`
}

async function verifyOwned(label: string, address: `0x${string}`): Promise<boolean> {
  try {
    const owner = await viemClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: OWNER_OF_ABI,
      functionName: 'ownerOf',
      args: [BigInt(labelhash(label))],
    })
    return typeof owner === 'string' && owner.toLowerCase() === address.toLowerCase()
  } catch { return false }
}

// Best-effort log scan — silently returns [] on any failure
async function scanLabels(address: `0x${string}`, signal: AbortSignal): Promise<string[]> {
  try {
    const latest = await viemClient.getBlockNumber()
    const found  = new Set<string>()
    for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK + 1n) {
      if (signal.aborted) break
      const to = from + CHUNK > latest ? latest : from + CHUNK
      try {
        const logs = await viemClient.getLogs({
          address: REGISTRY_ADDRESS,
          event:   NAME_REGISTERED_EVENT,
          args:    { owner: address },
          fromBlock: from,
          toBlock:   to,
        })
        for (const l of logs) if (l.args.label) found.add(l.args.label)
      } catch { /* skip chunk */ }
    }
    return [...found]
  } catch { return [] }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useMyNames(): UseMyNamesResult {
  const { address } = useAccount()

  // seededRef tracks labels written by seedName so the log scan never overwrites them
  const seededRef    = useRef<string | null>(null)
  const scanAbortRef = useRef<AbortController | null>(null)
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  // addressRef always holds the latest address — seedName reads from this, not its closure
  const addressRef   = useRef(address)
  useEffect(() => { addressRef.current = address }, [address])

  const [names,  setNames]  = useState<string[]>([])
  const [status, setStatus] = useState<MyNamesStatus>('loading')
  const [tick,   setTick]   = useState(0)

  // ── wagmi reads ──────────────────────────────────────────────────────────
  const { data: reverseRecord, refetch: refetchReverse } = useReadContract({
    address: REVERSE_REGISTRAR_ADDRESS,
    abi:     REVERSE_REGISTRAR_ABI,
    functionName: 'name',
    args:  [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(address) },
  })

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi:     REGISTRY_ABI,
    functionName: 'balanceOf',
    args:  [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(address) },
  })

  // ── Public API ───────────────────────────────────────────────────────────

  /** Force all wagmi reads to re-query and re-run the scan */
  const refetch = useCallback(() => {
    void refetchReverse()
    void refetchBalance()
    setTick(t => t + 1)
  }, [refetchReverse, refetchBalance])

  const setPreferredName = useCallback((label: string) => {
    if (!address) return
    writeActivePreference(address, label)
    setTick(t => t + 1)
  }, [address])

  /**
   * seedName — call immediately after a successful mint.
   *
   * Writes the label directly to state + cache so the home screen and receive
   * page update INSTANTLY, before any chain read.  The log scan will NEVER
   * overwrite this value (seededRef guards it).
   */
  const seedName = useCallback((label: string) => {
    // Use addressRef so this always sees the current address,
    // even if the useCallback closure was created before address resolved
    const addr = addressRef.current
    if (!addr) return
    seededRef.current = label
    writeCache(addr, [label])
    writeActivePreference(addr, label)
    setNames([label])
    setStatus('ready')
    // Background: kick off chain validation after delay
    setTimeout(() => {
      void refetchReverse()
      void refetchBalance()
    }, 2_000)
    setTimeout(() => {
      void refetchReverse()
    }, 7_000)
  // addressRef is a ref — intentionally not in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchReverse, refetchBalance])

  // ── Effect 1: address change — seed from cache instantly ─────────────────
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    seededRef.current = null

    if (!address) {
      setNames([])
      setStatus('ready')
      return
    }

    const cached = readCache(address)
    if (cached.length > 0) {
      seededRef.current = cached[0]  // treat cached name as seeded (verified previously)
      setNames(cached)
      setStatus('ready')
    } else {
      setNames([])
      setStatus('loading')
      // Safety timeout — if nothing resolves in 10s, stop spinning
      timeoutRef.current = setTimeout(() => {
        setStatus(s => s === 'loading' ? 'ready' : s)
      }, 10_000)
    }

    return () => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }
  }, [address])

  // ── Effect 2: balance = 0 confirmed → definitely no names ────────────────
  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    if (balance !== 0n) return
    // Only clear if we don't have a seeded name (seedName takes priority)
    if (seededRef.current) return
    writeCache(address, [])
    setNames([])
    setStatus('ready')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, balance])

  // ── Effect 3: reverseRecord arrived — verify and set as name ─────────────
  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    if (typeof reverseRecord !== 'string' || reverseRecord.length === 0) return

    const rev = reverseRecord

    void (async () => {
      const owned = await verifyOwned(rev, address)
      if (!owned) return  // stale reverse record, ignore

      // reverseRecord is valid — update names (merge, don't replace seeded name)
      setNames(prev => {
        // If seeded name is different from reverse record, prefer seeded
        // (user just minted; reverse record may not be set yet)
        if (seededRef.current && seededRef.current !== rev) {
          // Both are valid — seeded is more recent, keep it as first
          const merged = [seededRef.current, ...prev.filter(n => n !== seededRef.current && n !== rev)]
          const capped = merged.slice(0, 1)
          writeCache(address, capped)
          return capped
        }
        // Reverse record matches or no seed — use reverse record
        seededRef.current = rev
        const capped = [rev]
        writeCache(address, capped)
        writeActivePreference(address, rev)
        return capped
      })
      setStatus('ready')
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, reverseRecord])

  // ── Effect 4: background log scan (enrichment only, never overwrites) ────
  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    if (balance === undefined || balance === 0n) return

    scanAbortRef.current?.abort()
    const ctrl = new AbortController()
    scanAbortRef.current = ctrl

    void (async () => {
      const eventLabels = await scanLabels(address, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (eventLabels.length === 0) {
        // Scan found nothing — don't overwrite existing state, just clear loading
        setStatus(prev => prev === 'loading' ? 'ready' : prev)
        return
      }

      // We have event labels — verify the first one (one name per wallet)
      const label = eventLabels[0]

      // CRITICAL: if seedName already set a name, don't overwrite it
      if (seededRef.current) return

      const owned = await verifyOwned(label, address)
      if (ctrl.signal.aborted) return
      if (!owned) {
        setStatus(prev => prev === 'loading' ? 'ready' : prev)
        return
      }

      // Log scan confirmed ownership — set name (only if not already seeded)
      if (seededRef.current) return
      seededRef.current = label
      writeCache(address, [label])
      writeActivePreference(address, label)
      setNames([label])
      setStatus('ready')
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    })()

    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tick, balance === 0n ? 0 : balance === undefined ? -1 : 1])

  // ── Derive activeName ─────────────────────────────────────────────────────
  const activeName: string | null = (() => {
    if (names.length === 0) return null
    if (address) {
      const pref = readActivePref(address)
      if (pref && names.includes(pref)) return pref
    }
    return names[0]
  })()

  return { names, activeName, status, refetch, setPreferredName, seedName }
}
