import { useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useMyNames } from './hooks/useMyNames'
import { activeChain } from './config'
import { ConnectKitButton } from 'connectkit'
import { Home, Scissors, Settings, ChevronLeft } from 'lucide-react'
import DashboardScreen from './components/DashboardScreen'
import MintScreen from './components/MintScreen'
import SendScreen from './components/SendScreen'
import ReceiveScreen from './components/ReceiveScreen'
import SettingsScreen from './components/SettingsScreen'
import { AdminBanner } from './components/AdminBanner'

const CHAIN_ID = activeChain.id

type Tab = 'dashboard' | 'mint' | 'send' | 'receive' | 'settings'

// Tabs that always appear in the bottom nav
const NAV_TABS: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Home',     Icon: Home },
  { id: 'mint',      label: 'Mint',     Icon: Scissors },
  { id: 'settings',  label: 'Settings', Icon: Settings },
]

// Tabs that are "sub-pages" — navigated to via action buttons, not the nav bar
const SUB_TABS = new Set<Tab>(['send', 'receive'])

export default function App() {
  const [activeTab,  setActiveTab]  = useState<Tab>('dashboard')
  const [prevTab,    setPrevTab]    = useState<Tab>('dashboard')
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const myNames = useMyNames()

  const wrongChain = isConnected && chainId !== CHAIN_ID

  function goTo(tab: Tab) {
    setPrevTab(activeTab)
    setActiveTab(tab)
  }

  function goBack() {
    setActiveTab(prevTab)
    setPrevTab('dashboard')
  }

  const isSubPage = SUB_TABS.has(activeTab)

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <AdminBanner />

      {/* Header */}
      <header
        className="sticky top-0 z-30 px-4"
        style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Top row — logo + connect */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="ArcName" className="size-8 rounded-lg" />
            <span className="display text-sm font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>ArcName</span>
          </div>
          <div className="flex items-center gap-2">
            {wrongChain && (
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
              >
                Wrong network
              </button>
            )}
            <ConnectKitButton
              customTheme={{
                '--ck-font-family': "'DM Sans', sans-serif",
                '--ck-primary-button-background': '#122d45',
                '--ck-primary-button-hover-background': '#1061a6',
                '--ck-body-background': '#ffffff',
                '--ck-body-color': '#122d45',
                '--ck-border-radius': '16px',
              }}
            />
          </div>
        </div>

        {/* Back button row — only visible on sub-pages */}
        {isSubPage && (
          <div className="pb-2">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm font-medium transition hover:opacity-70"
              style={{ color: 'var(--accent)' }}
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-md px-4 py-5 pb-24">
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onSend={() => goTo('send')}
            onRequest={() => goTo('receive')}
            onMint={() => goTo('mint')}
            myNames={myNames}
          />
        )}
        {activeTab === 'mint' && (
          <MintScreen
            myNames={myNames}
            onMintComplete={() => {
              myNames.refetch()
              setTimeout(() => myNames.refetch(), 3_000)
              setTimeout(() => myNames.refetch(), 8_000)
            }}
          />
        )}
        {activeTab === 'send'    && <SendScreen />}
        {activeTab === 'receive' && <ReceiveScreen myNames={myNames} onGoMint={() => goTo('mint')} />}
        {activeTab === 'settings' && <SettingsScreen myNames={myNames} />}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex justify-around px-2 pb-safe"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {NAV_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => goTo(id)}
            className="flex flex-col items-center gap-0.5 px-4 py-3 min-w-[44px] transition-all"
            style={{ color: activeTab === id ? 'var(--accent)' : 'var(--subtle)' }}
          >
            <Icon className="size-5" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
