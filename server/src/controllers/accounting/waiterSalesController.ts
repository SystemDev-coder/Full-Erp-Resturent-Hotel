import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { periodFrom } from './financeReportController'

// Sales by waiter / cashier: every restaurant payment is recorded against the person who collected it
// (the PIN-signed-in waiter at the POS; otherwise the waiter of the order).
export async function getWaiterSales(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { from, to } = periodFrom(req)
  const { rows } = await query(
    `SELECT pc.staff_id, COALESCE(NULLIF(TRIM(s.first_name || ' ' || s.last_name), ''), 'Not recorded') AS name, s.role,
            COALESCE(SUM(pc.amount), 0) AS collected, COUNT(DISTINCT pc.order_id) AS orders,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.method = 'cash'), 0) AS cash,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.method = 'mobile'), 0) AS mobile,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.method IN ('card', 'bank_transfer')), 0) AS card,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.method = 'room_charge'), 0) AS room
     FROM payment_collection pc LEFT JOIN staff s ON s.id = pc.staff_id
     WHERE pc.branch_id = $1 AND pc.created_at::date BETWEEN $2 AND $3
     GROUP BY pc.staff_id, s.first_name, s.last_name, s.role ORDER BY collected DESC`, [branchId, from, to])
  const data = rows.map((r: any) => ({ ...r, collected: Number(r.collected), orders: Number(r.orders), cash: Number(r.cash), mobile: Number(r.mobile), card: Number(r.card), room: Number(r.room) }))
  return res.json({ success: true, data: { period: { from, to }, rows: data, total: data.reduce((s: number, r: any) => s + r.collected, 0) } })
}
