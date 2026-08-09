import { Request } from 'express'
import { query } from '../db/pool'

interface AuditParams {
  userId?: string | null
  branchId?: string | null
  action: string
  tableName?: string | null
  recordId?: string | null
  newValues?: unknown
  oldValues?: unknown
  req?: Request
}

// Fire-and-forget audit trail writer — used across auth, user management, and
// POS PIN login so every account/security-relevant event is traceable
// (who did what, from which IP, when). Never throws: a logging failure must
// not break the request that triggered it.
export async function logAudit(params: AuditParams) {
  const { userId = null, branchId = null, action, tableName = null, recordId = null, newValues, oldValues, req } = params
  const ip = req?.ip ?? req?.socket?.remoteAddress ?? null
  const userAgent = req?.get?.('user-agent') ?? null

  try {
    await query(
      `INSERT INTO audit_log (user_id, branch_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        userId, branchId, action, tableName, recordId,
        oldValues !== undefined ? JSON.stringify(oldValues) : null,
        newValues !== undefined ? JSON.stringify(newValues) : null,
        ip, userAgent,
      ]
    )
  } catch (err) {
    console.error('audit log failed:', err)
  }
}
