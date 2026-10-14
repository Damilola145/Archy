import { useAccount, useReadContract } from 'wagmi'
import { activeChain } from '@/config'
import { erc20Abi } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { useReverseName } from '@/hooks/useResolver'
import { TokenUSDC } from '@web3icons/react'
import { formatAddress } from '@/utils/formatAddress'
import { formatName } from '@/utils/nameNormalize'
import { Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react'

const CHAIN_ID = activeChain.id
const usdcFact = getUsdc(CHAIN_ID)

interface DashboardScreenProps {
  onSend: () => void
  onRequest: () => void
  onMint: () => void
  ownedNames: string[]
}

export default function DashboardScreen({ onSend, onRequest, onMint, ownedNames }: DashboardScreenProps) {
  const { address, isConnected } = useAccount()

  const { data: rawBalance, isLoading: balLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address) && Boolean(usdcFact) },
  })

  const { data: primaryName } = useReverseName(address)

  const formattedBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(CHAIN_ID)).toFixed(2)
    : null

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Wallet className="size-10" style={{ color: 'var(--subtle)' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to view your dashboard.</p>
      </div>
    )
  }

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
            onClick={() => { void refetch() }}
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

        <p className="mt-1.5 text-xs mono" style={{ color: 'var(--muted)' }}>
          {primaryName ? `${formatName(primaryName)} · ` : ''}{formatAddress(address ?? '')}
        </p>
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
          Request
        </button>
      </div>

      {/* No name CTA — only show if the wallet truly has no name at all */}
      {!primaryName && ownedNames.length === 0 && (
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
    </div>
  )
}
