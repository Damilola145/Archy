/**
 * wagmi configuration for arc.name
 *
 * Chain selection: set VITE_CHAIN=mainnet to use Arc Mainnet.
 * Default is Arc Testnet.
 */

import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { getDefaultConfig } from 'connectkit'
import { injected } from 'wagmi/connectors'

// ── Define Arc chains from onchain-facts (single source of truth) ─────────────

export const arcTestnetChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
})

export const arcMainnetChain = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

// ── Active chain ──────────────────────────────────────────────────────────────
// Set VITE_CHAIN=mainnet in .env to switch. Default = testnet.
const useMainnet = import.meta.env.VITE_CHAIN === 'mainnet'
export const activeChain = useMainnet ? arcMainnetChain : arcTestnetChain

export const config = createConfig(
  getDefaultConfig({
    chains: [activeChain],
    transports: {
      // Explicit RPC URL, no JSON-RPC batching (batch mode causes silent
      // receipt-watcher failures on Arc Testnet public RPC).
      [activeChain.id]: http(activeChain.rpcUrls.default.http[0]),
    },
    // 1s polling — receipt watchers and read hooks refresh every second.
    pollingInterval: 1_000,

    // Only injected (browser/MetaMask) — no WalletConnect popup.
    connectors: [injected()],

    // Empty string disables WalletConnect in ConnectKit's own modal.
    walletConnectProjectId: '',
    appName: 'arc.name',
    appDescription: 'Your decentralised name on Arc — send USDC by name',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://arc.name',
  }),
)
