import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { activeChain } from '@/config'
import type { Hex } from 'viem'
import { RESOLVER_ADDRESS, RESOLVER_ABI, REVERSE_REGISTRAR_ADDRESS, REVERSE_REGISTRAR_ABI, CONTRACTS_DEPLOYED } from '@/contracts'
import { labelhash } from './useNameRegistry'

const CHAIN_ID = activeChain.id

// ── Read ─────────────────────────────────────────────────────────────────────

export function useResolveAddr(label: string) {
  const node = label ? labelhash(label) : undefined
  return useReadContract({
    address: RESOLVER_ADDRESS,
    abi: RESOLVER_ABI,
    functionName: 'addr',
    args: [node ?? '0x0000000000000000000000000000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(node) && label.length >= 3 },
  })
}

export function useResolveText(label: string, key: string) {
  const node = label ? labelhash(label) : undefined
  return useReadContract({
    address: RESOLVER_ADDRESS,
    abi: RESOLVER_ABI,
    functionName: 'text',
    args: [node ?? '0x0000000000000000000000000000000000000000000000000000000000000000', key],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(node) && label.length >= 3 },
  })
}

export function useReverseName(address: Hex | undefined) {
  return useReadContract({
    address: REVERSE_REGISTRAR_ADDRESS,
    abi: REVERSE_REGISTRAR_ABI,
    functionName: 'name',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: CONTRACTS_DEPLOYED && Boolean(address) },
  })
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function useSetAddr() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function setAddr(label: string, addr: Hex) {
    const node = labelhash(label)
    writeContract({
      address: RESOLVER_ADDRESS,
      abi: RESOLVER_ABI,
      functionName: 'setAddr',
      args: [node, addr],
      chainId: CHAIN_ID,
    })
  }

  return { setAddr, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useSetText() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function setText(label: string, key: string, value: string) {
    const node = labelhash(label)
    writeContract({
      address: RESOLVER_ADDRESS,
      abi: RESOLVER_ABI,
      functionName: 'setText',
      args: [node, key, value],
      chainId: CHAIN_ID,
    })
  }

  return { setText, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useSetPrimaryName() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function setPrimaryName(name: string) {
    writeContract({
      address: REVERSE_REGISTRAR_ADDRESS,
      abi: REVERSE_REGISTRAR_ABI,
      functionName: 'setName',
      args: [name],
      chainId: CHAIN_ID,
    })
  }

  return { setPrimaryName, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}
