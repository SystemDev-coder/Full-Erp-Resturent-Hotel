import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { randomBytes } from 'crypto'
import { logAudit } from '../../utils/audit'

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
           JOIN supplier s ON s.id = po.supplier_id WHERE po.id = $1 AND po.branch_id = $2 AND po.deleted_at IS NULL`, [req.params.id, req.auth!.branchId]),
    query(`SELECT pl.*, i.name AS item_name, i.unit_of_measure FROM purchase_line pl
           JOIN item i ON i.id = pl.item_id JOIN purchase_order po ON po.id = pl.po_id
           WHERE pl.po_id = $1 AND po.branch_id = $2 AND pl.deleted_at IS NULL`, [req.params.id, req.auth!.branchId]),
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

  const { orgId } = req.auth!
  const sup = await query(`SELECT 1 FROM supplier WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [supplier_id, orgId])
  if (!sup.rows[0]) return res.status(404).json({ success: false, message: 'Supplier not found' })
  const wh = await query(`SELECT 1 FROM warehouse WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [warehouse_id, branchId])
  if (!wh.rows[0]) return res.status(404).json({ success: false, message: 'Warehouse not found in this branch' })
  for (const l of lines) {
    const q = Number(l.quantity_ordered), c = Number(l.unit_cost)
    if (!l.item_id || !Number.isFinite(q) || q <= 0 || !Number.isFinite(c) || c < 0) {
      return res.status(400).json({ success: false, message: 'Each line needs an item, a quantity above 0 and a unit cost of 0 or more' })
    }
  }
  const items = await query(`SELECT id FROM item WHERE organization_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`, [orgId, lines.map((l: any) => l.item_id)])
  if (items.rows.length !== new Set(lines.map((l: any) => l.item_id)).size) {
    return res.status(404).json({ success: false, message: 'One of the items was not found' })
  }

  const poNumber = 'PO-' + Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase()

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
      if (!item_id || !quantity_ordered || unit_cost === undefined || unit_cost === null) throw new Error('Each line needs item_id, quantity_ordered, unit_cost')
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
    `SELECT status FROM purchase_order WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [id, req.auth!.branchId]
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
    `SELECT status FROM purchase_order WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [id, req.auth!.branchId]
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

// Receiving goods does three things in ONE transaction:
//   1. records the goods receipt (GRN) and moves the quantities onto the PO lines
//   2. adds the stock (weighted-average cost) and a stock movement per item
//   3. creates the supplier's BILL for what arrived — so purchasing reaches Accounts Payable
//      (before, receipts changed stock only and the money owed to suppliers was never recorded)
// Quantities cannot exceed what is still outstanding, and a line without a unit cost uses the
// price on the PO (it used to default to 0 and drag the average cost down).
export async function receivePO(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { receipt_lines, notes } = req.body

  if (!Array.isArray(receipt_lines) || receipt_lines.length === 0) {
    return fail(res, 400, 'receipt_lines[] is required')
  }

  try {
    const out = await withTx(async (c) => {
      const { rows: [po] } = await c.query(
        `SELECT id, status, supplier_id, warehouse_id, po_number FROM purchase_order
         WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`, [req.params.id, branchId])
      if (!po) throw new HttpError(404, 'PO not found')
      if (po.status === 'cancelled') throw new HttpError(409, 'PO is cancelled')
      if (po.status === 'received')  throw new HttpError(409, 'Everything on this PO has already been received')

      const receiptNumber = 'GRN-' + Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase()
      const { rows: [receipt] } = await c.query(
        `INSERT INTO goods_receipt (po_id, warehouse_id, receipt_number, received_by, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`, [po.id, po.warehouse_id, receiptNumber, userId, notes ?? null])

      let value = 0
      for (const rl of receipt_lines) {
        const qty = Number(rl.quantity_received)
        if (!rl.po_line_id || !Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'Each line needs a po_line_id and a quantity greater than 0')

        // the line must belong to THIS purchase order; the item comes from it, never from the client
        const { rows: [pl] } = await c.query(
          `SELECT id, item_id, quantity_ordered, quantity_received, unit_cost FROM purchase_line
           WHERE id = $1 AND po_id = $2 AND deleted_at IS NULL FOR UPDATE`, [rl.po_line_id, po.id])
        if (!pl) throw new HttpError(404, 'A receipt line does not belong to this purchase order')
        const remaining = Number(pl.quantity_ordered) - Number(pl.quantity_received)
        if (qty > remaining + 0.0005) throw new HttpError(409, `Cannot receive ${qty} — only ${remaining} is still outstanding on that line`)

        const cost = rl.unit_cost !== undefined && rl.unit_cost !== null && rl.unit_cost !== '' ? Number(rl.unit_cost) : Number(pl.unit_cost)
        if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'unit_cost cannot be negative')

        await c.query(
          `INSERT INTO goods_receipt_line (receipt_id, po_line_id, item_id, quantity_received, unit_cost, batch_number, expiry_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [receipt.id, pl.id, pl.item_id, qty, cost, rl.batch_number ?? null, rl.expiry_date ?? null])
        await c.query(`UPDATE purchase_line SET quantity_received = quantity_received + $1 WHERE id = $2`, [qty, pl.id])

        // weighted-average cost (guarded: an empty shelf takes the new cost as-is)
        await c.query(
          `INSERT INTO stock_balance (warehouse_id, item_id, quantity_on_hand, average_cost)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (warehouse_id, item_id) DO UPDATE SET
             average_cost = CASE WHEN stock_balance.quantity_on_hand + $3 > 0
                  THEN (GREATEST(stock_balance.quantity_on_hand, 0) * stock_balance.average_cost + $3 * $4)
                       / (GREATEST(stock_balance.quantity_on_hand, 0) + $3)
                  ELSE $4 END,
             quantity_on_hand = stock_balance.quantity_on_hand + $3,
             last_updated = NOW()`,
          [po.warehouse_id, pl.item_id, qty, cost])
        await c.query(
          `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost, reference_type, reference_id, moved_by_staff)
           VALUES ($1,$2,'purchase',$3,$4,'goods_receipt',$5,$6)`,
          [po.warehouse_id, pl.item_id, qty, cost, receipt.id, userId])
        value += qty * cost
      }

      const { rows: [rem] } = await c.query(
        `SELECT COUNT(*) AS pending FROM purchase_line WHERE po_id = $1 AND deleted_at IS NULL AND quantity_received < quantity_ordered`, [po.id])
      const newStatus = Number(rem.pending) === 0 ? 'received' : 'partial'
      await c.query(`UPDATE purchase_order SET status = $1, received_date = CURRENT_DATE, updated_at = NOW() WHERE id = $2`, [newStatus, po.id])

      // the supplier's bill for what actually arrived
      let apId: string | null = null
      value = round2(value)
      if (value > 0) {
        const { rows: [ap] } = await c.query(
          `INSERT INTO ap_invoice (branch_id, supplier_id, po_id, invoice_number, invoice_date, total_amount, notes, created_by)
           VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7) RETURNING id`,
          [branchId, po.supplier_id, po.id, receiptNumber, value, `Auto-created from goods receipt ${receiptNumber} (PO ${po.po_number})`, userId])
        apId = ap.id
      }
      return { receipt_id: receipt.id, receipt_number: receiptNumber, po_status: newStatus, ap_invoice_id: apId, ap_total: value }
    })
    logAudit({ userId, branchId, action: 'GOODS_RECEIVED', tableName: 'purchase_order', recordId: req.params.id, req, newValues: out })
    return res.json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}
