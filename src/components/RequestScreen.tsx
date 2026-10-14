import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { Copy, Share2, CheckCircle, AlertTriangle } from 'lucide-react'
import { usePaymentRequest } from '@/hooks/usePaymentRequest'
import { formatName } from '@/utils/nameNormalize'
import { parseOnchainError } from '@/utils/formatAddress'
import { labelhash } from '@/hooks/useNameRegistry'
import { RESOLVER_ADDRESS, RESOLVER_ABI, CONTRACTS_DEPLOYED } from '@/contracts'
import { activeChain } from '@/config'
import type { UseMyNamesResult } from '@/hooks/useMyNames'

const CHAIN_ID = activeChain.id

interface RequestScreenProps {
  myNames: UseMyNamesResult
  onGoMint: () => void
}

export default function RequestScreen({ myNames, onGoMint }: RequestScreenProps) {
  const { address, isConnected } = useAccount()
  const { names, activeName, status } = myNames
  const { createRequest, isPending, isError, error } = usePaymentRequest()

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resolverErr, setResolverErr] = useState<string | null>(null)

  // Use selectedName or activeName as the payment target
  const targetName = selectedName ?? activeName

  // On-chain resolver check: resolver.addr(labelhash(targetName)) must equal connected wallet
  const node = targetName ? labelhash(targetName) : undefined
  const { data: resolvedAddr } = useReadContract({
    address: RESOLVER_ADDRESS,
    abi: RESOLVER_ABI,
    functionName: 'addr',
    args: [node ?? '0x0000000000000000000000000000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(node) },
  })

  const resolverMismatch = Boolean(
    address && resolvedAddr &&
    resolvedAddr !== '0x0000000000000000000000000000000000000000' &&
    (resolvedAddr as string).toLowerCase() !== address.toLowerCase()
  )

  async function handleCreate() {
    setResolverErr(null)

    if (!targetName) return

    // Amount validation
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount.')
      return
    }
    if (!/^\d*\.?\d{0,6}$/.test(amount)) {
      toast.error('Amount can have at most 6 decimal places.')
      return
    }
    if (Number(amount) === 0) {
      toast.error('Amount must be greater than zero.')
      return
    }

    // Resolver check
    if (resolverMismatch) {
      setResolverErr(
        `${formatName(targetName)} resolves to a different address. Payments would go elsewhere. Update the resolver in Settings first.`
      )
      return
    }

    try {
      const result = await createRequest({ toName: targetName, amount, memo })
      if (result) {
        setLink(result.link)
      }
    } catch (e: unknown) {
      toast.error(parseOnchainError(e instanceof Error ? e : new Error(String(e))))
    }
  }

  function handleCopy() {
    if (!link) return
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      toast.success('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleShare() {
    if (!link) return
    if (navigator.share) {
      void navigator.share({ title: 'Payment request', url: link })
    } else {
      handleCopy()
    }
  }

  if (!isConnected) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to create payment requests.</p>
      </div>
    )
  }

  // No names: show Mint CTA
  if (status === 'ready' && names.length === 0) {
    return (
      <div className="rounded-2xl p-5 space-y-3 text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <AlertTriangle className="size-8 mx-auto" style={{ color: 'var(--subtle)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>You need a name to create payment requests</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Mint a free arc.name so people can pay you by name.</p>
        <button
          onClick={onGoMint}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          Mint a name
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Request payment</p>

        {/* Name selector — show when names are loaded */}
        {status === 'ready' && names.length > 0 && (
          <div className="mb-3">
            {names.length === 1 ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
                <CheckCircle className="size-4" style={{ color: 'var(--success)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  Requesting as <strong>{formatName(names[0])}</strong>
                </span>
              </div>
            ) : (
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Requesting as</label>
                <select
                  value={targetName ?? ''}
                  onChange={e => setSelectedName(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                >
                  {names.map(n => (
                    <option key={n} value={n}>{formatName(n)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Resolver mismatch warning */}
        {resolverMismatch && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2 mb-3 text-xs"
            style={{ background: 'rgba(186,43,76,0.06)', color: 'var(--danger)' }}>
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>{formatName(targetName ?? '')} resolves to a different address. Update the resolver in Settings before creating a payment link.</span>
          </div>
        )}

        <div className="flex items-baseline gap-2 mb-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
            }}
            placeholder="0.00"
            className="display flex-1 bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>

        <input
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          placeholder="Memo (e.g. 'Coffee split')"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={128}
        />
      </div>

      {resolverErr && (
        <div className="rounded-2xl p-3 text-xs flex items-start gap-2" style={{ background: 'rgba(186,43,76,0.06)', color: 'var(--danger)' }}>
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          {resolverErr}
        </div>
      )}

      <button
        onClick={() => { void handleCreate() }}
        disabled={isPending || !amount || !targetName || resolverMismatch}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'var(--accent)' }}
      >
        {isPending ? 'Sign in wallet...' : 'Create payment link'}
      </button>

      {link && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Share this link</p>
          <div className="mono text-xs px-3 py-2 rounded-xl break-all" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
            {link}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition hover:bg-black/5"
              style={{ border: '1px solid var(--border)', color: 'var(--ink)' }}
            >
              {copied ? <CheckCircle className="size-4" style={{ color: 'var(--success)' }} /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              <Share2 className="size-4" />
              Share
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            This link is signed with your wallet (EIP-712). It expires in 72 hours.
          </p>
        </div>
      )}

      {isError && (
        <div className="rounded-2xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.06)', color: 'var(--danger)' }}>
          {parseOnchainError(error)}
        </div>
      )}
    </div>
  )
}
