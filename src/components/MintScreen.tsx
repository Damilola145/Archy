/**
 * MintScreen — commit-reveal name minting UI
 *
 * Uses useMintFlow for the full state machine (M3, M4, M6, M7, M8).
 * Uses useBootCheck to block minting when contracts aren't wired (M2).
 * Post-mint: optional "Set as primary name" button (simulateContract first).
 */
import { useState, useCallback } from 'react'
import { useAccount, useSwitchChain, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Search, CheckCircle, XCircle, Loader2, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatName } from '@/utils/nameNormalize'
import { useMintFlow } from '@/hooks/useMintFlow'
import { useBootCheck } from '@/hooks/useBootCheck'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { activeChain } from '@/config'
import { parseOnchainError } from '@/utils/formatAddress'
import { REVERSE_REGISTRAR_ADDRESS, REVERSE_REGISTRAR_ABI, CONTRACTS_DEPLOYED } from '@/contracts'
import type { UseMyNamesResult } from '@/hooks/useMyNames'

const CHAIN_ID = activeChain.id

interface MintScreenProps {
  myNames: UseMyNamesResult
  onMintComplete?: () => void
}

// ── SetPrimaryButton: optional post-mint action ───────────────────────────────
function SetPrimaryButton({ label }: { label: string }) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  const { writeContractAsync, isPending } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [simErr, setSimErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined, confirmations: 1, timeout: 300_000,
  })

  const handle = useCallback(async () => {
    if (!address || !publicClient || !CONTRACTS_DEPLOYED) return
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    setSimErr(null)
    const req = {
      address: REVERSE_REGISTRAR_ADDRESS,
      abi: REVERSE_REGISTRAR_ABI,
      functionName: 'setName' as const,
      args: [label] as [string],
      chainId: CHAIN_ID,
    }
    try {
      await publicClient.simulateContract({ ...req, account: address })
      const hash = await writeContractAsync(req)
      setTxHash(hash)
    } catch (e: unknown) {
      setSimErr(parseOnchainError(e instanceof Error ? e : new Error(String(e))))
    }
  }, [address, publicClient, wrongChain, switchChain, label, writeContractAsync])

  if (done || isSuccess) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
        <CheckCircle className="size-3.5" />
        Set as primary name
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => { void handle(); if (isSuccess) setDone(true) }}
        disabled={isPending || isConfirming}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-90 disabled:opacity-40"
        style={{ background: 'rgba(16,97,166,0.1)', color: 'var(--accent)' }}
      >
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Setting primary…' : 'Set as primary name'}
      </button>
      {simErr && <p className="text-xs" style={{ color: 'var(--danger)' }}>{simErr}</p>}
    </div>
  )
}

export default function MintScreen({ myNames, onMintComplete }: MintScreenProps) {
  const boot = useBootCheck()
  const { names, status } = myNames
  const {
    input, setInput,
    label, normalized,
    availState, refetchAvail,
    phase, countdown,
    commitTxHash, registerTxHash,
    commitWalletPending, registerWalletPending,
    commitReceiptLoading, registerReceiptLoading,
    mintError,
    wrongChain, handleSwitchChain, isConnected,
    handleSearch, handleCommit, handleRegister, handleReset,
  } = useMintFlow(onMintComplete)

  // ── Boot check gate ───────────────────────────────────────────────────────
  if (!boot.checking && !boot.ok) {
    return (
      <div className="rounded-2xl p-5 space-y-2" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.2)' }}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Contract setup incomplete</p>
        </div>
        {boot.failures.map((f, i) => (
          <p key={i} className="text-xs font-mono" style={{ color: 'var(--danger)' }}>{f}</p>
        ))}
      </div>
    )
  }

  // ── Already owns a name — only when status is ready (not while loading) ──
  if (status === 'ready' && names.length > 0 && phase === 'idle') {
    return (
      <div className="rounded-2xl p-5 flex items-center gap-3" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.2)' }}>
        <CheckCircle className="size-6 shrink-0" style={{ color: 'var(--success)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            You own <strong>{formatName(names[0])}</strong>
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Each wallet holds one arc.name. Manage it in Settings.
          </p>
        </div>
      </div>
    )
  }

  // ── Wrong chain warning ───────────────────────────────────────────────────
  const wrongChainBanner = wrongChain && (
    <div className="rounded-2xl p-3 flex items-center justify-between gap-3" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.2)' }}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          Wrong network — switch to Arc {activeChain.testnet ? 'Testnet' : 'Mainnet'} to mint.
        </p>
      </div>
      <button onClick={handleSwitchChain} className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
        style={{ background: 'var(--accent)', color: 'white' }}>
        Switch
      </button>
    </div>
  )

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = [
    { key: 'commit',    label: 'Commit' },
    { key: 'wait',      label: 'Wait' },
    { key: 'register',  label: 'Mint' },
  ]
  const stepIdx = phase === 'committing' || phase === 'confirming-commit' ? 0
    : phase === 'waiting' ? 1
    : phase === 'ready' || phase === 'registering' || phase === 'confirming-register' ? 2
    : -1
  const stepDone = phase === 'done'

  // ── Wallet tx explorer link ───────────────────────────────────────────────
  const txLink = (hash: `0x${string}` | null) =>
    hash ? buildTxExplorerUrl(CHAIN_ID, hash) : null

  return (
    <div className="space-y-4">
      {/* Search */}
      {(phase === 'idle' || phase === 'search') && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: 'var(--muted)' }}>Find a name</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
              <Search className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
              <input
                className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--ink)' }}
                placeholder="yourname.arc" value={input}
                onChange={(e) => setInput(e.target.value.replace(/\.arc$/, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <span className="text-sm" style={{ color: 'var(--subtle)' }}>.arc</span>
            </div>
            <button onClick={handleSearch}
              className="rounded-xl px-4 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}>
              Search
            </button>
          </div>

          {/* M8: availability states */}
          {normalized && (
            <div className="mt-3">
              {availState === 'loading' && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                  <Loader2 className="size-3.5 animate-spin" /> Checking availability…
                </div>
              )}
              {availState === 'error' && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--danger)' }}>
                  <AlertTriangle className="size-3.5" />
                  RPC error checking availability.
                  <button onClick={() => void refetchAvail()} className="underline">Retry</button>
                </div>
              )}
              {availState === 'taken' && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--danger)' }}>
                  <XCircle className="size-4" /> <strong>{formatName(normalized)}</strong> is already taken.
                </div>
              )}
              {availState === 'available' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
                    <CheckCircle className="size-4" /> <strong>{formatName(normalized)}</strong> is available — free to mint (you pay gas only).
                  </div>
                  {!isConnected ? (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Connect your wallet to claim this name.</p>
                  ) : wrongChain ? (
                    wrongChainBanner
                  ) : (
                    <button
                      onClick={() => void handleCommit()}
                      className="w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
                      style={{ background: 'var(--accent)' }}
                    >
                      Claim {formatName(normalized)}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {wrongChainBanner && phase !== 'idle' && phase !== 'search' && wrongChainBanner}

      {/* Progress stepper */}
      {stepIdx >= 0 && !stepDone && (
        <div className="flex items-center gap-2 px-1">
          {steps.map((s, i) => {
            const done  = i < stepIdx
            const active = i === stepIdx
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div className="size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface-muted)', color: (done || active) ? 'white' : 'var(--muted)' }}>
                  {done ? '✓' : i + 1}
                </div>
                <span className="text-xs" style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>{s.label}</span>
                {i < 2 && <div className="h-px w-4 shrink-0" style={{ background: 'var(--border)' }} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Committing / confirming commit */}
      {(phase === 'committing' || phase === 'confirming-commit') && (
        <div className="rounded-2xl p-5 text-center space-y-2" style={{ background: 'var(--surface-muted)' }}>
          <Loader2 className="size-6 animate-spin mx-auto" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {commitWalletPending ? 'Confirm in wallet…'
              : commitReceiptLoading ? 'Confirming commitment on-chain…'
              : 'Waiting for commitment to land…'}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {commitWalletPending
              ? 'Open your wallet app if no popup appeared.'
              : 'This may take 10–30 seconds on Arc Testnet.'}
          </p>
          {commitTxHash && (
            <a href={txLink(commitTxHash) ?? '#'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Waiting countdown */}
      {phase === 'waiting' && (
        <div className="rounded-2xl p-5 text-center space-y-1" style={{ background: 'var(--surface-muted)' }}>
          <div className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{countdown}</div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>seconds until you can mint</p>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Commitment age verified from the latest block — not your device clock.
          </p>
        </div>
      )}

      {/* Ready to mint */}
      {phase === 'ready' && normalized && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Ready to mint!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Claim <strong>{formatName(normalized)}</strong> — sign the mint transaction.
            </p>
          </div>
          <button
            onClick={() => void handleRegister()}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Mint {formatName(normalized)}
          </button>
        </div>
      )}

      {/* Registering / confirming register */}
      {(phase === 'registering' || phase === 'confirming-register') && (
        <div className="rounded-2xl p-5 text-center space-y-2" style={{ background: 'var(--surface-muted)' }}>
          <Loader2 className="size-6 animate-spin mx-auto" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {registerWalletPending ? 'Confirm mint in wallet…'
              : registerReceiptLoading ? 'Minting on-chain…'
              : 'Waiting for mint to confirm…'}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {registerWalletPending ? 'Open your wallet app if no popup appeared.' : 'Almost there…'}
          </p>
          {registerTxHash && (
            <a href={txLink(registerTxHash) ?? '#'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && normalized && (
        <div className="rounded-2xl p-6 text-center space-y-4" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.2)' }}>
          <CheckCircle className="size-10 mx-auto" style={{ color: 'var(--success)' }} />
          <div>
            <p className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>{formatName(normalized)}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Your name is registered and resolves to your wallet — no extra "link" step needed.
            </p>
          </div>
          {registerTxHash && (
            <a href={txLink(registerTxHash) ?? '#'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
          {/* Optional: set as primary name */}
          <SetPrimaryButton label={normalized} />
          <button onClick={handleReset}
            className="block mx-auto text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Search another name
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && mintError && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{mintError.message}</p>
          </div>
          {mintError.retryable ? (
            <button
              onClick={mintError.step === 'commit' ? () => void handleCommit() : () => void handleRegister()}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <RefreshCw className="size-3" /> Retry {mintError.step === 'commit' ? 'Commit' : 'Mint'}
            </button>
          ) : (
            <button onClick={handleReset}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            >
              Start over
            </button>
          )}
        </div>
      )}

      {/* suppress unused label warning */}
      {label !== undefined && null}
    </div>
  )
}
