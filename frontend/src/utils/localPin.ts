// Waiter PIN check that still works with no internet.
// After a successful ONLINE unlock this device remembers a salted, slow hash (PBKDF2) of that waiter's PIN —
// never the PIN itself. Offline, a typed PIN is compared with it. Five wrong tries lock the profile for
// 5 minutes (same rule as online). A wrong answer from the server deletes the remembered hash, so a PIN that a
// manager has since changed stops working offline too.

const ITER = 150_000
const kHash = (id: string) => `pos_localpin_${id}`
const kFail = (id: string) => `pos_localpin_fail_${id}`

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string): Uint8Array<ArrayBuffer> => Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)))

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256))
}

export async function rememberPin(staffId: string, pin: string) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
    localStorage.setItem(kHash(staffId), JSON.stringify({ salt: toHex(salt.buffer), hash: await derive(pin, salt) }))
    localStorage.removeItem(kFail(staffId))
  } catch { /* storage or crypto unavailable → offline unlock simply won't be offered */ }
}
export const forgetPin = (staffId: string) => { try { localStorage.removeItem(kHash(staffId)) } catch { /* ignore */ } }
export const canUnlockOffline = (staffId: string) => { try { return !!localStorage.getItem(kHash(staffId)) } catch { return false } }

export type LocalPinResult = { ok: true } | { ok: false; reason: 'none' | 'wrong' | 'locked'; message: string }

export async function verifyLocalPin(staffId: string, pin: string): Promise<LocalPinResult> {
  let rec: { salt: string; hash: string } | null = null
  try { rec = JSON.parse(localStorage.getItem(kHash(staffId)) ?? 'null') } catch { /* ignore */ }
  if (!rec) return { ok: false, reason: 'none', message: 'No internet — this device has not unlocked this profile online yet, so it cannot be checked offline.' }

  let fail = { n: 0, until: 0 }
  try { fail = JSON.parse(localStorage.getItem(kFail(staffId)) ?? '{"n":0,"until":0}') } catch { /* ignore */ }
  if (fail.until > Date.now()) {
    const m = Math.ceil((fail.until - Date.now()) / 60_000)
    return { ok: false, reason: 'locked', message: `Too many wrong PINs — locked for ${m} more minute${m === 1 ? '' : 's'}.` }
  }
  if ((await derive(pin, fromHex(rec.salt))) === rec.hash) { localStorage.removeItem(kFail(staffId)); return { ok: true } }
  const n = fail.n + 1
  const locked = n >= 5
  localStorage.setItem(kFail(staffId), JSON.stringify({ n: locked ? 0 : n, until: locked ? Date.now() + 5 * 60_000 : 0 }))
  return { ok: false, reason: locked ? 'locked' : 'wrong', message: locked ? 'Too many wrong PINs — this profile is locked for 5 minutes.' : `Incorrect PIN. ${5 - n} attempt${5 - n === 1 ? '' : 's'} left (offline).` }
}
