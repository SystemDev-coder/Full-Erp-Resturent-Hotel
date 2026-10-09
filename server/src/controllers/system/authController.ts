import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'
import { PERM_MODULES, SUBMODULES, FULL, type PermFlags } from './userController'
import { invalidateUserStatus } from '../../middleware/auth'

const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m'
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d'
const SECRET          = process.env.JWT_SECRET ?? ''

// After this many consecutive bad passwords, the account is auto-locked for
// a cooldown period — independent of the manual admin "Lock user" action.
export const MAX_FAILED_ATTEMPTS = 5
export const AUTO_LOCK_MINUTES   = 30

function makeAccessToken(payload: object) {
  return jwt.sign(payload, SECRET, { expiresIn: ACCESS_EXPIRES } as any)
}

function makeRefreshToken(payload: object) {
  return jwt.sign(payload, SECRET, { expiresIn: REFRESH_EXPIRES } as any)
}

// One atomic statement: concurrent wrong guesses can't slip past the counter,
// and the lock is applied in the same write that crosses the limit.
export async function registerFailedAttempt(userId: string): Promise<number> {
  const { rows: [r] } = await query(
    `UPDATE users SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::INTERVAL ELSE locked_until END
     WHERE id = $1 RETURNING failed_attempts`,
    [userId, MAX_FAILED_ATTEMPTS, AUTO_LOCK_MINUTES]
  )
  invalidateUserStatus(userId)
  return Number(r.failed_attempts)
}

export async function login(req: Request, res: Response) {
  try {
    const { password, branch_id } = req.body
    const email = String(req.body.email ?? '').trim()

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' })
    }

    // Get user
    const { rows: users } = await query(
      `SELECT u.id, u.email, u.full_name, u.avatar_url, u.password_hash, u.is_active, u.failed_attempts,
              u.locked_until, u.is_locked, u.organization_id, u.totp_enabled, o.name AS org_name
       FROM users u
       JOIN organization o ON o.id = u.organization_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email.toLowerCase()]
    )

    // Step 1 — does the account exist?
    const user = users[0]
    if (!user) {
      logAudit({ action: 'LOGIN_FAILED', req, newValues: { reason: 'user_not_found', email } })
      return res.status(401).json({ success: false, message: 'User not found.' })
    }

    // Step 2 — account status
    if (!user.is_active) {
      logAudit({ userId: user.id, action: 'LOGIN_FAILED', req, newValues: { reason: 'inactive' } })
      return res.status(403).json({
        success: false,
        message: 'This account is currently inactive. Please contact your administrator or manager.',
      })
    }

    // Step 3 — lock status. An auto-lock that has run its course is cleared first, so the
    // failed-attempt counter starts from zero again (it used to stay at 5: a single wrong
    // password right after the cooldown re-locked the account for another 30 minutes).
    if (user.locked_until && new Date(user.locked_until) <= new Date()) {
      await query(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`, [user.id])
      user.failed_attempts = 0
      user.locked_until = null
    }
    const autoLocked = user.locked_until && new Date(user.locked_until) > new Date()
    if (user.is_locked || autoLocked) {
      logAudit({ userId: user.id, action: 'LOGIN_FAILED', req, newValues: { reason: user.is_locked ? 'manually_locked' : 'auto_locked' } })
      const mins = autoLocked ? Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60_000) : 0
      return res.status(403).json({
        success: false,
        message: autoLocked
          ? `Too many wrong passwords — this account is locked for ${mins} more minute${mins === 1 ? '' : 's'}. An administrator can unlock it sooner.`
          : 'This account has been locked by an administrator. Please contact your administrator.',
      })
    }

    // Step 4 — verify password
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      const attempts = await registerFailedAttempt(user.id)
      logAudit({ userId: user.id, action: 'LOGIN_FAILED', req, newValues: { reason: 'wrong_password', attempts } })
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        return res.status(403).json({
          success: false,
          message: `Too many wrong passwords — this account is now locked for ${AUTO_LOCK_MINUTES} minutes.`,
        })
      }
      const left = MAX_FAILED_ATTEMPTS - attempts
      return res.status(401).json({
        success: false,
        message: `Incorrect password. ${left} attempt${left === 1 ? '' : 's'} left before this account locks. Contact your administrator to reset it.`,
      })
    }

    // Step 5 — two-factor: the password alone does not sign in; hand out a 5-minute challenge for the code step
    if (user.totp_enabled) {
      return res.json({
        success: true, requires_2fa: true,
        challenge: jwt.sign({ typ: '2fa', userId: user.id, branch_id: branch_id ?? null }, SECRET, { expiresIn: '5m' }),
      })
    }
    return await finishLogin(req, res, user, branch_id)
  } catch (err) {
    console.error('login error:', err)
    return res.status(500).json({ success: false, message: 'Login failed' })
  }
}

// Everything after the person is proven: pick the branch, issue the tokens. (Password only, or password + 2FA code.)
export async function finishLogin(req: Request, res: Response, user: any, branch_id?: string) {
  try {
    // Get branch assignment
    const branchQuery = branch_id
      ? `SELECT ub.branch_id, b.name AS branch_name, b.branch_type, ub.role, ub.is_primary
         FROM user_branch ub JOIN branch b ON b.id = ub.branch_id
         WHERE ub.user_id = $1 AND ub.branch_id = $2 AND ub.is_active = TRUE AND ub.deleted_at IS NULL`
      : `SELECT ub.branch_id, b.name AS branch_name, b.branch_type, ub.role, ub.is_primary
         FROM user_branch ub JOIN branch b ON b.id = ub.branch_id
         WHERE ub.user_id = $1 AND ub.is_active = TRUE AND ub.deleted_at IS NULL
         ORDER BY ub.is_primary DESC LIMIT 1`

    const { rows: branches } = await query(
      branchQuery,
      branch_id ? [user.id, branch_id] : [user.id]
    )
    const branch = branches[0]
    if (!branch) {
      return res.status(403).json({ success: false, message: 'This account is not assigned to an active branch. Please contact your administrator.' })
    }

    // All branches the user can switch between
    const { rows: allBranches } = await query(
      `SELECT ub.branch_id AS id, ub.branch_id, b.name AS branch_name, b.branch_type, ub.role, ub.is_primary
       FROM user_branch ub JOIN branch b ON b.id = ub.branch_id
       WHERE ub.user_id = $1 AND ub.is_active = TRUE AND ub.deleted_at IS NULL
       ORDER BY ub.is_primary DESC, b.name`,
      [user.id]
    )

    // Reset failed attempts
    await query(
      `UPDATE users SET failed_attempts = 0, last_login_at = NOW() WHERE id = $1`,
      [user.id]
    )

    const tokenPayload = {
      userId:   user.id,
      orgId:    user.organization_id,
      branchId: branch?.branch_id ?? null,
      role:     branch?.role ?? 'report_viewer',
    }

    const accessToken  = makeAccessToken(tokenPayload)
    const refreshToken = makeRefreshToken({ userId: user.id, jti: randomBytes(8).toString('hex') })   // unique per login: two sign-ins in the same second used to collide on the token hash

    // Store refresh token hash
    await query(
      `INSERT INTO refresh_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    )

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    })

    logAudit({ userId: user.id, branchId: branch?.branch_id ?? null, action: 'LOGIN_SUCCESS', req })

    return res.json({
      success:      true,
      access_token: accessToken,
      user: {
        id:                user.id,
        email:             user.email,
        full_name:         user.full_name,
        avatar_url:        user.avatar_url,
        organization_id:   user.organization_id,
        organization_name: user.org_name,
        current_branch:    branch ? {
          id:          branch.branch_id,
          branch_id:   branch.branch_id,
          branch_name: branch.branch_name,
          branch_type: branch.branch_type,
          role:        branch.role,
          is_primary:  branch.is_primary,
        } : null,
        branches: allBranches,
      },
    })
  } catch (err) {
    console.error('login error:', err)
    return res.status(500).json({ success: false, message: 'Login failed' })
  }
}

export async function refreshToken(req: Request, res: Response) {
  const token = req.cookies.refresh_token
  if (!token) return res.status(401).json({ success: false, message: 'No refresh token' })

  try {
    const payload = jwt.verify(token, SECRET) as { userId: string }

    const { rows } = await query(
      `SELECT * FROM refresh_token WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
      [payload.userId, token]
    )
    if (!rows[0]) return res.status(401).json({ success: false, message: 'Token revoked or expired' })

    // A deactivated, locked or deleted user must not be able to keep minting tokens
    const { rows: acct } = await query(
      `SELECT is_active, is_locked, locked_until FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.userId]
    )
    const a = acct[0]
    if (!a || !a.is_active || a.is_locked || (a.locked_until && new Date(a.locked_until) > new Date())) {
      await query(`UPDATE refresh_token SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [payload.userId])
      return res.status(401).json({ success: false, message: 'Account is not active' })
    }

    // Keep the branch the user had switched to (if still assigned); else fall back to the primary one
    const wanted = typeof req.body?.branch_id === 'string' ? req.body.branch_id : null
    const { rows: ubs } = await query(
      `SELECT ub.branch_id, ub.role, ub.is_primary, u.organization_id
       FROM user_branch ub JOIN users u ON u.id = ub.user_id
       WHERE ub.user_id = $1 AND ub.is_active = TRUE AND ub.deleted_at IS NULL
       ORDER BY (ub.branch_id::text = $2) DESC, ub.is_primary DESC LIMIT 1`,
      [payload.userId, wanted]
    )
    const ub = ubs[0]

    const newAccess = makeAccessToken({
      userId:   payload.userId,
      orgId:    ub?.organization_id,
      branchId: ub?.branch_id,
      role:     ub?.role ?? 'report_viewer',
    })

    return res.json({ success: true, access_token: newAccess })
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' })
  }
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies.refresh_token
  if (token) {
    await query(`UPDATE refresh_token SET revoked_at = NOW() WHERE token_hash = $1`, [token])
  }
  res.clearCookie('refresh_token')
  return res.json({ success: true, message: 'Logged out' })
}

export async function getMe(req: Request, res: Response) {
  if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' })

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.avatar_url, u.organization_id, o.name AS org_name
     FROM users u JOIN organization o ON o.id = u.organization_id
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [req.auth.userId]
  )
  const user = rows[0]
  if (!user) return res.status(404).json({ success: false, message: 'User not found' })

  const { rows: branches } = await query(
    `SELECT ub.branch_id AS id, ub.branch_id, b.name AS branch_name, b.branch_type, ub.role, ub.is_primary
     FROM user_branch ub JOIN branch b ON b.id = ub.branch_id
     WHERE ub.user_id = $1 AND ub.is_active = TRUE AND ub.deleted_at IS NULL
     ORDER BY ub.is_primary DESC, b.name`,
    [user.id]
  )

  return res.json({
    success: true,
    data: {
      ...user,
      organization_name: user.org_name,
      current_branch: branches.find(b => b.id === req.auth?.branchId) ?? branches[0] ?? null,
      branches,
    },
  })
}

// ─── My own permissions (module + sub-page) ────────────────────────────────────
// Self-service mirror of GET /users/:id/permissions — that endpoint is
// admin/manager-only (it's for editing OTHER people's access), but every
// logged-in user needs their own permissions to know what their sidebar
// should show. org_admin has no override rows, so the "no row = full access"
// default already gives admins everything without any special-casing here.
export async function getMyPermissions(req: Request, res: Response) {
  if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' })
  const userId = req.auth.userId

  const [modRows, subRows] = await Promise.all([
    query(`SELECT module_key, can_view, can_edit, can_delete FROM user_permission WHERE user_id = $1`, [userId]),
    query(`SELECT module_key, submodule_key, can_view, can_edit, can_delete FROM user_submodule_permission WHERE user_id = $1`, [userId]),
  ])

  const modules: Record<string, PermFlags> = Object.fromEntries(PERM_MODULES.map(k => [k, { ...FULL }]))
  for (const r of modRows.rows) {
    if (modules[r.module_key] !== undefined) {
      modules[r.module_key] = { view: r.can_view, edit: r.can_edit, delete: r.can_delete }
    }
  }

  const submodules: Record<string, Record<string, PermFlags>> = {}
  for (const [moduleKey, subKeys] of Object.entries(SUBMODULES)) {
    submodules[moduleKey] = Object.fromEntries(subKeys.map(k => [k, { ...FULL }]))
  }
  for (const r of subRows.rows) {
    if (submodules[r.module_key]?.[r.submodule_key] !== undefined) {
      submodules[r.module_key][r.submodule_key] = { view: r.can_view, edit: r.can_edit, delete: r.can_delete }
    }
  }

  return res.json({ success: true, data: { modules, submodules } })
}

// ─── Switch active branch ─────────────────────────────────────────────────────
// Issues a NEW access token scoped to the requested branch (branchId lives in
// the JWT, so every subsequent API call is automatically branch-scoped).
export async function switchBranch(req: Request, res: Response) {
  try {
    if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' })

    const { branch_id } = req.body
    if (!branch_id) {
      return res.status(400).json({ success: false, message: 'branch_id is required' })
    }

    // Verify the user actually has an active assignment on that branch
    const { rows } = await query(
      `SELECT ub.branch_id, b.name AS branch_name, b.branch_type, ub.role, ub.is_primary
       FROM user_branch ub JOIN branch b ON b.id = ub.branch_id
       WHERE ub.user_id = $1 AND ub.branch_id = $2
         AND ub.is_active = TRUE AND ub.deleted_at IS NULL AND b.deleted_at IS NULL`,
      [req.auth.userId, branch_id]
    )
    const branch = rows[0]
    if (!branch) {
      return res.status(403).json({ success: false, message: 'You do not have access to this branch' })
    }

    const accessToken = makeAccessToken({
      userId:   req.auth.userId,
      orgId:    req.auth.orgId,
      branchId: branch.branch_id,
      role:     branch.role,
    })

    return res.json({
      success:      true,
      access_token: accessToken,
      current_branch: {
        id:          branch.branch_id,
        branch_id:   branch.branch_id,
        branch_name: branch.branch_name,
        branch_type: branch.branch_type,
        role:        branch.role,
        is_primary:  branch.is_primary,
      },
    })
  } catch (err) {
    console.error('switchBranch error:', err)
    return res.status(500).json({ success: false, message: 'Failed to switch branch' })
  }
}

// ─── Screen lock (hotel / finance / every non-POS screen) ──────────────────────
// Separate from the restaurant POS PIN: that one identifies WHICH waiter/cashier is
// at a shared till (staff PIN, 4–6 digits). This one protects a logged-in user's own
// session when they step away — the page stays exactly as it was, and only the
// account owner's PASSWORD brings it back. Wrong passwords count toward the same
// auto-lock as the login page, so the lock screen can't be used to brute-force.

export async function lockSession(req: Request, res: Response) {
  const { userId, branchId } = req.auth!
  logAudit({ userId, branchId, action: 'SCREEN_LOCKED', tableName: 'users', recordId: userId, req })
  return res.json({ success: true })
}

// NOTE: a wrong password answers 400 (never 401) — the frontend treats any 401 as
// "session invalid" and logs the browser out, which must not happen over a typo.
export async function unlockSession(req: Request, res: Response) {
  const { userId, branchId } = req.auth!
  const password = String(req.body?.password ?? '')
  if (!password) return res.status(400).json({ success: false, message: 'Enter your password to unlock' })

  const { rows } = await query(
    `SELECT password_hash, is_active, is_locked, locked_until FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]
  )
  const u = rows[0]
  if (!u || !u.is_active || u.is_locked) {
    return res.status(401).json({ success: false, message: 'This account is locked or no longer active' })
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    return res.status(423).json({ success: false, message: 'Too many wrong passwords — this account is temporarily locked.' })
  }

  const ok = await bcrypt.compare(password, u.password_hash)
  if (!ok) {
    const attempts = await registerFailedAttempt(userId)
    logAudit({ userId, branchId, action: 'UNLOCK_FAILED', tableName: 'users', recordId: userId, req, newValues: { attempts } })
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await query(`UPDATE refresh_token SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId])
      return res.status(423).json({ success: false, message: `Too many wrong passwords — this account is locked for ${AUTO_LOCK_MINUTES} minutes.` })
    }
    const left = MAX_FAILED_ATTEMPTS - attempts
    return res.status(400).json({ success: false, message: `Incorrect password. ${left} attempt${left === 1 ? '' : 's'} left.` })
  }

  await query(`UPDATE users SET failed_attempts = 0 WHERE id = $1`, [userId])
  logAudit({ userId, branchId, action: 'SCREEN_UNLOCKED', tableName: 'users', recordId: userId, req })
  return res.json({ success: true })
}
