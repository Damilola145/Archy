import { useState } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Copy, CheckCircle, AlertTriangle, AtSign } from 'lucide-react'
import { formatName } from '@/utils/nameNormalize'
import type { UseMyNamesResult } from '@/hooks/useMyNames'

interface ReceiveScreenProps {
  myNames: UseMyNamesResult
  onGoMint: () => void
}

export default function ReceiveScreen({ myNames, onGoMint }: ReceiveScreenProps) {
  const { address, isConnected } = useAccount()
  const { names, activeName, status } = myNames
  const [copiedName, setCopiedName] = useState<string | null>(null)

  function copyName(label: string) {
    const full = formatName(label)
    void navigator.clipboard.writeText(full).then(() => {
      setCopiedName(label)
      toast.success(`Copied ${full}`)
      setTimeout(() => setCopiedName(null), 2000)
    })
  }

  function copyAddress() {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => {
      toast.success('Address copied!')
    })
  }

  if (!isConnected) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Connect your wallet to view your receive details.
        </p>
      </div>
    )
  }

  // Loading skeleton
  if (status === 'loading') {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-6 w-32 rounded-full mx-auto" style={{ background: 'var(--border)' }} />
        <div className="rounded-3xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <div className="space-y-3">
            <div className="h-4 w-24 rounded-full" style={{ background: 'var(--border)' }} />
            <div className="h-8 w-48 rounded-full" style={{ background: 'var(--border)' }} />
            <div className="h-10 w-full rounded-2xl" style={{ background: 'var(--border)' }} />
          </div>
        </div>
      </div>
    )
  }

  // No names at all
  if (status === 'ready' && names.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 space-y-3 text-center"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
      >
        <AlertTriangle className="size-8 mx-auto" style={{ color: 'var(--subtle)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          No arc.name yet
        </p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Mint a free name so others can send USDC directly to your name.
        </p>
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

  // Show primary name + all names
  const displayNames = activeName
    ? [activeName, ...names.filter(n => n !== activeName)]
    : names

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Receive USDC
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
          Share your name or address to receive payments
        </p>
      </div>

      {/* Name cards */}
      {displayNames.map((label, i) => {
        const full = formatName(label)
        const isPrimary = label === activeName || (i === 0 && !activeName)
        return (
          <div
            key={label}
            className="rounded-3xl p-5 space-y-4"
            style={{
              background: 'var(--surface-strong)',
              border: `1px solid ${isPrimary ? 'rgba(16,97,166,0.3)' : 'var(--border)'}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="size-8 rounded-xl flex items-center justify-center"
                  style={{ background: isPrimary ? 'rgba(16,97,166,0.1)' : 'var(--surface-muted)' }}
                >
                  <AtSign className="size-4" style={{ color: isPrimary ? 'var(--accent)' : 'var(--subtle)' }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>{full}</p>
                  {isPrimary && (
                    <p className="text-xs" style={{ color: 'var(--accent)' }}>Primary name</p>
                  )}
                </div>
              </div>
            </div>

            {/* Wallet address */}
            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: 'var(--surface-muted)' }}
            >
              <p className="text-xs mb-1 font-medium" style={{ color: 'var(--muted)' }}>Linked address</p>
              <p className="mono text-xs break-all" style={{ color: 'var(--ink-2)' }}>{address}</p>
            </div>

            {/* Copy name button */}
            <button
              onClick={() => copyName(label)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {copiedName === label
                ? <><CheckCircle className="size-4" /> Copied!</>
                : <><Copy className="size-4" /> Copy name</>
              }
            </button>
          </div>
        )
      })}

      {/* Copy raw address */}
      <button
        onClick={copyAddress}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium transition hover:bg-black/5"
        style={{ border: '1px solid var(--border)', color: 'var(--ink)' }}
      >
        <Copy className="size-4" />
        Copy wallet address
      </button>
    </div>
  )
}
