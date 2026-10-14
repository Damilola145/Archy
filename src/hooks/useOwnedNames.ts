import { useEffect, useState, useCallback } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { REGISTRY_ADDRESS, CONTRACTS_DEPLOYED } from '@/contracts'
import { activeChain } from '@/config'
import { useAccount } from 'wagmi'

// Reads Transfer(from, to, tokenId) logs to find all tokenIds owned by address,
// then maps each tokenId back to its label via getRecord.
// Pure on-chain — no indexer needed.

// ABI exactly matches ArcNameRegistry.sol v3 struct:
//   struct NameRecord { string label; address resolver; address manager; uint256 expiry; uint256 generation; }
const REGISTRY_ABI_SLIM = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from',    type: 'address', indexed: true },
      { name: 'to',      type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'function',
    name: 'getRecord',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'label',      type: 'string'  },
          { name: 'resolver',   type: 'address' },
          { name: 'manager',    type: 'address' },
          { name: 'expiry',     type: 'uint256' },
          { name: 'generation', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

const client = createPublicClient({
  chain: activeChain,
  transport: http(activeChain.rpcUrls.default.http[0]),
})

export function useOwnedNames(): { names: string[]; loading: boolean; refresh: () => void } {
  const { address } = useAccount()
  const [names, setNames]     = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick]       = useState(0)

  // Expose a manual refresh so callers (MintScreen, etc.) can trigger a reload
  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!address || !CONTRACTS_DEPLOYED) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        // 1. Get all Transfer events where to = address (mints / incoming transfers)
        const mintLogs = await client.getLogs({
          address: REGISTRY_ADDRESS,
          event: parseAbiItem(
            'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
          ),
          args: { to: address },
          fromBlock: 0n,
          toBlock: 'latest',
        })

        // 2. Collect unique tokenIds
        const tokenIds = [...new Set(mintLogs.map(l => l.args.tokenId as bigint))]

        // 3. Filter to those still owned by address
        //    Run sequentially to avoid rate-limiting the public RPC.
        const owned: bigint[] = []
        for (const tid of tokenIds) {
          try {
            const owner = await client.readContract({
              address: REGISTRY_ADDRESS,
              abi: REGISTRY_ABI_SLIM,
              functionName: 'ownerOf',
              args: [tid],
            })
            if (typeof owner === 'string' && owner.toLowerCase() === address!.toLowerCase()) {
              owned.push(tid)
            }
          } catch {
            // token burned or not found — skip
          }
          if (cancelled) return
        }

        if (cancelled) return

        // 4. Resolve tokenId → label via getRecord
        const labels: string[] = []
        for (const tid of owned) {
          try {
            const rec = await client.readContract({
              address: REGISTRY_ADDRESS,
              abi: REGISTRY_ABI_SLIM,
              functionName: 'getRecord',
              args: [('0x' + tid.toString(16).padStart(64, '0')) as `0x${string}`],
            })
            // rec is a tuple: { label, resolver, manager, expiry }
            if (rec && rec.label) labels.push(rec.label)
          } catch {
            // skip
          }
          if (cancelled) return
        }

        if (!cancelled) setNames(labels)
      } catch (e) {
        console.warn('useOwnedNames: failed to load', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [address, tick])

  return { names, loading, refresh }
}
