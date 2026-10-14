import { Loader2 } from 'lucide-react'

interface TxButtonProps {
  onClick: () => void
  disabled?: boolean
  isPending?: boolean
  isConfirming?: boolean
  isConnected?: boolean
  wrongChain?: boolean
  onSwitchChain?: () => void
  label: string
  className?: string
}

export default function TxButton({
  onClick,
  disabled,
  isPending,
  isConfirming,
  isConnected,
  wrongChain,
  onSwitchChain,
  label,
  className = '',
}: TxButtonProps) {
  const busy = isPending || isConfirming

  if (!isConnected) {
    return (
      <button
        disabled
        className={`w-full rounded-2xl py-3.5 text-sm font-semibold text-white opacity-40 cursor-not-allowed ${className}`}
        style={{ background: 'var(--accent)' }}
      >
        Connect wallet first
      </button>
    )
  }

  if (wrongChain) {
    return (
      <button
        onClick={onSwitchChain}
        className={`w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] ${className}`}
        style={{ background: 'var(--danger)' }}
      >
        Switch to Arc Testnet
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{ background: 'var(--accent)' }}
    >
      {isPending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Confirm in wallet...
        </span>
      ) : isConfirming ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Confirming...
        </span>
      ) : label}
    </button>
  )
}
