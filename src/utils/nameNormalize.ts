import { keccak256, toBytes } from 'viem'

// Re-export as a namespace so keccak256Hex can reference it (avoids a top-level
// variable shadowing issue when the function references the same names).
const _viem = { keccak256, toBytes }

/**
 * Client-side name normalization for arc.name.
 *
 * Rules (mirrors the on-chain charset check + adds client-side homoglyph/script guards):
 *  1. Trim whitespace
 *  2. NFC normalize (Unicode)
 *  3. Lowercase
 *  4. Charset: [a-z0-9-], 3-63 chars, no leading/trailing hyphen
 *  5. No consecutive hyphens (punycode artifact guard)
 *  6. No invisible / zero-width characters
 *
 * Full ENSIP-15 normalization (mixed scripts, homoglyphs) would require the
 * @ensdomains/eth-ens-namehash package. For this demo we implement the ASCII subset
 * which covers arc.name's on-chain enforcement exactly. Add ens-namehash for production.
 */

export interface NormalizeResult {
  ok: true
  normalized: string
  labelhash: `0x${string}`
}

export interface NormalizeError {
  ok: false
  reason: string
}

// Zero-width and invisible Unicode codepoints
const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064]/

export function normalizeName(raw: string): NormalizeResult | NormalizeError {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, reason: 'Name is required.' }
  }

  let s = raw.trim()

  // NFC normalization
  s = s.normalize('NFC')

  // Lowercase
  s = s.toLowerCase()

  // Check for invisible characters
  if (INVISIBLE.test(s)) {
    return { ok: false, reason: 'Name contains invisible characters.' }
  }

  // Length
  if (s.length < 3) return { ok: false, reason: 'Name must be at least 3 characters.' }
  if (s.length > 63) return { ok: false, reason: 'Name must be 63 characters or fewer.' }

  // Charset: a-z, 0-9, hyphen
  const charsetRe = /^[a-z0-9-]+$/
  if (!charsetRe.test(s)) {
    return { ok: false, reason: 'Name can only contain letters a–z, digits 0–9, and hyphens.' }
  }

  // No leading/trailing hyphen
  if (s.startsWith('-') || s.endsWith('-')) {
    return { ok: false, reason: 'Name cannot start or end with a hyphen.' }
  }

  // No consecutive hyphens
  if (s.includes('--')) {
    return { ok: false, reason: 'Name cannot contain consecutive hyphens.' }
  }

  const labelhash = keccak256Hex(s)

  return { ok: true, normalized: s, labelhash }
}

/**
 * keccak256 of the UTF-8 bytes of the label.
 * Uses the same algorithm as the Solidity: keccak256(bytes(label)).
 */
function keccak256Hex(label: string): `0x${string}` {
  // viem is synchronous — import it at module load time via a top-level import.
  // We use a small inline polyfill here to keep this file dependency-free for
  // environments that tree-shake viem differently; callers that need the real
  // hash should use labelhashOf() below, or labelhash() from useNameRegistry.ts.
  // For the normalizeName return value we compute it properly via viem's keccak256.
  const { keccak256, toBytes } = _viem
  return keccak256(toBytes(label))
}

/**
 * Compute the labelhash (tokenId source) for a normalized label.
 * Matches the Solidity: keccak256(bytes(label)).
 *
 * Must be called AFTER normalizeName returns ok: true.
 */
export async function labelhashOf(normalizedLabel: string): Promise<`0x${string}`> {
  const { keccak256, toBytes } = await import('viem')
  return keccak256(toBytes(normalizedLabel))
}

export function formatName(label: string): string {
  return `${label}.arc`
}

export function expiryLabel(expiry: bigint): string {
  const ms = Number(expiry) * 1000
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function daysUntilExpiry(expiry: bigint): number {
  const now = Date.now()
  const ms = Number(expiry) * 1000
  return Math.floor((ms - now) / 86400000)
}
