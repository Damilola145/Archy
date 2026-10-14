/**
 * useMintFlow — the complete commit-reveal-link state machine for arc.name minting.
 *
 * Fixes addressed:
 *  M3: explicit state machine with error/retry/watchdog per step
 *  M4: simulateContract pre-flight before every writeContract
 *  M6: secret + commit state persisted in localStorage; flow resumes on mount
 *  M7: countdown from on-chain commitments[c] + MIN_COMMIT_AGE - latestBlock.timestamp
 *  M8: availability returns 'loading' | 'available' | 'taken' | 'error' | 'idle'
 *
 * C2: Because ArcResolver.addr() now defaults to ownerOf() when no explicit record
 * exists, the "link address" step (tx 3) is OPTIONAL — the name resolves to the owner
 * immediately after minting. We still offer it so the user can set an explicit override.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  useAccount, useSwitchChain,
  useReadContract, useWriteContract, useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { type Hex } from 'viem'
import { toast } from 'sonner'

import {
  CONTRACTS_DEPLOYED, REGISTRY_ADDRESS, REGISTRAR_ADDRESS, RESOLVER_ADDRESS,
  REGISTRY_ABI, REGISTRAR_ABI,
} from '@/contracts'
import { makeCommitmentHash, labelhash, MIN_DURATION } from './useNameRegistry'
import { normalizeName, formatName } from '@/utils/nameNormalize'
import { parseOnchainError } from '@/utils/formatAddress'
import { activeChain } from '@/config'

const CHAIN_ID = activeChain.id
const STORAGE_KEY = 'arc-name-mint-state'
const WALLET_WATCHDOG_MS = 90_000 // 90s without a response from wallet

// ── Types ─────────────────────────────────────────────────────────────────────

export type AvailState = 'idle' | 'loading' | 'available' | 'taken' | 'error'

export type MintPhase =
  | 'idle'         // no name searched yet
  | 'search'       // name typed, availability known
  | 'committing'   // waiting for wallet to sign commit tx
  | 'confirming-commit'  // commit tx broadcast, awaiting receipt
  | 'waiting'      // MIN_COMMIT_AGE countdown
  | 'ready'        // countdown done — prompt to mint
  | 'registering'  // waiting for wallet to sign register tx
  | 'confirming-register' // register tx broadcast
  | 'done'         // registered successfully
  | 'error'        // unrecoverable error — show retry

export interface MintError {
  step: 'commit' | 'register'
  message: string
  retryable: boolean
}

interface PersistedState {
  address: string
  label: string
  secret: Hex
  commitmentHash: Hex
  commitTxHash: Hex
  committedAt: number // Date.now() when commitment tx was broadcast
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedState) : null
  } catch { return null }
}

function savePersisted(s: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* noop */ }
}

function clearPersisted() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMintFlow(onComplete?: () => void, onMintedLabel?: (label: string) => void) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain }  = useSwitchChain()
  const queryClient      = useQueryClient()
  const publicClient     = usePublicClient({ chainId: CHAIN_ID })

  // Store callbacks in refs so effects always call the latest version
  // (avoids stale closure when seedName is recreated with a new address)
  const onMintedLabelRef = useRef(onMintedLabel)
  const onCompleteRef    = useRef(onComplete)
  useEffect(() => { onMintedLabelRef.current = onMintedLabel }, [onMintedLabel])
  useEffect(() => { onCompleteRef.current    = onComplete    }, [onComplete])

  const wrongChain = isConnected && chainId !== CHAIN_ID

  // ── Input state ──────────────────────────────────────────────────────────
  const [input, setInput]       = useState('')
  const [label, setLabel]       = useState('')     // normalized label, set after search
  const [phase, setPhase]       = useState<MintPhase>('idle')
  const [mintError, setMintError] = useState<MintError | null>(null)
  const [countdown, setCountdown] = useState(0)

  // ── Secret + tx state ────────────────────────────────────────────────────
  const [secret, setSecret]           = useState<Hex | null>(null)
  const [commitmentH, setCommitmentH] = useState<Hex | null>(null) // the bytes32 commitment
  const [commitTxHash, setCommitTxHash] = useState<Hex | null>(null)
  const [registerTxHash, setRegisterTxHash] = useState<Hex | null>(null)

  // Watchdog ref — reset each time the wallet is asked to sign
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumedRef  = useRef(false) // run localStorage resume logic only once

  const normalizeResult = label ? normalizeName(label) : null
  const normalized = normalizeResult?.ok ? normalizeResult.normalized : null
  const node = normalized ? labelhash(normalized) : null

  // ── Availability (M8: explicit states) ───────────────────────────────────
  const {
    data: isAvailRaw, isLoading: availLoading, isError: availError,
    refetch: refetchAvail, queryKey: availQueryKey,
  } = useReadContract({
    address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
    functionName: 'available', args: [node ?? '0x0000000000000000000000000000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(node) && label.length >= 3 },
  })

  const availState: AvailState = !normalized ? 'idle'
    : availLoading ? 'loading'
    : availError   ? 'error'
    : isAvailRaw === true ? 'available'
    : isAvailRaw === false ? 'taken'
    : 'idle'

  // ── Commitment timestamp from chain (M7 + M6 resume) ─────────────────────
  const { data: commitmentTs, refetch: refetchCommitmentTs } = useReadContract({
    address: REGISTRAR_ADDRESS, abi: REGISTRAR_ABI,
    functionName: 'commitments',
    args: [commitmentH ?? '0x0000000000000000000000000000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(commitmentH) },
  })

  // ── ownerOf poll to confirm register without relying on receipt ───────────
  const tokenId = node ? BigInt(node) : 0n
  const { data: onChainOwner, refetch: refetchOwner } = useReadContract({
    address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
    functionName: 'ownerOf', args: [tokenId],
    chainId: CHAIN_ID,
    query: {
      enabled: CONTRACTS_DEPLOYED && Boolean(node) &&
        (phase === 'registering' || phase === 'confirming-register'),
    },
  })
  const walletOwnsName = Boolean(
    onChainOwner && address &&
    onChainOwner.toLowerCase() === address.toLowerCase()
  )

  // ── wagmi write hooks ─────────────────────────────────────────────────────
  const {
    writeContractAsync: writeCommit, isPending: commitWalletPending,
    reset: resetCommit,
  } = useWriteContract()

  const {
    writeContractAsync: writeRegister, isPending: registerWalletPending,
    reset: resetRegister,
  } = useWriteContract()

  // Receipt watchers (5m timeout)
  const {
    isSuccess: commitReceiptOk, isLoading: commitReceiptLoading,
    isError: commitReceiptError,
  } = useWaitForTransactionReceipt({
    hash: commitTxHash ?? undefined, confirmations: 1, timeout: 300_000,
  })

  const {
    isSuccess: registerReceiptOk, isLoading: registerReceiptLoading,
    isError: registerReceiptError,
  } = useWaitForTransactionReceipt({
    hash: registerTxHash ?? undefined, confirmations: 1, timeout: 300_000,
  })

  // ── M6: Resume from localStorage on mount ─────────────────────────────────
  useEffect(() => {
    if (resumedRef.current || !address || !CONTRACTS_DEPLOYED) return
    resumedRef.current = true
    const saved = loadPersisted()
    if (!saved) return
    if (saved.address.toLowerCase() !== address.toLowerCase()) { clearPersisted(); return }
    // Re-hydrate state
    setLabel(saved.label)
    setInput(saved.label)
    setSecret(saved.secret)
    setCommitmentH(saved.commitmentHash)
    setCommitTxHash(saved.commitTxHash)
    setPhase('confirming-commit') // will be advanced by commitmentTs effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  // ── M7: Countdown from on-chain timestamp ─────────────────────────────────
  useEffect(() => {
    if (!commitmentTs || commitmentTs === 0n) return
    if (phase !== 'confirming-commit' && phase !== 'waiting') return

    // MIN_COMMIT_AGE is a contract constant = 60s. Use chain time.
    const minAge = 60n
    const commitTime = Number(commitmentTs)

    function tick() {
      if (!publicClient) return
      void publicClient.getBlock().then((block) => {
        const now = Number(block.timestamp)
        const readyAt = commitTime + Number(minAge)
        const remaining = Math.max(0, readyAt - now)
        setCountdown(remaining)
        if (remaining === 0) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          setPhase('ready')
        }
      })
    }

    // Advance phase if commitment is already onchain
    if (phase === 'confirming-commit') setPhase('waiting')

    tick()
    timerRef.current = setInterval(tick, 2_000)
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitmentTs, phase === 'confirming-commit', phase === 'waiting'])

  // Poll commitment timestamp every 2s when broadcast but not yet onchain
  const commitPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!commitTxHash || (commitmentTs && commitmentTs > 0n)) {
      if (commitPollRef.current) { clearInterval(commitPollRef.current); commitPollRef.current = null }
      return
    }
    commitPollRef.current = setInterval(() => { void refetchCommitmentTs() }, 2_000)
    return () => { if (commitPollRef.current) { clearInterval(commitPollRef.current); commitPollRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitTxHash, commitmentTs])

  // Receipt confirmation fallback for commit
  useEffect(() => {
    if (commitReceiptOk && phase === 'confirming-commit') {
      void refetchCommitmentTs()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReceiptOk])

  useEffect(() => {
    if (commitReceiptError && phase === 'confirming-commit') {
      clearPersisted()
      setMintError({ step: 'commit', message: 'Commit transaction was reverted or timed out.', retryable: true })
      setPhase('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReceiptError])

  // Register receipt
  useEffect(() => {
    if ((registerReceiptOk || walletOwnsName) && (phase === 'registering' || phase === 'confirming-register')) {
      clearPersisted()
      void queryClient.invalidateQueries({ queryKey: availQueryKey })
      setPhase('done')
      toast.success(`${formatName(normalized ?? '')} is yours!`)
      if (normalized) onMintedLabelRef.current?.(normalized)
      onCompleteRef.current?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerReceiptOk, walletOwnsName])

  useEffect(() => {
    if (registerReceiptError && (phase === 'registering' || phase === 'confirming-register')) {
      clearPersisted()
      setMintError({ step: 'register', message: 'Mint transaction was reverted or timed out.', retryable: true })
      setPhase('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerReceiptError])

  // Poll ownerOf every 3s while confirming-register
  const ownerPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (phase !== 'confirming-register') {
      if (ownerPollRef.current) { clearInterval(ownerPollRef.current); ownerPollRef.current = null }
      return
    }
    ownerPollRef.current = setInterval(() => { void refetchOwner() }, 3_000)
    return () => { if (ownerPollRef.current) { clearInterval(ownerPollRef.current); ownerPollRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Watchdog cleanup on unmount
  useEffect(() => () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    if (commitPollRef.current) clearInterval(commitPollRef.current)
    if (ownerPollRef.current) clearInterval(ownerPollRef.current)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    const raw = input.replace(/\.arc$/, '').trim()
    const result = normalizeName(raw)
    if (!result.ok) { toast.error(result.reason); return }
    setLabel(result.normalized)
    setPhase('search')
    setMintError(null)
  }, [input])

  const handleCommit = useCallback(async () => {
    if (!address || !normalized || !publicClient) return
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    setMintError(null)
    resetCommit()

    // Generate fresh secret
    const rawBytes = new Uint8Array(32)
    crypto.getRandomValues(rawBytes)
    const s: Hex = `0x${Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
    const c = makeCommitmentHash(normalized, address, RESOLVER_ADDRESS, s)

    // M4: pre-flight simulate
    try {
      await publicClient.simulateContract({
        address: REGISTRAR_ADDRESS, abi: REGISTRAR_ABI,
        functionName: 'commit', args: [c], account: address,
      })
    } catch (simErr: unknown) {
      const msg = parseOnchainError(simErr instanceof Error ? simErr : new Error(String(simErr)))
      setMintError({ step: 'commit', message: `Pre-flight failed: ${msg}`, retryable: true })
      return
    }

    setPhase('committing')
    // Start 90s watchdog
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    watchdogRef.current = setTimeout(() => {
      if (phase === 'committing') {
        setMintError({ step: 'commit', message: 'Your wallet has not responded in 90 seconds. Open your wallet app and check for a pending transaction.', retryable: true })
        setPhase('error')
      }
    }, WALLET_WATCHDOG_MS)

    try {
      const txHash = await writeCommit({
        address: REGISTRAR_ADDRESS, abi: REGISTRAR_ABI,
        functionName: 'commit', args: [c], chainId: CHAIN_ID,
      })
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
      setSecret(s)
      setCommitmentH(c)
      setCommitTxHash(txHash)
      setPhase('confirming-commit')
      // M6: persist
      savePersisted({
        address, label: normalized, secret: s,
        commitmentHash: c, commitTxHash: txHash, committedAt: Date.now(),
      })
    } catch (err: unknown) {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
      const msg = parseOnchainError(err instanceof Error ? err : new Error(String(err)))
      setMintError({ step: 'commit', message: msg, retryable: true })
      setPhase('error')
    }
  }, [address, normalized, publicClient, wrongChain, switchChain, writeCommit, resetCommit, phase])

  const handleRegister = useCallback(async () => {
    if (!address || !normalized || !secret || !publicClient) return
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    setMintError(null)
    resetRegister()

    // M4: pre-flight checks
    // Re-read commitment timestamp from chain to verify age
    let latestTs: bigint
    try {
      const block = await publicClient.getBlock()
      latestTs = block.timestamp
    } catch {
      latestTs = BigInt(Math.floor(Date.now() / 1000))
    }

    if (commitmentTs === undefined || commitmentTs === 0n) {
      setMintError({ step: 'register', message: 'Commitment not found on chain. It may have expired (> 24h) or the wrong secret was used. Please start over.', retryable: false })
      setPhase('error'); return
    }
    if (latestTs < commitmentTs + 60n) {
      setMintError({ step: 'register', message: `Commitment is too new — wait ${Number(commitmentTs + 60n - latestTs)}s more.`, retryable: true })
      return
    }
    if (latestTs > commitmentTs + BigInt(86400)) {
      clearPersisted()
      setMintError({ step: 'register', message: 'Commitment expired (> 24h). Please start over with a new commit.', retryable: false })
      setPhase('error'); return
    }

    // Simulate register
    try {
      await publicClient.simulateContract({
        address: REGISTRAR_ADDRESS, abi: REGISTRAR_ABI,
        functionName: 'register',
        args: [normalized, address, RESOLVER_ADDRESS, MIN_DURATION, secret],
        account: address,
      })
    } catch (simErr: unknown) {
      const msg = parseOnchainError(simErr instanceof Error ? simErr : new Error(String(simErr)))
      setMintError({ step: 'register', message: `Pre-flight failed: ${msg}`, retryable: true })
      return
    }

    setPhase('registering')
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    watchdogRef.current = setTimeout(() => {
      if (phase === 'registering') {
        setMintError({ step: 'register', message: 'Your wallet has not responded in 90 seconds. Open your wallet app and check for a pending transaction.', retryable: true })
        setPhase('error')
      }
    }, WALLET_WATCHDOG_MS)

    try {
      const txHash = await writeRegister({
        address: REGISTRAR_ADDRESS, abi: REGISTRAR_ABI,
        functionName: 'register',
        args: [normalized, address, RESOLVER_ADDRESS, MIN_DURATION, secret],
        chainId: CHAIN_ID,
      })
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
      setRegisterTxHash(txHash)
      setPhase('confirming-register')
    } catch (err: unknown) {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
      const msg = parseOnchainError(err instanceof Error ? err : new Error(String(err)))
      setMintError({ step: 'register', message: msg, retryable: true })
      setPhase('error')
    }
  }, [
    address, normalized, secret, publicClient, wrongChain, switchChain,
    writeRegister, resetRegister, commitmentTs, phase,
  ])

  const handleReset = useCallback(() => {
    clearPersisted()
    setInput(''); setLabel(''); setSecret(null); setCommitmentH(null)
    setCommitTxHash(null); setRegisterTxHash(null)
    setPhase('idle'); setMintError(null); setCountdown(0)
    resetCommit(); resetRegister()
    resumedRef.current = false
  }, [resetCommit, resetRegister])

  // ── Chain-switch helper ───────────────────────────────────────────────────
  const handleSwitchChain = useCallback(() => {
    // If wallet doesn't know the chain, use wallet_addEthereumChain via switchChain
    // (wagmi/ConnectKit handles the chain-not-found error internally)
    switchChain({ chainId: CHAIN_ID })
  }, [switchChain])

  return {
    // Input
    input, setInput,
    label, normalized, node,
    // Availability (M8)
    availState, refetchAvail,
    // Phase
    phase,
    // Countdown (M7)
    countdown,
    // Tx hashes for explorer links
    commitTxHash, registerTxHash,
    // Loading states
    commitWalletPending, registerWalletPending,
    commitReceiptLoading, registerReceiptLoading,
    // Error
    mintError,
    // Chain
    wrongChain, handleSwitchChain,
    isConnected,
    // Handlers
    handleSearch, handleCommit, handleRegister, handleReset,
  }
}
