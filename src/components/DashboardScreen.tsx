import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { activeChain } from '@/config'
import { erc20Abi } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import type { UseMyNamesResult } from '@/hooks/useMyNames'
import { TokenUSDC } from '@web3icons/react'
import { formatAddressShort } from '@/utils/formatAddress'
import { formatName } from '@/utils/nameNormalize'
import { Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertTriangle, AtSign, Copy } from 'lucide-react'
import { toast } from 'sonner'
import BottomSheet from './BottomSheet'

const CHAIN_ID = activeChain.id
const usdcFact = getUsdc(CHAIN_ID)

interface DashboardScreenProps {
  onSend: () => void
  onRequest: () => void
  onMint: () => void
  myNames: UseMyNamesResult
}

export default function DashboardScreen({ onSend, onRequest, onMint, myNames }: DashboardScreenProps) {
  const { address, isConnected } = useAccount()
  const { names, activeName, status, refetch, setPreferredName } = myNames
  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: rawBalance, isLoading: balLoading, refetch: refetchBal } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address) && Boolean(usdcFact) },
  })

  const formattedBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(CHAIN_ID)).toFixed(2)
    : null

  function handleCopyAddress() {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => toast.success('Address copied!'))
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Wallet className="size-10" style={{ color: 'var(--subtle)' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to view your dashboard.</p>
      </div>
    )
  }

  // Address / name line content
  const shortAddr = formatAddressShort(address ?? '')
  const nameLine = activeName
    ? `@${formatName(activeName)} → ${shortAddr}`
    : shortAddr

  // Extra names for the +N chip
  const extraNames = activeName
    ? names.filter(n => n !== activeName)
    : names.slice(1)

  return (
    <div className="space-y-4">
      {/* Hero balance card */}
      <section
        className="rounded-3xl p-5"
        style={{
          background: 'var(--surface-strong)',
          border: '1px solid var(--border)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TokenUSDC variant="branded" size={20} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              USDC Balance
            </span>
          </div>
          <button
            onClick={() => { void refetchBal() }}
            className="flex size-6 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="Refresh"
          >
            <RefreshCw className="size-3.5" style={{ color: 'var(--subtle)' }} />
          </button>
        </div>

        <div className="flex items-baseline gap-1">
          <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {balLoading ? '···' : (formattedBalance ?? '0.00')}
          </span>
          <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>

        {/* Address / name line */}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={handleCopyAddress}
            className="text-xs mono text-left transition hover:opacity-70"
            style={{ color: 'var(--muted)' }}
            title="Copy full address"
          >
            {nameLine}
          </button>
          {extraNames.length > 0 && (
            <button
              onClick={() => setSheetOpen(true)}
              className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}
            >
              +{extraNames.length}
            </button>
          )}
        </div>
      </section>

      {/* Action row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onSend}
          className="flex items-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          <ArrowUpRight className="size-4" />
          Send
        </button>
        <button
          onClick={onRequest}
          className="flex items-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold transition hover:bg-black/5"
          style={{ border: '1px solid var(--border)', color: 'var(--ink)' }}
        >
          <ArrowDownLeft className="size-4" />
          Receive
        </button>
      </div>

      {/* Minted name card — shown beneath balance when user has a name */}
      {status === 'ready' && names.length > 0 && activeName && (
        <div
          className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'var(--surface-strong)', border: '1px solid rgba(16,97,166,0.2)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="size-8 shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(16,97,166,0.1)' }}
            >
              <AtSign className="size-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>
                {formatName(activeName)}
              </p>
              <p className="text-xs mono truncate" style={{ color: 'var(--muted)' }}>
                {formatAddressShort(address ?? '')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(formatName(activeName)).then(() =>
                toast.success(`Copied ${formatName(activeName)}`)
              )
            }}
            className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
            style={{ background: 'rgba(16,97,166,0.1)', color: 'var(--accent)' }}
          >
            <Copy className="size-3.5" />
            Copy
          </button>
        </div>
      )}

      {/* CTA / skeleton / error — based on status */}
      {status === 'loading' && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between animate-pulse"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded-full" style={{ background: 'var(--border)' }} />
            <div className="h-2.5 w-40 rounded-full" style={{ background: 'var(--border)' }} />
          </div>
          <div className="h-7 w-16 rounded-xl" style={{ background: 'var(--border)' }} />
        </div>
      )}

      {status === 'error' && (
        <div
          className="rounded-2xl p-3 flex items-center gap-2 text-sm"
          style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.2)', color: 'var(--danger)' }}
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>Couldn't load your name</span>
          <button onClick={refetch} className="ml-auto text-xs font-semibold underline">Retry</button>
        </div>
      )}

      {status === 'ready' && names.length === 0 && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Get your arc.name</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Send and receive USDC by name</p>
          </div>
          <button
            onClick={onMint}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Mint free
          </button>
        </div>
      )}

      {/* Names picker bottom sheet */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Your names">
        <div className="space-y-2">
          {names.map(lbl => (
            <button
              key={lbl}
              onClick={() => {
                setPreferredName(lbl)
                setSheetOpen(false)
              }}
              className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition hover:bg-black/5"
              style={{
                background: lbl === activeName ? 'rgba(16,97,166,0.08)' : 'var(--surface-muted)',
                border: `1px solid ${lbl === activeName ? 'rgba(16,97,166,0.25)' : 'transparent'}`,
              }}
            >
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{formatName(lbl)}</span>
              {lbl === activeName && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(16,97,166,0.12)', color: 'var(--accent)' }}>
                  Active
                </span>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
