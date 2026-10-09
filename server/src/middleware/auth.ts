import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../db/pool'

export interface AuthPayload {
  userId:   string
  orgId:    string
  branchId: string
  role:     string
  iat:      number
  exp:      number
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}

// A signed token stays valid for its whole lifetime (15 min), so on its own it
// cannot reflect "admin locked / deactivated / deleted this user a second ago".
// Each request therefore also checks the account's live status — cached for a few
// seconds so this costs ~1 query per user per TTL instead of one per request.
const STATUS_TTL_MS = 10_000
const statusCache = new Map<string, { usable: boolean; expires: number }>()

export const invalidateUserStatus = (userId: string) => { statusCache.delete(userId) }

async function isUserUsable(userId: string): Promise<boolean> {
  const hit = statusCache.get(userId)
  if (hit && hit.expires > Date.now()) return hit.usable

  const { rows } = await query(
    `SELECT is_active, is_locked, locked_until FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]
  )
  const u = rows[0]
  const usable = !!u && u.is_active && !u.is_locked && !(u.locked_until && new Date(u.locked_until) > new Date())
  statusCache.set(userId, { usable, expires: Date.now() + STATUS_TTL_MS })
  return usable
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' })
  }

  const token  = header.slice(7)
  const secret = process.env.JWT_SECRET ?? ''

  let payload: AuthPayload
  try {
    payload = jwt.verify(token, secret) as AuthPayload
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }

  try {
    if (!(await isUserUsable(payload.userId))) {
      return res.status(401).json({ success: false, message: 'This account is locked or no longer active' })
    }
  } catch (err) {
    return next(err)
  }
  req.auth = payload
  next()
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Not authenticated' })
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' })
    }
    next()
  }
}

// Server-side switch for Systems → Modules: a module that an admin turned OFF for the
// caller's branch answers 403 on every API call, not just "hidden in the sidebar".
// No row = enabled (fresh installs keep working). Cached for a few seconds per branch.
const moduleCache = new Map<string, { enabled: boolean; expires: number }>()
export const invalidateModuleCache = () => moduleCache.clear()

export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' })
    try {
      const cacheKey = `${req.auth.orgId}:${req.auth.branchId}:${moduleKey}`
      let hit = moduleCache.get(cacheKey)
      if (!hit || hit.expires < Date.now()) {
        const { rows } = await query(
          `SELECT is_enabled FROM module_config
           WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
             AND module_key = $3 AND deleted_at IS NULL
           ORDER BY branch_id NULLS LAST LIMIT 1`,
          [req.auth.orgId, req.auth.branchId, moduleKey]
        )
        hit = { enabled: rows[0]?.is_enabled !== false, expires: Date.now() + 10_000 }
        moduleCache.set(cacheKey, hit)
      }
      if (!hit.enabled) {
        return res.status(403).json({ success: false, message: `The ${moduleKey} module is switched off for this branch (Systems → Modules).` })
      }
      return next()
    } catch (err) { return next(err) }
  }
}
