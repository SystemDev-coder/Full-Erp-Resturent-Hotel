import { Request, Response } from 'express'
import { query } from '../../db/pool'

const TABLE_STATUSES = ['available', 'reserved', 'occupied', 'cleaning', 'inactive']

const IN_BRANCH = `dt.area_id IN (
  SELECT ta.id FROM table_area ta JOIN restaurant r ON r.id = ta.restaurant_id WHERE r.branch_id = $2)`

export async function listTables(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT dt.id, dt.table_number, dt.capacity, dt.status, ta.name AS area_name
     FROM dining_table dt
     JOIN table_area ta ON ta.id = dt.area_id
     JOIN restaurant r ON r.id = ta.restaurant_id
     WHERE r.branch_id = $1 AND dt.deleted_at IS NULL
     ORDER BY ta.name, dt.table_number`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function getTableStatus(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT dt.*, ta.name AS area_name FROM dining_table dt
     JOIN table_area ta ON ta.id = dt.area_id
     WHERE dt.id = $1 AND dt.deleted_at IS NULL AND ${IN_BRANCH}`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Table not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function updateTableStatus(req: Request, res: Response) {
  const { status } = req.body
  if (!TABLE_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${TABLE_STATUSES.join(', ')}` })
  }

  // A table with a live order on it cannot be released by hand — that would let a second party be seated on a bill
  if (status === 'available' || status === 'cleaning' || status === 'inactive') {
    const { rows: live } = await query(
      `SELECT 1 FROM order_header WHERE dining_table_id = $1 AND branch_id = $2 AND deleted_at IS NULL
         AND status IN ('open','preparing','ready','served','billed') LIMIT 1`,
      [req.params.id, req.auth!.branchId]
    )
    if (live[0]) {
      return res.status(409).json({ success: false, message: 'This table still has an unpaid order — settle or cancel it first' })
    }
  }

  const { rows } = await query(
    `UPDATE dining_table dt SET status = $1 WHERE dt.id = $3 AND dt.deleted_at IS NULL AND ${IN_BRANCH} RETURNING dt.id`,
    [status, req.auth!.branchId, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Table not found' })
  return res.json({ success: true })
}
