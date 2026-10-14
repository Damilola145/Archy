export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Short form used in the balance card: first 5 chars + ellipsis + last 3 chars */
export function formatAddressShort(addr: string): string {
  if (!addr || addr.length < 8) return addr
  return `${addr.slice(0, 5)}…${addr.slice(-3)}`
}

export function parseOnchainError(error: unknown): string {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? ''

  if (message.includes('user rejected') || (error as { code?: number })?.code === 4001) {
    return 'Cancelled.'
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient USDC balance for gas.'
  }
  if (message.includes('commitmenttoonew') || message.includes('commitmenttooold')) {
    return 'Commitment timing error — please wait 60 seconds then try again.'
  }
  if (message.includes('namenotavailable')) {
    return 'That name is already taken.'
  }
  if (message.includes('namereserved')) {
    return 'That name is reserved and cannot be registered.'
  }
  if (message.includes('labeltoolong')) {
    return 'Name is too long (max 63 characters).'
  }
  if (message.includes('labeltooshort')) {
    return 'Name is too short (min 3 characters).'
  }
  if (message.includes('reverted')) {
    const reason = message.match(/reason="([^"]+)"/)
    return reason ? `Transaction failed: ${reason[1]}` : 'Transaction failed. Please try again.'
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}
