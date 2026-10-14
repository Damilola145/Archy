import { useState, useCallback, useRef } from 'react'
import { useAccount, useSwitchChain, useReadContract, usePublicClient, useWriteContract } from 'wagmi'
import { activeChain } from '@/config'
import { toast } from 'sonner'
import { Settings, CheckCircle, Loader2, Link, Search, ExternalLink } from 'lucide-react'
import { useReverseName } from '@/hooks/useResolver'
import { useOwnerOf } from '@/hooks/useNameRegistry'
import { parseOnchainError, formatAddress } from '@/utils/formatAddress'
import { normalizeName, formatName } from '@/utils/nameNormalize'
import {
  REGISTRY_ADDRESS, REGISTRY_ABI, RESOLVER_ADDRESS, RESOLVER_ABI,
  REVERSE_REGISTRAR_ADDRESS, REVERSE_REGISTRAR_ABI, CONTRACTS_DEPLOYED,
} from '@/contracts'
import TxButton from './TxButton'
import { labelhash } from '@/hooks/useNameRegistry'

const CHAIN_ID = activeChain.id
const EXPLORER  = activeChain.blockExplorers?.default.url ?? ''

// ── helpers ───────────────────────────────────────────────────────────────────

function explorerTxUrl(hash: string) { return `${EXPLORER}/tx/${hash}` }

// ── useTxFlow: shared simulate → write → receipt flow with watchdog ──────────
function useTxFlow() {
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const { writeContractAsync } = useWriteContract()
  const [phase, setPhase]   = useState<'idle' | 'simulating' | 'wallet' | 'confirming' | 'done' | 'error'>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearWatchdog() {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
  }

  async function run(
    request: Parameters<typeof writeContractAsync>[0],
  ) {
    setPhase('simulating'); setErrMsg(null); setTxHash(null)
    try {
      // Pre-flight simulation
      if (publicClient) {
        await publicClient.simulateContract(request as Parameters<typeof publicClient.simulateContract>[0])
      }
      setPhase('wallet')
      // 90-second wallet watchdog
      watchdogRef.current = setTimeout(() => {
        setPhase('error')
        setErrMsg('No response from wallet after 90s — open your wallet app and check for a pending request')
      }, 90_000)
      const hash = await writeContractAsync(request)
      clearWatchdog()
      setTxHash(hash)
      setPhase('confirming')
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 300_000 })
      }
      setPhase('done')
      return hash
    } catch (e: unknown) {
      clearWatchdog()
      setPhase('error')
      setErrMsg(parseOnchainError(e))
      throw e
    }
  }

  function reset() { setPhase('idle'); setErrMsg(null); setTxHash(null) }

  return {
    run, reset,
    isPending:    phase === 'simulating' || phase === 'wallet',
    isConfirming: phase === 'confirming',
    isDone:       phase === 'done',
    isError:      phase === 'error',
    txHash,
    errMsg,
    phase,
  }
}

// ── LinkAddressPanel ──────────────────────────────────────────────────────────
// Hidden when addr(node) already equals the connected wallet (v3 default after mint).
// Visible only as an optional "override payout address" panel.
function LinkAddressPanel() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== CHAIN_ID

  const [input, setInput]   = useState('')
  const [label, setLabel]   = useState('')
  const [searched, setSearched] = useState(false)

  const normalizeResult = label ? normalizeName(label) : null
  const normalized      = normalizeResult?.ok ? normalizeResult.normalized : null
  const node            = normalized ? labelhash(normalized) : null

  const { data: onChainOwner, isLoading: ownerLoading } = useOwnerOf(normalized ?? '')

  // Current resolved addr — to detect when it already equals the wallet
  const { data: currentAddr, refetch: refetchAddr } = useReadContract({
    address: RESOLVER_ADDRESS, abi: RESOLVER_ABI,
    functionName: 'addr',
    args: node ? [node] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(node) },
  })

  const isOwner = Boolean(
    address && onChainOwner &&
    onChainOwner.toLowerCase() === address.toLowerCase()
  )
  const alreadyLinked = Boolean(
    address && currentAddr &&
    (currentAddr as string).toLowerCase() === address.toLowerCase() &&
    currentAddr !== '0x0000000000000000000000000000000000000000'
  )

  const tx = useTxFlow()

  const handleSearch = useCallback(() => {
    if (!input.trim()) return
    const result = normalizeName(input.trim())
    if (!result.ok) { toast.error(result.reason); return }
    setLabel(result.normalized)
    setSearched(true)
    tx.reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  const handleLink = useCallback(async () => {
    if (!address || !node) return
    await tx.run({
      address: RESOLVER_ADDRESS,
      abi: RESOLVER_ABI,
      functionName: 'setAddr',
      args: [node, address],
      chainId: CHAIN_ID,
    })
    void refetchAddr()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, node])

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Link className="size-4" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Override payout address</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        After minting, your name already resolves to your wallet automatically. Use this only to change it to a different address.
      </p>

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
          <Search className="size-3.5 shrink-0" style={{ color: 'var(--subtle)' }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="yourname"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\.arc$/, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>.arc</span>
        </div>
        <button
          onClick={handleSearch}
          className="rounded-xl px-3 text-xs font-semibold text-white transition hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          Check
        </button>
      </div>

      {/* Result */}
      {searched && normalized && (
        <div className="space-y-2">
          {ownerLoading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <Loader2 className="size-3.5 animate-spin" /> Checking…
            </div>
          ) : !onChainOwner || onChainOwner === '0x0000000000000000000000000000000000000000' ? (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{formatName(normalized)} is not minted yet.</p>
          ) : !isOwner ? (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {formatName(normalized)} is owned by {formatAddress(onChainOwner)}, not your wallet.
            </p>
          ) : tx.isDone || alreadyLinked ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
                <CheckCircle className="size-3.5" />
                {formatName(normalized)} resolves to your wallet.
              </div>
              {tx.txHash && (
                <a href={explorerTxUrl(tx.txHash)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                  <ExternalLink className="size-3" /> View on explorer
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                You own <strong>{formatName(normalized)}</strong>. Current address:{' '}
                <span className="font-mono">{currentAddr && currentAddr !== '0x0000000000000000000000000000000000000000' ? formatAddress(currentAddr) : 'not set'}</span>
              </div>
              <TxButton
                onClick={() => { void handleLink() }}
                isConnected={isConnected}
                wrongChain={wrongChain}
                onSwitchChain={() => switchChain({ chainId: CHAIN_ID })}
                isPending={tx.isPending}
                isConfirming={tx.isConfirming}
                label={`Link ${formatName(normalized)} → my wallet`}
              />
              {tx.isError && tx.errMsg && (
                <div className="space-y-1">
                  <p className="text-xs" style={{ color: 'var(--danger)' }}>{tx.errMsg}</p>
                  <button onClick={tx.reset} className="text-xs underline" style={{ color: 'var(--accent)' }}>Retry</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── SetPrimaryPanel ───────────────────────────────────────────────────────────
function SetPrimaryPanel({ label, currentPrimary }: { label: string; currentPrimary: string | undefined }) {
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const tx = useTxFlow()
  const isPrimary = currentPrimary === label

  const handle = useCallback(async () => {
    await tx.run({
      address: REVERSE_REGISTRAR_ADDRESS,
      abi: REVERSE_REGISTRAR_ABI,
      functionName: 'setName',
      args: [label],
      chainId: CHAIN_ID,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])

  if (isPrimary || tx.isDone) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
        <CheckCircle className="size-3.5" />
        {tx.txHash ? (
          <a href={explorerTxUrl(tx.txHash)} target="_blank" rel="noreferrer"
            className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
            Primary name set <ExternalLink className="size-3" />
          </a>
        ) : 'Primary name'}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <TxButton
        onClick={() => { void handle() }}
        isConnected={isConnected}
        wrongChain={wrongChain}
        onSwitchChain={() => switchChain({ chainId: CHAIN_ID })}
        isPending={tx.isPending}
        isConfirming={tx.isConfirming}
        label="Set primary"
        className="!py-2.5 !text-xs"
      />
      {tx.isError && tx.errMsg && (
        <div className="space-y-1">
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{tx.errMsg}</p>
          <button onClick={tx.reset} className="text-xs underline" style={{ color: 'var(--accent)' }}>Retry</button>
        </div>
      )}
    </div>
  )
}

// ── SetAddrPanel ──────────────────────────────────────────────────────────────
function SetAddrPanel({ label }: { label: string }) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const [newAddr, setNewAddr] = useState('')
  const node = labelhash(label)
  const tx   = useTxFlow()

  const handle = useCallback(async () => {
    const val = newAddr.trim()
    if (!val) { toast.error('Enter an address'); return }
    if (!/^0x[0-9a-fA-F]{40}$/.test(val)) { toast.error('Enter a valid 0x… address'); return }
    await tx.run({
      address: RESOLVER_ADDRESS,
      abi: RESOLVER_ABI,
      functionName: 'setAddr',
      args: [node, val],
      chainId: CHAIN_ID,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newAddr, node])

  return (
    <div className="space-y-2">
      <label className="text-xs" style={{ color: 'var(--muted)' }}>Override resolver address</label>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl px-3 py-2 text-xs font-mono outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          placeholder={`Current: ${formatAddress(address ?? '')}`}
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
        />
        <TxButton
          onClick={() => { void handle() }}
          isConnected={isConnected}
          wrongChain={wrongChain}
          onSwitchChain={() => switchChain({ chainId: CHAIN_ID })}
          isPending={tx.isPending}
          isConfirming={tx.isConfirming}
          label="Update"
          className="!py-2 !px-3 !text-xs !w-auto shrink-0"
        />
      </div>
      {tx.isDone && tx.txHash && (
        <a href={explorerTxUrl(tx.txHash)} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
          <ExternalLink className="size-3" /> View on explorer
        </a>
      )}
      {tx.isError && tx.errMsg && (
        <div className="space-y-1">
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{tx.errMsg}</p>
          <button onClick={tx.reset} className="text-xs underline" style={{ color: 'var(--accent)' }}>Retry</button>
        </div>
      )}
    </div>
  )
}

// ── Main Settings screen ──────────────────────────────────────────────────────
interface SettingsScreenProps {
  ownedNames: string[]
}

export default function SettingsScreen({ ownedNames }: SettingsScreenProps) {
  const { address, isConnected } = useAccount()

  const { data: primaryName } = useReverseName(address)

  // Registrar wiring check
  const { data: currentRegistrar } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'registrar',
    query: { enabled: CONTRACTS_DEPLOYED },
  })
  const registrarWired = Boolean(
    currentRegistrar && currentRegistrar !== '0x0000000000000000000000000000000000000000'
  )

  if (!isConnected) {
    return (
      <div className="py-12 text-center">
        <Settings className="size-8 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to manage settings.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {!registrarWired && (
        <div className="rounded-2xl p-4 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--ink)' }}>
          The registry is not yet wired. Connect the owner wallet and use the amber banner at the top to complete setup.
        </div>
      )}

      {/* Optional override-payout panel */}
      <LinkAddressPanel />

      {/* Indexed names list */}
      {ownedNames.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Your Names</p>
          <div className="space-y-3">
            {ownedNames.map((lbl) => (
              <div
                key={lbl}
                className="rounded-2xl p-4 space-y-3"
                style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="display text-sm font-semibold" style={{ color: 'var(--ink)' }}>{formatName(lbl)}</span>
                  {primaryName === lbl && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}>
                      Primary
                    </span>
                  )}
                </div>
                <SetPrimaryPanel label={lbl} currentPrimary={primaryName} />
                <SetAddrPanel label={lbl} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
