import { PoolClient } from 'pg'

// Statuses in which an order is still "live" (can take new items / be cancelled)
export const ACTIVE_ORDER = ['open', 'preparing', 'ready', 'served']

// Free a dining table once nothing live is left on it. Only moves 'occupied' →
// 'cleaning' so a manually-set status (reserved, inactive) is never overwritten.
export async function releaseTable(c: PoolClient, tableId: string | null, exceptOrderId: string) {
  if (!tableId) return
  const { rows } = await c.query(
    `SELECT 1 FROM order_header
     WHERE dining_table_id = $1 AND id <> $2 AND deleted_at IS NULL
       AND status IN ('open','preparing','ready','served','billed') LIMIT 1`,
    [tableId, exceptOrderId]
  )
  if (rows[0]) return
  await c.query(`UPDATE dining_table SET status = 'cleaning' WHERE id = $1 AND status = 'occupied'`, [tableId])
}

// Consume ingredients for a sold order, based on each dish's recipe. Runs once
// per order (guarded by an existing stock_movement for it). A sale is never
// blocked by low stock — the balance may go negative, which shows up in the
// Low-stock list so the shortfall gets noticed and corrected.
export async function deductRecipeStock(c: PoolClient, orderId: string, branchId: string, userId: string) {
  const { rows: done } = await c.query(
    `SELECT 1 FROM stock_movement WHERE reference_type = 'order' AND reference_id = $1 LIMIT 1`, [orderId]
  )
  if (done[0]) return

  const { rows: needs } = await c.query(
    `SELECT r.item_id, SUM(r.quantity_used * ol.quantity) AS qty
     FROM order_line ol
     JOIN recipe r ON r.menu_item_id = ol.menu_item_id AND r.deleted_at IS NULL
     WHERE ol.order_id = $1 AND ol.status <> 'cancelled' AND ol.deleted_at IS NULL
     GROUP BY r.item_id`,
    [orderId]
  )
  if (needs.length === 0) return

  const { rows: [wh] } = await c.query(
    `SELECT id FROM warehouse WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL
     ORDER BY created_at LIMIT 1`,
    [branchId]
  )
  if (!wh) return // no warehouse configured for this branch — nothing to deduct from

  for (const n of needs) {
    const qty = Number(n.qty)
    if (!(qty > 0)) continue
    await c.query(
      `INSERT INTO stock_balance (warehouse_id, item_id, quantity_on_hand, average_cost)
       VALUES ($1, $2, 0, 0) ON CONFLICT (warehouse_id, item_id) DO NOTHING`,
      [wh.id, n.item_id]
    )
    const { rows: [bal] } = await c.query(
      `UPDATE stock_balance SET quantity_on_hand = quantity_on_hand - $1, last_updated = NOW()
       WHERE warehouse_id = $2 AND item_id = $3 RETURNING average_cost`,
      [qty, wh.id, n.item_id]
    )
    await c.query(
      `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost,
                                   reference_type, reference_id, notes, moved_by_staff)
       VALUES ($1, $2, 'issue_kitchen', $3, $4, 'order', $5, 'Auto-deducted from sold order', $6)`,
      [wh.id, n.item_id, qty, bal?.average_cost ?? 0, orderId, userId]
    )
  }
}

// Called inside the payment transaction once an order's invoice is fully
// settled: order → paid, table freed, ingredients deducted.
export async function settleOrder(c: PoolClient, orderId: string, branchId: string, userId: string) {
  const { rows: [o] } = await c.query(
    `SELECT id, status, dining_table_id FROM order_header
     WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [orderId, branchId]
  )
  if (!o || o.status === 'cancelled' || o.status === 'paid') return

  await c.query(
    `UPDATE order_header SET status = 'paid', closed_at = NOW(), updated_by = $2, updated_at = NOW() WHERE id = $1`,
    [orderId, userId]
  )
  await releaseTable(c, o.dining_table_id, orderId)
  await deductRecipeStock(c, orderId, branchId, userId)
}
