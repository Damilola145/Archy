import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { activeChain } from '@/config'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Search, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react'
import { normalizeName, formatName, daysUntilExpiry } from '@/utils/nameNormalize'
import { parseOnchainError, formatAddress } from '@/utils/formatAddress'
import { getUsdc } from '@/onchain-facts'
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useResolveAddr } from '@/hooks/useResolver'
import { useExpiry } from '@/hooks/useNameRegistry'
import TxButton from './TxButton'

const CHAIN_ID = activeChain.id
const usdcFact = getUsdc(CHAIN_ID)

export default function SendScreen() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== CHAIN_ID

  const [recipientInput, setRecipientInput] = useState('')
  const [resolvedLabel, setResolvedLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const normalizeResult = resolvedLabel ? normalizeName(resolvedLabel) : null
  const normalized = normalizeResult?.ok ? normalizeResult.normalized : null

  const { data: resolvedAddr, isLoading: resolving } = useResolveAddr(normalized ?? '')
  const { data: expiry } = useExpiry(normalized ?? '')

  const { data: rawBalance } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address) && Boolean(usdcFact) },
  })

  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const formattedBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(CHAIN_ID)).toFixed(2)
    : null

  const days = expiry !== undefined ? daysUntilExpiry(expiry) : null
  const expiring = days !== null && days < 30
  // firstTime recipients get a warning (future feature — address already shown in review)

  function handleSearch() {
    const label = recipientInput.replace(/\.arc$/, '').trim()
    const result = normalizeName(label)
    if (!result.ok) {
      toast.error(result.reason)
      return
    }
    setResolvedLabel(result.normalized)
    setConfirmed(false)
  }

  function handleSend() {
    if (!resolvedAddr || !usdcFact || !amount) return
    let parsed: ReturnType<typeof parseAmount>
    try {
      parsed = parseAmount(CHAIN_ID, amount)
    } catch {
      toast.error('Invalid amount')
      return
    }

    writeContract({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [resolvedAddr, parsed.raw],
      chainId: CHAIN_ID,
    })
  }

  const noAddress = resolvedAddr === '0x0000000000000000000000000000000000000000' || !resolvedAddr

  return (
    <div className="space-y-4">
      {/* Recipient */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: 'var(--muted)' }}>
          To
        </label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            placeholder="name.arc or 0x..."
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="rounded-xl px-3 transition hover:bg-black/5"
            style={{ border: '1px solid var(--border)' }}
          >
            <Search className="size-4" style={{ color: 'var(--accent)' }} />
          </button>
        </div>

        {/* Resolution result */}
        {normalized && (
          <div className="mt-3 space-y-2">
            {resolving ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" style={{ color: 'var(--muted)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Resolving...</span>
              </div>
            ) : noAddress ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(186,43,76,0.06)' }}>
                <AlertTriangle className="size-4" style={{ color: 'var(--danger)' }} />
                <span className="text-xs" style={{ color: 'var(--danger)' }}>
                  {formatName(normalized)} has no address record set.
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{formatName(normalized)}</div>
                    <div className="mono text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{formatAddress(resolvedAddr)}</div>
                  </div>
                  <CheckCircle className="size-4" style={{ color: 'var(--success)' }} />
                </div>
                {expiring && (
                  <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(186,43,76,0.06)', color: 'var(--danger)' }}>
                    <AlertTriangle className="size-3.5" />
                    Name expires in {days} days — recipient should renew soon.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Amount */}
      {!noAddress && resolvedAddr && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <div className="flex items-baseline gap-2">
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
          <div className="flex items-center justify-between mt-2">
            <input
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: 'var(--subtle)' }}
              placeholder="Memo (optional)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={128}
            />
            {formattedBalance && (
              <button
                onClick={() => setAmount(formattedBalance)}
                className="text-xs font-semibold shrink-0"
                style={{ color: 'var(--accent-hover)' }}
              >
                Max {formattedBalance}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirm preview */}
      {!noAddress && resolvedAddr && amount && !confirmed && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Review</p>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--ink-2)' }}>To</span>
            <span className="font-medium mono text-xs" style={{ color: 'var(--ink)' }}>{formatAddress(resolvedAddr)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--ink-2)' }}>Amount</span>
            <span className="display font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{amount} USDC</span>
          </div>
          {memo && (
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--ink-2)' }}>Memo</span>
              <span className="font-medium" style={{ color: 'var(--ink)' }}>{memo}</span>
            </div>
          )}
          <p className="text-xs pt-1" style={{ color: 'var(--muted)' }}>
            Address resolved at send time. Sending USDC directly — no intermediary.
          </p>
        </div>
      )}

      {!noAddress && resolvedAddr && amount && (
        <TxButton
          onClick={handleSend}
          isConnected={isConnected}
          wrongChain={wrongChain}
          onSwitchChain={() => switchChain({ chainId: CHAIN_ID })}
          isPending={isPending}
          isConfirming={isConfirming}
          disabled={!amount || Number(amount) <= 0}
          label={`Send ${amount} USDC to ${formatName(normalized!)}`}
        />
      )}

      {isSuccess && hash && (
        <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(26,128,71,0.06)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4" style={{ color: 'var(--success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>Sent</span>
          </div>
          <a href={buildTxExplorerUrl(CHAIN_ID, hash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
            Explorer <ExternalLink className="size-3" />
          </a>
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
