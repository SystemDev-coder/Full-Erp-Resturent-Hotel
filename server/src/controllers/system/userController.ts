import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query, pool } from '../../db/pool'
import { logAudit } from '../../utils/audit'

export async function listUsers(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.avatar_url, u.is_active, u.is_locked, u.last_login_at,
            u.failed_attempts, u.locked_until, u.created_at,
            json_agg(json_build_object('branch_id', ub.branch_id, 'role', ub.role, 'branch_name', b.name)) AS branches
     FROM users u
     LEFT JOIN user_branch ub ON ub.user_id = u.id AND ub.deleted_at IS NULL
     LEFT JOIN branch b ON b.id = ub.branch_id
     WHERE u.organization_id = $1 AND u.deleted_at IS NULL
     GROUP BY u.id ORDER BY u.full_name`,
    [orgId]
  )
  return res.json({ success: true, data: rows })
}

export async function inviteUser(req: Request, res: Response) {
  const { orgId, userId: invitedBy, branchId: actorBranchId } = req.auth!
  const { full_name, email, phone, branch_id, role, password, avatar_url } = req.body

  if (!full_name || !email || !branch_id || !role) {
    return res.status(400).json({ success: false, message: 'full_name, email, branch_id, and role are required' })
  }

  const { rows: existing } = await query(
    `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]
  )
  if (existing[0]) return res.status(409).json({ success: false, message: 'Email already registered' })

  const tempPassword = password ?? Math.random().toString(36).slice(-8) + 'A1!'
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  const { rows: [user] } = await query(
    `INSERT INTO users (organization_id, full_name, email, phone, avatar_url, password_hash, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, email, full_name`,
    [orgId, full_name, email, phone ?? null, avatar_url ?? null, passwordHash, invitedBy]
  )

  await query(
    `INSERT INTO user_branch (user_id, branch_id, role, invited_by)
     VALUES ($1,$2,$3,$4)`,
    [user.id, branch_id, role, invitedBy]
  )

  logAudit({ userId: invitedBy, branchId: actorBranchId, action: 'USER_CREATED', tableName: 'users', recordId: user.id, req,
    newValues: { full_name, email, role } })

  return res.status(201).json({
    success: true,
    data: { ...user, temp_password: password ? undefined : tempPassword }
  })
}

export async function updateUserBranch(req: Request, res: Response) {
  const { id, branchId } = req.params
  const { role, is_active } = req.body

  const { rows } = await query(
    `UPDATE user_branch SET
       role      = COALESCE($1, role),
       is_active = COALESCE($2, is_active),
       updated_at = NOW()
     WHERE user_id = $3 AND branch_id = $4 AND deleted_at IS NULL
     RETURNING user_id, branch_id, role, is_active`,
    [role ?? null, is_active ?? null, id, branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User branch assignment not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deactivateUser(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  await query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [id])
  logAudit({ userId, branchId, action: 'USER_DEACTIVATED', tableName: 'users', recordId: id, req })
  return res.json({ success: true })
}

export async function activateUser(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  await query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [id])
  logAudit({ userId, branchId, action: 'USER_ACTIVATED', tableName: 'users', recordId: id, req })
  return res.json({ success: true })
}

// Manual admin lock — independent of the auto-lock (locked_until) that kicks
// in after repeated bad login attempts. Blocks login immediately.
export async function lockUser(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  if (id === userId) {
    return res.status(409).json({ success: false, message: 'You cannot lock your own account' })
  }
  const { rows } = await query(
    `UPDATE users SET is_locked = TRUE WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' })
  logAudit({ userId, branchId, action: 'USER_LOCKED', tableName: 'users', recordId: id, req })
  return res.json({ success: true })
}

// Clears BOTH the manual lock and any auto-lockout (failed attempts / cooldown)
export async function unlockUser(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  const { rows } = await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, is_locked = FALSE
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' })
  logAudit({ userId, branchId, action: 'USER_UNLOCKED', tableName: 'users', recordId: id, req })
  return res.json({ success: true })
}

// Security action: revoke every active refresh token for a user, forcing them
// to log in again everywhere. Real, functional — not decorative.
export async function revokeUserSessions(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  const { rowCount } = await query(
    `UPDATE refresh_token SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [id]
  )
  logAudit({ userId, branchId, action: 'USER_SESSIONS_REVOKED', tableName: 'users', recordId: id, req, newValues: { sessions_revoked: rowCount } })
  return res.json({ success: true, data: { sessions_revoked: rowCount } })
}

// Full user edit: identity fields on `users` + role on one branch assignment
export async function updateUser(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId: actorBranchId } = req.auth!
  const { full_name, phone, branch_id, role, avatar_url } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE users SET
         full_name  = COALESCE($1, full_name),
         phone      = COALESCE($2, phone),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = NOW()
       WHERE id = $4 AND deleted_at IS NULL
       RETURNING id, email, full_name, phone, avatar_url`,
      [full_name ?? null, phone ?? null, avatar_url ?? null, id]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    if (branch_id && role) {
      await client.query(
        `UPDATE user_branch SET role = $1, updated_at = NOW()
         WHERE user_id = $2 AND branch_id = $3 AND deleted_at IS NULL`,
        [role, id, branch_id]
      )
    }
    await client.query('COMMIT')
    logAudit({ userId, branchId: actorBranchId, action: 'USER_UPDATED', tableName: 'users', recordId: id, req,
      newValues: { full_name, phone, role } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── Per-user module permissions ──────────────────────────────────────────────

export const PERM_MODULES = ['dashboard', 'hotel', 'restaurant', 'inventory', 'finance', 'hr'] as const

export interface PermFlags { view: boolean; edit: boolean; delete: boolean }
export const FULL: PermFlags = { view: true, edit: true, delete: true }

export async function getUserPermissions(req: Request, res: Response) {
  const { id } = req.params
  const { rows } = await query(
    `SELECT module_key, can_view, can_edit, can_delete FROM user_permission WHERE user_id = $1`,
    [id]
  )
  // Default is full access — only overrides are stored
  const map: Record<string, PermFlags> = Object.fromEntries(PERM_MODULES.map(k => [k, { ...FULL }]))
  for (const r of rows) {
    if (map[r.module_key] !== undefined) {
      map[r.module_key] = { view: r.can_view, edit: r.can_edit, delete: r.can_delete }
    }
  }
  return res.json({ success: true, data: map })
}

export async function setUserPermissions(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  const { permissions } = req.body as { permissions: Record<string, PermFlags> }

  if (id === userId) {
    return res.status(409).json({ success: false, message: 'You cannot change your own permissions' })
  }
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ success: false, message: 'permissions object is required' })
  }
  for (const [key, flags] of Object.entries(permissions)) {
    if (!PERM_MODULES.includes(key as any) || typeof flags?.view !== 'boolean'
        || typeof flags?.edit !== 'boolean' || typeof flags?.delete !== 'boolean') {
      return res.status(400).json({ success: false, message: `Invalid permission entry: ${key}` })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [module_key, flags] of Object.entries(permissions)) {
      // No view = no access at all; edit/delete can't function without view
      const view = flags.view
      const edit = view && flags.edit
      const del  = view && flags.delete
      await client.query(
        `INSERT INTO user_permission (user_id, module_key, can_view, can_edit, can_delete, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, module_key)
         DO UPDATE SET can_view = $3, can_edit = $4, can_delete = $5, updated_by = $6, updated_at = NOW()`,
        [id, module_key, view, edit, del, userId]
      )
    }
    await client.query('COMMIT')
    logAudit({ userId, branchId, action: 'USER_PERMISSIONS_UPDATED', tableName: 'users', recordId: id, req, newValues: permissions })
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── Per-user submodule (sub-page) permissions ────────────────────────────────
// Finer-grained than module permissions — e.g. within "Hotel", Bookings vs
// Rooms vs Guests vs Housekeeping can each be independently hidden. Keyed by
// (module_key, submodule_key); no row = full access, same convention as above.

export const SUBMODULES: Record<string, string[]> = {
  hotel:      ['bookings', 'rooms', 'guests', 'housekeeping'],
  restaurant: ['pos', 'operations', 'menu'],
  inventory:  ['items', 'warehouses', 'suppliers', 'orders'],
  finance:    ['accounts', 'receipts', 'expenses', 'salary'],
}

export async function getUserSubmodulePermissions(req: Request, res: Response) {
  const { id } = req.params
  const { rows } = await query(
    `SELECT module_key, submodule_key, can_view, can_edit, can_delete
     FROM user_submodule_permission WHERE user_id = $1`,
    [id]
  )
  // Default is full access — only overrides are stored
  const map: Record<string, Record<string, PermFlags>> = {}
  for (const [moduleKey, subKeys] of Object.entries(SUBMODULES)) {
    map[moduleKey] = Object.fromEntries(subKeys.map(k => [k, { ...FULL }]))
  }
  for (const r of rows) {
    if (map[r.module_key]?.[r.submodule_key] !== undefined) {
      map[r.module_key][r.submodule_key] = { view: r.can_view, edit: r.can_edit, delete: r.can_delete }
    }
  }
  return res.json({ success: true, data: map })
}

export async function setUserSubmodulePermissions(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  const { permissions } = req.body as { permissions: Record<string, Record<string, PermFlags>> }

  if (id === userId) {
    return res.status(409).json({ success: false, message: 'You cannot change your own permissions' })
  }
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ success: false, message: 'permissions object is required' })
  }
  for (const [moduleKey, subs] of Object.entries(permissions)) {
    const validSubKeys = SUBMODULES[moduleKey]
    if (!validSubKeys) return res.status(400).json({ success: false, message: `Invalid module: ${moduleKey}` })
    for (const [subKey, flags] of Object.entries(subs ?? {})) {
      if (!validSubKeys.includes(subKey) || typeof flags?.view !== 'boolean'
          || typeof flags?.edit !== 'boolean' || typeof flags?.delete !== 'boolean') {
        return res.status(400).json({ success: false, message: `Invalid permission entry: ${moduleKey}.${subKey}` })
      }
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [moduleKey, subs] of Object.entries(permissions)) {
      for (const [subKey, flags] of Object.entries(subs)) {
        const view = flags.view
        const edit = view && flags.edit
        const del  = view && flags.delete
        await client.query(
          `INSERT INTO user_submodule_permission (user_id, module_key, submodule_key, can_view, can_edit, can_delete, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id, module_key, submodule_key)
           DO UPDATE SET can_view = $4, can_edit = $5, can_delete = $6, updated_by = $7, updated_at = NOW()`,
          [id, moduleKey, subKey, view, edit, del, userId]
        )
      }
    }
    await client.query('COMMIT')
    logAudit({ userId, branchId, action: 'USER_PERMISSIONS_UPDATED', tableName: 'users', recordId: id, req, newValues: permissions })
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Admin/manager sets a new password for a user. Also clears any lockout and
// revokes existing sessions so the old password can't keep an open session alive.
export async function resetUserPassword(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!
  const { password } = req.body

  if (!password || String(password).length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
  }

  const hash = await bcrypt.hash(String(password), 12)
  const { rows } = await query(
    `UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL, is_locked = FALSE, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL RETURNING id, email`,
    [hash, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' })

  await query(`UPDATE refresh_token SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [id])
  logAudit({ userId, branchId, action: 'USER_PASSWORD_RESET', tableName: 'users', recordId: id, req })
  return res.json({ success: true })
}

// Soft-delete a user account
export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params
  const { userId, branchId } = req.auth!

  if (id === userId) {
    return res.status(409).json({ success: false, message: 'You cannot delete your own account' })
  }
  const { rows } = await query(
    `UPDATE users SET deleted_at = NOW(), deleted_by = $1
     WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
    [userId, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' })
  logAudit({ userId, branchId, action: 'USER_DELETED', tableName: 'users', recordId: id, req })
  return res.json({ success: true })
}
