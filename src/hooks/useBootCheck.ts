/**
 * useBootCheck — M2 (extended)
 *
 * Verifies every critical contract relationship on app start:
 *   1. registry.registrar()        == REGISTRAR_ADDRESS
 *   2. registrar.registry()        == REGISTRY_ADDRESS
 *   3. resolver.registry()         == REGISTRY_ADDRESS   ← new
 *   4. reverseRegistrar.registry() == REGISTRY_ADDRESS   ← new
 *   5. registrar.paused()          == false
 *
 * Blocks Mint AND Settings tabs when any check fails.
 */
import { useReadContract } from 'wagmi'
import {
  REGISTRY_ADDRESS, REGISTRAR_ADDRESS, RESOLVER_ADDRESS, REVERSE_REGISTRAR_ADDRESS,
  REGISTRY_ABI, REGISTRAR_ABI, RESOLVER_ABI, REVERSE_REGISTRAR_ABI,
  CONTRACTS_DEPLOYED,
} from '@/contracts'
import { activeChain } from '@/config'

const CHAIN_ID = activeChain.id

// Minimal shared ABI for any contract that exposes `registry()`
const REGISTRY_GETTER_ABI = [
  { name: 'registry', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const

export function useBootCheck() {
  const enabled = CONTRACTS_DEPLOYED

  // 1. registry.registrar()
  const { data: wiredRegistrar, isLoading: l1 } = useReadContract({
    address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
    functionName: 'registrar', chainId: CHAIN_ID,
    query: { enabled },
  })

  // 2. registrar.registry()
  const { data: registrarRegistry, isLoading: l2 } = useReadContract({
    address: REGISTRAR_ADDRESS, abi: REGISTRY_GETTER_ABI,
    functionName: 'registry', chainId: CHAIN_ID,
    query: { enabled },
  })

  // 3. resolver.registry()
  const { data: resolverRegistry, isLoading: l3 } = useReadContract({
    address: RESOLVER_ADDRESS, abi: RESOLVER_ABI,
    functionName: 'registry', chainId: CHAIN_ID,
    query: { enabled },
  })

  // 4. reverseRegistrar.registry()
  const { data: reverseRegistry, isLoading: l4 } = useReadContract({
    address: REVERSE_REGISTRAR_ADDRESS, abi: REVERSE_REGISTRAR_ABI,
    functionName: 'registry', chainId: CHAIN_ID,
    query: { enabled },
  })

  // 5. registrar.paused()
  const { data: isPaused, isLoading: l5 } = useReadContract({
    address: REGISTRAR_ADDRESS, abi: REGISTRAR_ABI,
    functionName: 'paused', chainId: CHAIN_ID,
    query: { enabled },
  })

  const checking = l1 || l2 || l3 || l4 || l5

  if (!enabled) return { ok: false, checking: false, failures: ['Contracts not deployed — set VITE_REGISTRY_ADDRESS etc. in .env'] }
  if (checking)  return { ok: true,  checking: true,  failures: [] }

  const failures: string[] = []
  const reg = REGISTRY_ADDRESS.toLowerCase()
  const rar = REGISTRAR_ADDRESS.toLowerCase()

  if (!wiredRegistrar || wiredRegistrar === '0x0000000000000000000000000000000000000000') {
    failures.push(`registry.registrar() is address(0) — call setRegistrar(${REGISTRAR_ADDRESS}) from the owner wallet`)
  } else if (wiredRegistrar.toLowerCase() !== rar) {
    failures.push(`registry.registrar() (${wiredRegistrar}) ≠ VITE_REGISTRAR_ADDRESS (${REGISTRAR_ADDRESS})`)
  }

  if (!registrarRegistry) {
    failures.push('Could not read registrar.registry() — wrong address or RPC error')
  } else if (registrarRegistry.toLowerCase() !== reg) {
    failures.push(`registrar.registry() (${registrarRegistry}) ≠ VITE_REGISTRY_ADDRESS (${REGISTRY_ADDRESS}) — redeploy required`)
  }

  if (!resolverRegistry) {
    failures.push('Could not read resolver.registry() — wrong address or RPC error')
  } else if (resolverRegistry.toLowerCase() !== reg) {
    failures.push(`resolver.registry() (${resolverRegistry}) ≠ VITE_REGISTRY_ADDRESS (${REGISTRY_ADDRESS}) — redeploy resolver`)
  }

  if (!reverseRegistry) {
    failures.push('Could not read reverseRegistrar.registry() — wrong address or RPC error')
  } else if (reverseRegistry.toLowerCase() !== reg) {
    failures.push(`reverseRegistrar.registry() (${reverseRegistry}) ≠ VITE_REGISTRY_ADDRESS (${REGISTRY_ADDRESS}) — redeploy reverse registrar`)
  }

  if (isPaused === true) {
    failures.push('Registrar is paused — new registrations are temporarily disabled')
  }

  return { ok: failures.length === 0, checking: false, failures }
}
