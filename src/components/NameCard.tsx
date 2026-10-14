import { ExternalLink, Clock, AlertTriangle } from 'lucide-react'
import { formatName, expiryLabel, daysUntilExpiry } from '@/utils/nameNormalize'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { activeChain } from '@/config'

interface NameCardProps {
  label: string
  expiry?: bigint
  txHash?: string
  onManage?: () => void
  compact?: boolean
}

export default function NameCard({ label, expiry, txHash, onManage, compact }: NameCardProps) {
  const days = expiry ? daysUntilExpiry(expiry) : null
  const expiring = days !== null && days < 30
  const expired = days !== null && days < 0

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all hover:shadow-sm"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
      }}
      onClick={onManage}
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
        style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}
      >
        {label.slice(0, 2).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="display text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
          {formatName(label)}
        </div>
        {!compact && expiry !== undefined && (
          <div className="flex items-center gap-1 mt-0.5">
            {expiring && !expired && (
              <AlertTriangle className="size-3" style={{ color: 'var(--danger)' }} />
            )}
            <Clock className="size-3" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs tabular-nums" style={{ color: expired ? 'var(--danger)' : expiring ? 'var(--danger)' : 'var(--muted)' }}>
              {expired ? 'Expired' : expiring ? `Expires in ${days}d` : `Expires ${expiryLabel(expiry)}`}
            </span>
          </div>
        )}
      </div>

      {txHash ? (
        <a
          href={buildTxExplorerUrl(activeChain.id, txHash)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <ExternalLink className="size-4" style={{ color: 'var(--subtle)' }} />
        </a>
      ) : null}
    </div>
  )
}
