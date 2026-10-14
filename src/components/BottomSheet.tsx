import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

const spectral = 'linear-gradient(90deg,#6f86d6,#48c6ef,#56ef76,#f7971e,#e84393)'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  accent?: boolean
}

const spring = { type: 'spring', damping: 32, stiffness: 320 } as const

export default function BottomSheet({ open, onClose, title, children, accent = true }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
          >
            {accent && <div className="h-1" style={{ background: spectral }} />}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="h-1 w-10 rounded-full bg-black/10 absolute left-1/2 -translate-x-1/2 top-3" />
              {title ? (
                <h2 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                className="ml-auto flex size-7 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                aria-label="Close"
              >
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="px-5 pb-8 pt-2">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
