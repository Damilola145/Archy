/**
 * AdminBanner
 *
 * Shown only to the current registry owner. Reads `registry.owner()` from chain
 * at runtime — no hardcoded constant. Shows only when the registrar is not yet
 * wired to the correct address. Includes a loading state and reverted-tx handling.
 */
import { useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { REGISTRY_ADDRESS, REGISTRAR_ADDRESS, REGISTRY_ABI, CONTRACTS_DEPLOYED } from '@/contracts'
import { activeChain } from '@/config'
import { toast } from 'sonner'

const CHAIN_ID = activeChain.id

export function AdminBanner() {
  const { address, isConnected } = useAccount()

  // Read the registry owner from chain
  const { data: registryOwner, isLoading: ownerLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && isConnected },
  })

  const isOwner = Boolean(
    isConnected && address && registryOwner &&
    address.toLowerCase() === registryOwner.toLowerCase()
  )

  // Read the currently wired registrar
  const { data: currentRegistrar, refetch: refetchRegistrar } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'registrar',
    chainId: CHAIN_ID,
    query: { enabled: isOwner },
  })

  // Wired = currently wired registrar matches the address in env
  const isWired = Boolean(
    currentRegistrar &&
    currentRegistrar.toLowerCase() === REGISTRAR_ADDRESS.toLowerCase()
  )

  const { writeContract, data: txHash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: CHAIN_ID,
  })

  // Refetch registrar once the tx confirms — no refetch() during render
  useEffect(() => {
    if (isSuccess) void refetchRegistrar()
  }, [isSuccess, refetchRegistrar])

  useEffect(() => {
    if (isError && error) toast.error(`setRegistrar failed: ${error.message}`)
  }, [isError, error])

  // Hide until we know whether the owner is connected and registrar state is loaded
  if (!isConnected || ownerLoading || !isOwner || isWired) return null

  const handleWire = () => {
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'setRegistrar',
      args: [REGISTRAR_ADDRESS],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => toast.success('setRegistrar tx submitted — waiting for confirmation...'),
    })
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 flex items-center justify-between gap-3 text-sm font-medium shadow-lg">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0">⚠</span>
        <span className="truncate">One-time setup: wire the registrar to enable name minting.</span>
      </div>
      <button
        onClick={handleWire}
        disabled={isPending || isConfirming}
        className="shrink-0 px-4 py-1.5 bg-white text-amber-700 rounded-lg font-semibold text-xs hover:bg-amber-50 active:bg-amber-100 disabled:opacity-60 transition-colors"
      >
        {isPending ? 'Check wallet…' : isConfirming ? 'Confirming…' : 'Wire registrar'}
      </button>
    </div>
  )
}
