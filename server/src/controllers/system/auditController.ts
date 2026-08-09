import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

// Record who printed a KOT / receipt — shows up in Settings → Activity Logs
export async function logPrintEvent(req: Request, res: Response) {
  const { userId, branchId } = req.auth!
  const { action, details } = req.body

  const ALLOWED = ['PRINT_KOT', 'PRINT_RECEIPT', 'PRINT_REPORT']
  if (!ALLOWED.includes(action)) {
    return res.status(400).json({ success: false, message: `action must be one of: ${ALLOWED.join(', ')}` })
  }

  await query(
    `INSERT INTO audit_log (user_id, branch_id, action, table_name, new_values, ip_address)
     VALUES ($1, $2, $3, 'order', $4, $5)`,
    [userId, branchId, action, JSON.stringify(details ?? {}), req.ip ?? null]
  )
  return res.json({ success: true })
}

export async function listAuditLogs(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { limit, offset } = getPagination(req, 50)

  const { rows } = await query(
    `SELECT al.id, al.action, al.table_name, al.record_id,
            al.old_values, al.new_values, al.ip_address, al.created_at,
            u.full_name AS user_name, u.email AS user_email,
            b.name AS branch_name
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN branch b ON b.id = al.branch_id
     WHERE al.branch_id IN (SELECT id FROM branch WHERE organization_id = $1)
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [orgId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore, limit, offset })
}