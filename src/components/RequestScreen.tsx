import { useState } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Copy, Share2, CheckCircle } from 'lucide-react'
import { usePaymentRequest } from '@/hooks/usePaymentRequest'
import { useReverseName } from '@/hooks/useResolver'
import { formatName } from '@/utils/nameNormalize'
import { parseOnchainError } from '@/utils/formatAddress'

export default function RequestScreen() {
  const { address, isConnected } = useAccount()
  const { data: primaryName } = useReverseName(address)
  const { createRequest, isPending, isError, error } = usePaymentRequest()

  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!primaryName) {
      toast.error('Set a primary name first (Settings tab) to accept payments by name.')
      return
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount.')
      return
    }
    const result = await createRequest({ toName: primaryName, amount, memo })
    if (result) {
      setLink(result.link)
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Request payment</p>

        {primaryName && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3" style={{ background: 'var(--surface-muted)' }}>
            <CheckCircle className="size-4" style={{ color: 'var(--success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Requesting as <strong>{formatName(primaryName)}</strong>
            </span>
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

      <button
        onClick={() => { void handleCreate() }}
        disabled={isPending || !amount}
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
