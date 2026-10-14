import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { activeChain } from '@/config'
import { keccak256, toBytes, encodeAbiParameters, parseAbiParameters, type Hex } from 'viem'
import {
  REGISTRY_ADDRESS, REGISTRAR_ADDRESS,
  REGISTRY_ABI, REGISTRAR_ABI,
  CONTRACTS_DEPLOYED,
} from '@/contracts'

const CHAIN_ID = activeChain.id

// ── Labelhash ─────────────────────────────────────────────────────────────────

export function labelhash(label: string): Hex {
  return keccak256(toBytes(label))
}

export function makeCommitmentHash(
  label: string,
  owner: Hex,
  resolver: Hex,
  secret: Hex,
): Hex {
  // keccak256(abi.encode(label, owner, resolver, secret))
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('string, address, address, bytes32'),
      [label, owner, resolver, secret],
    ),
  )
}

// ── Read hooks ─────────────────────────────────────────────────────────────────

export function useIsAvailable(label: string) {
  const node = label ? labelhash(label) : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'available',
    args: [node],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && label.length >= 3 },
  })
}

export function useExpiry(label: string) {
  const node = label ? labelhash(label) : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'expiry',
    args: [node],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && label.length >= 3 },
  })
}

export function useOwnerOf(label: string) {
  const tokenId = label ? BigInt(labelhash(label)) : 0n
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'ownerOf',
    args: [tokenId],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && label.length >= 3 },
  })
}

export function useCommitmentTimestamp(commitment: Hex | undefined) {
  return useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: 'commitments',
    args: [commitment ?? '0x0000000000000000000000000000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(commitment) },
  })
}

// ── Write hooks ───────────────────────────────────────────────────────────────

export function useCommit() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function commit(commitment: Hex, callbacks?: { onSuccess?: () => void; onError?: (e: Error) => void }) {
    writeContract(
      {
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_ABI,
        functionName: 'commit',
        args: [commitment],
        chainId: CHAIN_ID,
      },
      callbacks,
    )
  }

  return { commit, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useRegister() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function register(
    params: { label: string; owner: Hex; resolver: Hex; duration: bigint; secret: Hex },
    callbacks?: { onSuccess?: (hash: `0x${string}`) => void; onError?: (e: Error) => void },
  ) {
    writeContract(
      {
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_ABI,
        functionName: 'register',
        args: [params.label, params.owner, params.resolver, params.duration, params.secret],
        chainId: CHAIN_ID,
      },
      {
        onSuccess: callbacks?.onSuccess ? (h) => callbacks.onSuccess!(h) : undefined,
        onError: callbacks?.onError,
      },
    )
  }

  return { register, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useRenew() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function renew(label: string, duration: bigint) {
    writeContract({
      address: REGISTRAR_ADDRESS,
      abi: REGISTRAR_ABI,
      functionName: 'renew',
      args: [label, duration],
      chainId: CHAIN_ID,
    })
  }

  return { renew, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useSetManager() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function setManager(label: string, manager: Hex) {
    const node = labelhash(label)
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'setManager',
      args: [node, manager],
      chainId: CHAIN_ID,
    })
  }

  return { setManager, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

// MIN_DURATION constant: 365 days in seconds
export const MIN_DURATION = BigInt(365 * 24 * 60 * 60)
