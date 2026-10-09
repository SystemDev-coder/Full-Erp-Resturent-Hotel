import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Two-factor sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 2FAS…):
// standard TOTP (RFC 6238) — 6 digits, 30-second steps, SHA-1 — implemented with Node's own crypto.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const b of buf) {
    value = (value << 8) | b; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of s.replace(/[\s=-]/g, '').toUpperCase()) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('bad base32')
    value = (value << 5) | i; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export const generateSecret = () => base32Encode(randomBytes(20))

export function hotp(secret: string, counter: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const o = h[h.length - 1] & 15
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

export const currentStep = (now = Date.now()) => Math.floor(now / 30_000)

/** Returns the time step that matched (so it can be remembered and never accepted twice), or null. Allows ±1 step of clock drift. */
export function verifyTotp(secret: string, code: string, lastUsedStep = 0, now = Date.now()): number | null {
  const c = String(code).replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return null
  const step = currentStep(now)
  for (const s of [step, step - 1, step + 1]) {
    if (s <= lastUsedStep) continue                       // replay of a code that was already used
    const want = Buffer.from(hotp(secret, s)), got = Buffer.from(c)
    if (want.length === got.length && timingSafeEqual(want, got)) return s
  }
  return null
}

export const otpauthUri = (account: string, issuer: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`

// The secret is stored encrypted (AES-256-GCM) so a database leak alone does not hand out everyone's second factor.
const key = () => scryptSync(process.env.JWT_SECRET ?? 'dev-secret', 'hospitality-erp-totp', 32)
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.')
}
export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.').map(p => Buffer.from(p, 'base64'))
  const d = createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

/** 10 one-time recovery codes like "k3f9a-72xmp" (shown once; only hashes are stored) */
export const newRecoveryCodes = () => Array.from({ length: 10 }, () => {
  const a = randomBytes(8).toString('hex').slice(0, 10)
  return `${a.slice(0, 5)}-${a.slice(5)}`
})
