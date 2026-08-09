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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' })
  }

  const token  = header.slice(7)
  const secret = process.env.JWT_SECRET ?? ''

  try {
    const payload = jwt.verify(token, secret) as AuthPayload
    req.auth = payload
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
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

export async function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' })

    const { rows } = await query(
      `SELECT is_enabled FROM module_config
       WHERE organization_id = $1
         AND (branch_id = $2 OR branch_id IS NULL)
         AND module_key = $3
         AND deleted_at IS NULL
       ORDER BY branch_id NULLS LAST
       LIMIT 1`,
      [req.auth.orgId, req.auth.branchId, moduleKey]
    )

    if (!rows[0]?.is_enabled) {
      return res.status(403).json({ success: false, message: `Module '${moduleKey}' is not enabled for this branch` })
    }
    next()
  }
}