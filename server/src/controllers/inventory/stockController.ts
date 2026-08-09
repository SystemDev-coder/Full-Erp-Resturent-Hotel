import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

export async function listStock(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT sb.id, sb.item_id, i.sku, i.name, i.category, i.unit_of_measure,
            sb.quantity_on_hand, sb.average_cost, sb.last_updated, i.reorder_level,
            w.name AS warehouse_name,
            CASE WHEN sb.quantity_on_hand <= i.reorder_level THEN true ELSE false END AS is_low
     FROM stock_balance sb
     JOIN item i ON i.id = sb.item_id
     JOIN warehouse w ON w.id = sb.warehouse_id
     WHERE w.branch_id = $1 AND i.deleted_at IS NULL
     ORDER BY i.category, i.name`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function getLowStock(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT i.name, i.unit_of_measure, sb.quantity_on_hand, i.reorder_level
     FROM stock_balance sb
     JOIN item i ON i.id = sb.item_id
     JOIN warehouse w ON w.id = sb.warehouse_id
     WHERE w.branch_id = $1 AND sb.quantity_on_hand <= i.reorder_level AND i.deleted_at IS NULL
     ORDER BY (sb.quantity_on_hand / NULLIF(i.reorder_level, 0)) ASC`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function adjustStock(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { item_id, movement_type, quantity, unit_cost = 0, notes } = req.body

  if (!item_id || !movement_type || !quantity) {
    return res.status(400).json({ success: false, message: 'item_id, movement_type, and quantity are required' })
  }

  const VALID_TYPES = ['purchase','issue_kitchen','adjustment','transfer_in','transfer_out','waste','return']
  if (!VALID_TYPES.includes(movement_type)) {
    return res.status(400).json({ success: false, message: `Invalid movement_type. Must be one of: ${VALID_TYPES.join(', ')}` })
  }

  const { rows: whs } = await query(
    `SELECT id FROM warehouse WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL LIMIT 1`,
    [branchId]
  )
  if (!whs[0]) return res.status(404).json({ success: false, message: 'No warehouse found for this branch' })
  const warehouseId = whs[0].id

  const OUT_TYPES = new Set(['issue_kitchen','transfer_out','waste'])
  const isOut = OUT_TYPES.has(movement_type)
  const qty = Math.abs(Number(quantity))

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Ensure stock_balance row exists
    await client.query(
      `INSERT INTO stock_balance (warehouse_id, item_id, quantity_on_hand, average_cost)
       VALUES ($1,$2,0,0) ON CONFLICT (warehouse_id, item_id) DO NOTHING`,
      [warehouseId, item_id]
    )

    if (isOut) {
      const { rows: bal } = await client.query(
        `SELECT quantity_on_hand FROM stock_balance WHERE warehouse_id = $1 AND item_id = $2`,
        [warehouseId, item_id]
      )
      if (Number(bal[0]?.quantity_on_hand ?? 0) < qty) {
        await client.query('ROLLBACK')
        return res.status(409).json({ success: false, message: 'Insufficient stock' })
      }
      await client.query(
        `UPDATE stock_balance SET quantity_on_hand = quantity_on_hand - $1, last_updated = NOW()
         WHERE warehouse_id = $2 AND item_id = $3`,
        [qty, warehouseId, item_id]
      )
    } else {
      await client.query(
        `UPDATE stock_balance
         SET average_cost = (quantity_on_hand * average_cost + $1 * $2) / (quantity_on_hand + $1),
             quantity_on_hand = quantity_on_hand + $1,
             last_updated = NOW()
         WHERE warehouse_id = $3 AND item_id = $4`,
        [qty, Number(unit_cost), warehouseId, item_id]
      )
    }

    await client.query(
      `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost, notes, moved_by_staff)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [warehouseId, item_id, movement_type, qty, unit_cost, notes ?? null, userId]
    )

    await client.query('COMMIT')
    const { rows: updated } = await query(
      `SELECT quantity_on_hand, average_cost FROM stock_balance WHERE warehouse_id = $1 AND item_id = $2`,
      [warehouseId, item_id]
    )
    return res.json({ success: true, data: updated[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}