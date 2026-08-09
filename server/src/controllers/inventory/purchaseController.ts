import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

export async function listPOs(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT po.id, po.po_number, po.status, po.order_date, po.total_amount,
            s.name AS supplier_name
     FROM purchase_order po JOIN supplier s ON s.id = po.supplier_id
     WHERE po.branch_id = $1 AND po.deleted_at IS NULL
     ORDER BY po.order_date DESC LIMIT 100`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function getPO(req: Request, res: Response) {
  const [{ rows: pos }, { rows: lines }] = await Promise.all([
    query(`SELECT po.*, s.name AS supplier_name FROM purchase_order po
           JOIN supplier s ON s.id = po.supplier_id WHERE po.id = $1`, [req.params.id]),
    query(`SELECT pl.*, i.name AS item_name, i.unit_of_measure FROM purchase_line pl
           JOIN item i ON i.id = pl.item_id WHERE pl.po_id = $1`, [req.params.id]),
  ])
  if (!pos[0]) return res.status(404).json({ success: false, message: 'PO not found' })
  return res.json({ success: true, data: { ...pos[0], lines } })
}

export async function createPO(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { supplier_id, warehouse_id, order_date, expected_date, notes, lines } = req.body

  if (!supplier_id || !warehouse_id || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ success: false, message: 'supplier_id, warehouse_id and lines[] are required' })
  }

  const poNumber = 'PO-' + Date.now().toString(36).toUpperCase()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [po] } = await client.query(
      `INSERT INTO purchase_order (branch_id, supplier_id, warehouse_id, po_number, order_date, expected_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, po_number`,
      [branchId, supplier_id, warehouse_id, poNumber,
       order_date ?? new Date().toISOString().slice(0,10),
       expected_date ?? null, notes ?? null, userId]
    )

    let subtotal = 0
    for (const line of lines) {
      const { item_id, quantity_ordered, unit_cost } = line
      if (!item_id || !quantity_ordered || !unit_cost) throw new Error('Each line needs item_id, quantity_ordered, unit_cost')
      subtotal += Number(quantity_ordered) * Number(unit_cost)
      await client.query(
        `INSERT INTO purchase_line (po_id, item_id, quantity_ordered, unit_cost)
         VALUES ($1,$2,$3,$4)`,
        [po.id, item_id, quantity_ordered, unit_cost]
      )
    }

    await client.query(
      `UPDATE purchase_order SET subtotal = $1, total_amount = $1 WHERE id = $2`,
      [subtotal, po.id]
    )

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: { ...po, subtotal, total_amount: subtotal } })
  } catch (err: any) {
    await client.query('ROLLBACK')
    return res.status(400).json({ success: false, message: err.message })
  } finally {
    client.release()
  }
}

// Cancel a PO that hasn't been (fully) received yet
export async function cancelPO(req: Request, res: Response) {
  const { id } = req.params
  const { rows } = await query(
    `SELECT status FROM purchase_order WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'PO not found' })
  if (['received', 'cancelled'].includes(rows[0].status)) {
    return res.status(409).json({ success: false, message: `PO is already ${rows[0].status}` })
  }
  await query(
    `UPDATE purchase_order SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [id]
  )
  return res.json({ success: true })
}

// Only a still-draft PO (nothing received against it yet) can be hard-deleted —
// anything sent/partial/received/cancelled must go through cancelPO instead so
// the order history and any stock movements already posted stay intact.
export async function deletePO(req: Request, res: Response) {
  const { id } = req.params
  const { rows } = await query(
    `SELECT status FROM purchase_order WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'PO not found' })
  if (rows[0].status !== 'draft') {
    return res.status(409).json({ success: false, message: 'Only draft purchase orders can be deleted — cancel it instead' })
  }
  await query(`UPDATE purchase_order SET deleted_at = NOW() WHERE id = $1`, [id])
  return res.json({ success: true })
}

// ── Flat listings for the Purchase Orders tabs ────────────────────────────────

export async function listPurchaseLines(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT pl.id, pl.po_id, pl.quantity_ordered, pl.quantity_received,
            pl.unit_cost, pl.line_total,
            po.po_number, po.status AS po_status, po.order_date,
            i.name AS item_name, i.sku, i.unit_of_measure,
            s.name AS supplier_name
     FROM purchase_line pl
     JOIN purchase_order po ON po.id = pl.po_id
     JOIN item i            ON i.id  = pl.item_id
     JOIN supplier s        ON s.id  = po.supplier_id
     WHERE po.branch_id = $1 AND pl.deleted_at IS NULL AND po.deleted_at IS NULL
     ORDER BY po.order_date DESC, po.po_number, i.name
     LIMIT 300`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function listGoodsReceipts(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT gr.id, gr.receipt_number, gr.received_at, gr.notes,
            po.po_number, po.id AS po_id,
            w.name AS warehouse_name,
            s.name AS supplier_name,
            u.full_name AS received_by_name,
            COALESCE(SUM(grl.quantity_received * grl.unit_cost), 0) AS total_value,
            COUNT(grl.id) AS line_count
     FROM goods_receipt gr
     JOIN purchase_order po ON po.id = gr.po_id
     JOIN warehouse w       ON w.id  = gr.warehouse_id
     JOIN supplier s        ON s.id  = po.supplier_id
     LEFT JOIN users u      ON u.id  = gr.received_by
     LEFT JOIN goods_receipt_line grl ON grl.receipt_id = gr.id AND grl.deleted_at IS NULL
     WHERE po.branch_id = $1 AND gr.deleted_at IS NULL
     GROUP BY gr.id, po.po_number, po.id, w.name, s.name, u.full_name
     ORDER BY gr.received_at DESC
     LIMIT 200`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function listGoodsReceiptLines(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT grl.id, grl.quantity_received, grl.unit_cost, grl.batch_number,
            grl.expiry_date, gr.receipt_number, gr.received_at,
            po.po_number,
            i.name AS item_name, i.sku, i.unit_of_measure
     FROM goods_receipt_line grl
     JOIN goods_receipt gr  ON gr.id = grl.receipt_id
     JOIN purchase_order po ON po.id = gr.po_id
     JOIN item i            ON i.id  = grl.item_id
     WHERE po.branch_id = $1 AND grl.deleted_at IS NULL AND gr.deleted_at IS NULL
     ORDER BY gr.received_at DESC, i.name
     LIMIT 300`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function receivePO(req: Request, res: Response) {
  const { id: poId } = req.params
  const { userId } = req.auth!
  const { receipt_lines, notes } = req.body

  if (!Array.isArray(receipt_lines) || receipt_lines.length === 0) {
    return res.status(400).json({ success: false, message: 'receipt_lines[] is required' })
  }

  const { rows: pos } = await query(
    `SELECT po.*, w.id AS warehouse_id FROM purchase_order po
     JOIN warehouse w ON w.id = po.warehouse_id
     WHERE po.id = $1 AND po.deleted_at IS NULL`,
    [poId]
  )
  if (!pos[0]) return res.status(404).json({ success: false, message: 'PO not found' })
  if (pos[0].status === 'cancelled') return res.status(409).json({ success: false, message: 'PO is cancelled' })

  const receiptNumber = 'GRN-' + Date.now().toString(36).toUpperCase()
  const warehouseId = pos[0].warehouse_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [receipt] } = await client.query(
      `INSERT INTO goods_receipt (po_id, warehouse_id, receipt_number, received_by, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [poId, warehouseId, receiptNumber, userId, notes ?? null]
    )

    for (const rl of receipt_lines) {
      const { po_line_id, item_id, quantity_received, unit_cost, batch_number, expiry_date } = rl
      if (!po_line_id || !item_id || !quantity_received) throw new Error('Each line needs po_line_id, item_id, quantity_received')

      await client.query(
        `INSERT INTO goods_receipt_line (receipt_id, po_line_id, item_id, quantity_received, unit_cost, batch_number, expiry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [receipt.id, po_line_id, item_id, quantity_received, unit_cost ?? 0, batch_number ?? null, expiry_date ?? null]
      )

      await client.query(
        `UPDATE purchase_line SET quantity_received = quantity_received + $1 WHERE id = $2`,
        [quantity_received, po_line_id]
      )

      // Update stock balance (weighted average cost)
      await client.query(
        `INSERT INTO stock_balance (warehouse_id, item_id, quantity_on_hand, average_cost)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
           average_cost = (stock_balance.quantity_on_hand * stock_balance.average_cost + $3 * $4)
                        / (stock_balance.quantity_on_hand + $3),
           quantity_on_hand = stock_balance.quantity_on_hand + $3,
           last_updated = NOW()`,
        [warehouseId, item_id, quantity_received, unit_cost ?? 0]
      )

      // Record movement
      await client.query(
        `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost, reference_type, reference_id, moved_by_staff)
         VALUES ($1,$2,'purchase',$3,$4,'goods_receipt',$5,$6)`,
        [warehouseId, item_id, quantity_received, unit_cost ?? 0, receipt.id, userId]
      )
    }

    // Update PO status
    const { rows: remaining } = await client.query(
      `SELECT COUNT(*) AS pending FROM purchase_line
       WHERE po_id = $1 AND quantity_received < quantity_ordered`,
      [poId]
    )
    const newStatus = Number(remaining[0].pending) === 0 ? 'received' : 'partial'
    await client.query(
      `UPDATE purchase_order SET status = $1, received_date = CURRENT_DATE WHERE id = $2`,
      [newStatus, poId]
    )

    await client.query('COMMIT')
    return res.json({ success: true, data: { receipt_id: receipt.id, po_status: newStatus } })
  } catch (err: any) {
    await client.query('ROLLBACK')
    return res.status(400).json({ success: false, message: err.message })
  } finally {
    client.release()
  }
}