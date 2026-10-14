import { useSignTypedData, useAccount } from 'wagmi'
import { activeChain } from '@/config'
import { getUsdc } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'

const CHAIN_ID = activeChain.id
const usdcFact = getUsdc(CHAIN_ID)

// ── EIP-712 domain ─────────────────────────────────────────────────────────

const DOMAIN = {
  name: 'arc.name',
  version: '1',
  chainId: CHAIN_ID,
} as const

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaymentRequest {
  from: `0x${string}`
  toName: string
  amount: string     // human-readable USDC e.g. "10.00"
  memo: string
  expiry: bigint
  nonce: bigint
}

const TYPES = {
  PaymentRequest: [
    { name: 'from', type: 'address' },
    { name: 'toName', type: 'string' },
    { name: 'amount', type: 'uint256' },
    { name: 'memo', type: 'string' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePaymentRequest() {
  const { address } = useAccount()
  const { signTypedDataAsync, isPending, isError, error, reset } = useSignTypedData()

  async function createRequest(params: {
    toName: string
    amount: string
    memo: string
    expiryHours?: number
  }): Promise<{ link: string; signature: `0x${string}` } | null> {
    if (!address) return null
    if (!usdcFact) return null

    const nonce = BigInt(Date.now())
    const expiryHours = params.expiryHours ?? 72
    const expiry = BigInt(Math.floor(Date.now() / 1000) + expiryHours * 3600)
    const parsedAmount = parseAmount(CHAIN_ID, params.amount)

    const message = {
      from: address,
      toName: params.toName,
      amount: parsedAmount.raw,
      memo: params.memo,
      expiry,
      nonce,
    }

    const signature = await signTypedDataAsync({
      domain: DOMAIN,
      types: TYPES,
      primaryType: 'PaymentRequest',
      message,
    })

    // Build EIP-681-compatible link with encoded request
    const encoded = btoa(JSON.stringify({
      from: address,
      toName: params.toName,
      amount: parsedAmount.raw.toString(),
      memo: params.memo,
      expiry: expiry.toString(),
      nonce: nonce.toString(),
      signature,
    }))

    const link = `${window.location.origin}/pay?req=${encoded}`
    return { link, signature }
  }

  function decodeRequest(encoded: string): (PaymentRequest & { signature: `0x${string}` }) | null {
    try {
      const raw = JSON.parse(atob(encoded)) as {
        from: `0x${string}`
        toName: string
        amount: string
        memo: string
        expiry: string
        nonce: string
        signature: `0x${string}`
      }
      return {
        from: raw.from,
        toName: raw.toName,
        amount: raw.amount,
        memo: raw.memo,
        expiry: BigInt(raw.expiry),
        nonce: BigInt(raw.nonce),
        signature: raw.signature,
      }
    } catch {
      return null
    }
  }

  return { createRequest, decodeRequest, isPending, isError, error, reset }
}
