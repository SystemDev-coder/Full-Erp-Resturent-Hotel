import { Request, Response } from 'express'
import { query } from '../../db/pool'

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
     JOIN table_area ta ON ta.id = dt.area_id WHERE dt.id = $1`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Table not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function updateTableStatus(req: Request, res: Response) {
  const { status } = req.body
  await query(`UPDATE dining_table SET status = $1 WHERE id = $2`, [status, req.params.id])
  return res.json({ success: true })
}