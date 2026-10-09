import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'
import { invalidateUserStatus } from '../../middleware/auth'
import { decryptSecret, encryptSecret, generateSecret, newRecoveryCodes, otpauthUri, verifyTotp } from '../../utils/totp'
import { finishLogin, registerFailedAttempt, MAX_FAILED_ATTEMPTS, AUTO_LOCK_MINUTES } from './authController'

// Two-factor sign-in (authenticator app). Optional per person; strongly recommended for administrators.

const SECRET = process.env.JWT_SECRET ?? ''
const RECOVERY_RE = /^[a-z0-9]{5}-[a-z0-9]{5}$/i

export async function getTwoFactorStatus(req: Request, res: Response) {
  const { rows: [u] } = await query(`SELECT totp_enabled, totp_enabled_at, COALESCE(jsonb_array_length(totp_recovery), 0) AS recovery_left FROM users WHERE id = $1`, [req.auth!.userId])
  return res.json({ success: true, data: { enabled: !!u?.totp_enabled, enabled_at: u?.totp_enabled_at ?? null, recovery_left: Number(u?.recovery_left ?? 0) } })
}

// Step 1 — create a secret and show it (as text + otpauth link; the page draws the QR code locally)
export async function startTwoFactorSetup(req: Request, res: Response) {
  const { userId, orgId } = req.auth!
  const { rows: [u] } = await query(`SELECT email, totp_enabled FROM users WHERE id = $1`, [userId])
  if (u.totp_enabled) return res.status(409).json({ success: false, message: 'Two-factor sign-in is already on. Turn it off first to set it up again.' })
  const { rows: [org] } = await query(`SELECT name FROM organization WHERE id = $1`, [orgId])
  const secret = generateSecret()
  await query(`UPDATE users SET totp_pending = $2 WHERE id = $1`, [userId, encryptSecret(secret)])
  return res.json({ success: true, data: { secret, otpauth_uri: otpauthUri(u.email, org?.name ?? 'Hospitality ERP', secret) } })
}

// Step 2 — the person proves the app works by typing the current code; only then does it switch on
export async function enableTwoFactor(req: Request, res: Response) {
  const { userId, branchId } = req.auth!
  const { rows: [u] } = await query(`SELECT totp_pending, totp_enabled FROM users WHERE id = $1`, [userId])
  if (u.totp_enabled) return res.status(409).json({ success: false, message: 'Two-factor sign-in is already on.' })
  if (!u.totp_pending) return res.status(409).json({ success: false, message: 'Start the setup first.' })
  const step = verifyTotp(decryptSecret(u.totp_pending), String(req.body?.code ?? ''))
  if (step === null) return res.status(400).json({ success: false, message: 'That code is not right. Open your authenticator app and type the 6-digit code it shows now.' })
  const codes = newRecoveryCodes()
  const hashes = await Promise.all(codes.map(c => bcrypt.hash(c.replace('-', '').toLowerCase(), 8)))
  await query(
    `UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = TRUE, totp_enabled_at = NOW(), totp_last_step = $2, totp_recovery = $3::jsonb WHERE id = $1`,
    [userId, step, JSON.stringify(hashes)])
  logAudit({ userId, branchId, action: 'TWO_FACTOR_ENABLED', req })
  return res.json({ success: true, data: { recovery_codes: codes } })
}

// Turning it off needs the password AND a current code (or a recovery code) — a stolen, signed-in session cannot disable it silently
export async function disableTwoFactor(req: Request, res: Response) {
  const { userId, branchId } = req.auth!
  const { rows: [u] } = await query(`SELECT password_hash, totp_secret, totp_enabled, totp_last_step, totp_recovery FROM users WHERE id = $1`, [userId])
  if (!u.totp_enabled) return res.status(409).json({ success: false, message: 'Two-factor sign-in is not on.' })
  if (!(await bcrypt.compare(String(req.body?.password ?? ''), u.password_hash))) return res.status(400).json({ success: false, message: 'Incorrect password.' })
  const ok = await checkSecondFactor(userId, u, String(req.body?.code ?? ''))
  if (!ok) return res.status(400).json({ success: false, message: 'That code is not right.' })
  await query(`UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_pending = NULL, totp_recovery = '[]'::jsonb, totp_enabled_at = NULL WHERE id = $1`, [userId])
  logAudit({ userId, branchId, action: 'TWO_FACTOR_DISABLED', req })
  return res.json({ success: true })
}

// An administrator frees someone who lost their phone
export async function resetUserTwoFactor(req: Request, res: Response) {
  const { orgId, userId, branchId } = req.auth!
  const { rows } = await query(
    `UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_pending = NULL, totp_recovery = '[]'::jsonb, totp_enabled_at = NULL
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id, full_name`, [req.params.id, orgId])
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' })
  logAudit({ userId, branchId, action: 'TWO_FACTOR_RESET', tableName: 'users', recordId: rows[0].id, req, newValues: { user: rows[0].full_name } })
  return res.json({ success: true })
}

// A code from the app (never reusable) or one recovery code (used up on success)
async function checkSecondFactor(userId: string, u: Record<string, any>, code: string): Promise<boolean> {
  const c = code.trim()
  if (RECOVERY_RE.test(c)) {
    const norm = c.replace('-', '').toLowerCase()
    const hashes = u.totp_recovery ?? []
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(norm, hashes[i])) {
        await query(`UPDATE users SET totp_recovery = totp_recovery - $2::int WHERE id = $1`, [userId, i])
        return true
      }
    }
    return false
  }
  const step = verifyTotp(decryptSecret(u.totp_secret), c, Number(u.totp_last_step ?? 0))
  if (step === null) return false
  // atomic "use once": a second request with the same code in the same window loses the race
  const { rowCount } = await query(`UPDATE users SET totp_last_step = $2 WHERE id = $1 AND COALESCE(totp_last_step, 0) < $2`, [userId, step])
  return rowCount === 1
}

// Sign-in, second step: the password was right and we handed out a short "challenge"; now the code
export async function verifyTwoFactorLogin(req: Request, res: Response) {
  const code = String(req.body?.code ?? '')
  let claims: { typ?: string; userId?: string; branch_id?: string | null }
  try { claims = jwt.verify(String(req.body?.challenge ?? ''), SECRET) as typeof claims }
  catch { return res.status(400).json({ success: false, message: 'This sign-in expired — please enter your password again.', data: { restart: true } }) }
  if (claims.typ !== '2fa' || !claims.userId) return res.status(400).json({ success: false, message: 'Invalid sign-in request.', data: { restart: true } })

  const { rows: [user] } = await query(
    `SELECT u.id, u.email, u.full_name, u.avatar_url, u.is_active, u.is_locked, u.locked_until, u.organization_id, o.name AS org_name,
            u.totp_secret, u.totp_enabled, u.totp_last_step, u.totp_recovery
     FROM users u JOIN organization o ON o.id = u.organization_id WHERE u.id = $1 AND u.deleted_at IS NULL`, [claims.userId])
  if (!user || !user.is_active || !user.totp_enabled) return res.status(403).json({ success: false, message: 'This account cannot sign in.', data: { restart: true } })
  if (user.is_locked || (user.locked_until && new Date(user.locked_until) > new Date())) {
    return res.status(403).json({ success: false, message: 'This account is locked. Please try again later or contact your administrator.', data: { restart: true } })
  }

  if (!(await checkSecondFactor(user.id, user, code))) {
    const attempts = await registerFailedAttempt(user.id)
    logAudit({ userId: user.id, action: 'LOGIN_FAILED', req, newValues: { reason: 'wrong_2fa_code', attempts } })
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      return res.status(403).json({ success: false, message: `Too many wrong codes — this account is locked for ${AUTO_LOCK_MINUTES} minutes.`, data: { restart: true } })
    }
    return res.status(400).json({ success: false, message: `That code is not right. ${MAX_FAILED_ATTEMPTS - attempts} attempt${MAX_FAILED_ATTEMPTS - attempts === 1 ? '' : 's'} left.` })
  }
  invalidateUserStatus(user.id)
  return finishLogin(req, res, user, claims.branch_id ?? undefined)
}
