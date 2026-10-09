import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'

export async function listFiscalYears(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, name, start_date, end_date, is_closed, closed_at
     FROM fiscal_year WHERE organization_id = $1
     ORDER BY start_date DESC`,
    [req.auth!.orgId]
  )
  return res.json({ success: true, data: rows })
}

export async function createFiscalYear(req: Request, res: Response) {
  const { name, start_date, end_date } = req.body
  if (!name || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: 'name, start_date, end_date are required' })
  }
  if (new Date(end_date) <= new Date(start_date)) {
    return res.status(400).json({ success: false, message: 'end_date must be after start_date' })
  }
  const { rows } = await query(
    `INSERT INTO fiscal_year (organization_id, name, start_date, end_date)
     VALUES ($1,$2,$3,$4) RETURNING id, name, start_date, end_date`,
    [req.auth!.orgId, name, start_date, end_date]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function closeFiscalYear(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE fiscal_year SET is_closed = TRUE, closed_at = NOW(), closed_by = $2
     WHERE id = $1 AND organization_id = $3 AND is_closed = FALSE
     RETURNING id, name, is_closed`,
    [req.params.id, req.auth!.userId, req.auth!.orgId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Fiscal year not found or already closed' })
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: 'FISCAL_YEAR_CLOSED', tableName: 'fiscal_year', recordId: rows[0].id, req, newValues: { name: rows[0].name } })
  return res.json({ success: true, data: rows[0] })
}

// Closing now really locks the books (a database trigger rejects any ledger posting dated inside it),
// so an administrator needs a way back for mistakes — reopening is audited.
export async function reopenFiscalYear(req: Request, res: Response) {
  const { orgId, userId, branchId } = req.auth!
  const { rows } = await query(
    `UPDATE fiscal_year SET is_closed = FALSE, closed_at = NULL, closed_by = NULL
     WHERE id = $1 AND organization_id = $2 AND is_closed = TRUE AND deleted_at IS NULL
     RETURNING id, name, is_closed`,
    [req.params.id, orgId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Fiscal year not found or already open' })
  logAudit({ userId, branchId, action: 'FISCAL_YEAR_REOPENED', tableName: 'fiscal_year', recordId: rows[0].id, req, newValues: { name: rows[0].name } })
  return res.json({ success: true, data: rows[0] })
}

export async function getCurrentFiscalYear(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, name, start_date, end_date, is_closed
     FROM fiscal_year
     WHERE organization_id = $1 AND is_closed = FALSE
       AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
     LIMIT 1`,
    [req.auth!.orgId]
  )
  return res.json({ success: true, data: rows[0] ?? null })
}
