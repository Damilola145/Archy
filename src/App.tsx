import { useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useOwnedNames } from './hooks/useOwnedNames'
import { activeChain } from './config'
import { ConnectKitButton } from 'connectkit'
import { Home, Send, ArrowDownLeft, Scissors, Settings } from 'lucide-react'
import DashboardScreen from './components/DashboardScreen'
import MintScreen from './components/MintScreen'
import SendScreen from './components/SendScreen'
import RequestScreen from './components/RequestScreen'
import SettingsScreen from './components/SettingsScreen'
import { AdminBanner } from './components/AdminBanner'

const CHAIN_ID = activeChain.id

type Tab = 'dashboard' | 'mint' | 'send' | 'request' | 'settings'

const tabs: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Home', Icon: Home },
  { id: 'mint', label: 'Mint', Icon: Scissors },
  { id: 'send', label: 'Send', Icon: Send },
  { id: 'request', label: 'Request', Icon: ArrowDownLeft },
  { id: 'settings', label: 'Settings', Icon: Settings },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { names: ownedNames, refresh: refreshOwnedNames } = useOwnedNames()

  const wrongChain = isConnected && chainId !== CHAIN_ID

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <AdminBanner />
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
        style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="size-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            A
          </div>
          <span className="display text-sm font-semibold" style={{ color: 'var(--ink)' }}>arc.name</span>
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
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-md px-4 py-5 pb-24">
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onSend={() => setActiveTab('send')}
            onRequest={() => setActiveTab('request')}
            onMint={() => setActiveTab('mint')}
            ownedNames={ownedNames}
          />
        )}
        {activeTab === 'mint' && <MintScreen ownedNames={ownedNames} onMintComplete={refreshOwnedNames} />}
        {activeTab === 'send' && <SendScreen />}
        {activeTab === 'request' && <RequestScreen />}
        {activeTab === 'settings' && <SettingsScreen ownedNames={ownedNames} />}
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
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
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
