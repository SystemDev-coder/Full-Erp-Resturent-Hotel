import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { randomBytes } from 'crypto'
import { getPagination, sliceHasMore } from '../../utils/pagination'

export async function listOrders(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { status, date } = req.query
  const { limit, offset } = getPagination(req, 100)
  let sql = `
    SELECT o.id, o.order_ref, o.order_type, o.status, o.total_amount,
           o.opened_at, o.closed_at,
           t.table_number,
           s.first_name || ' ' || s.last_name AS waiter_name,
           (SELECT COUNT(*) FROM order_line ol
             WHERE ol.order_id = o.id AND ol.deleted_at IS NULL) AS item_count
    FROM order_header o
    LEFT JOIN dining_table t ON t.id = o.dining_table_id
    LEFT JOIN staff s        ON s.id = o.server_staff_id
    WHERE o.branch_id = $1 AND o.deleted_at IS NULL`
  const params: any[] = [branchId]
  if (status) { params.push(status); sql += ` AND o.status = $${params.length}` }
  if (date)   { params.push(date);   sql += ` AND DATE(o.opened_at) = $${params.length}` }
  params.push(limit + 1, offset)
  sql += ` ORDER BY o.opened_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await query(sql, params)
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function getOrder(req: Request, res: Response) {
  const [{ rows: orders }, { rows: lines }] = await Promise.all([
    query(`SELECT o.*, t.table_number FROM order_header o
           LEFT JOIN dining_table t ON t.id = o.dining_table_id
           WHERE o.id = $1 AND o.deleted_at IS NULL`, [req.params.id]),
    query(`SELECT * FROM order_line WHERE order_id = $1 AND deleted_at IS NULL`, [req.params.id]),
  ])
  if (!orders[0]) return res.status(404).json({ success: false, message: 'Order not found' })
  return res.json({ success: true, data: { ...orders[0], lines } })
}

export async function createOrder(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { dining_table_id, order_type = 'dine_in', booking_id, server_staff_id, discount_amount = 0 } = req.body
  const ref = 'ORD-' + randomBytes(4).toString('hex').toUpperCase()
  const { rows } = await query(
    `INSERT INTO order_header (branch_id, dining_table_id, order_type, booking_id, order_ref, server_staff_id, discount_amount, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, order_ref`,
    [branchId, dining_table_id ?? null, order_type, booking_id ?? null, ref,
     server_staff_id ?? null, Number(discount_amount) || 0, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

// Kitchen workflow transitions: open → preparing (kitchen) → ready → served
export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const { staff_id } = req.body
    // Accept 'sent_to_kitchen' as an alias — the DB status is 'preparing'
    const status = req.body.status === 'sent_to_kitchen' ? 'preparing' : req.body.status
    const ALLOWED = ['open', 'preparing', 'ready', 'served']
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${ALLOWED.join(', ')}` })
    }

    const { rows } = await query(
      `UPDATE order_header SET
         status          = $1::varchar,
         server_staff_id = COALESCE($2::uuid, server_staff_id),
         updated_by      = $3,
         updated_at      = NOW()
       WHERE id = $4 AND deleted_at IS NULL AND status NOT IN ('paid','cancelled')
       RETURNING id, order_ref, status`,
      [status, staff_id ?? null, req.auth!.userId, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found or already finished' })

    // Sending to kitchen stamps every pending line
    if (status === 'preparing') {
      await query(
        `UPDATE order_line SET status = 'preparing', sent_to_kitchen = NOW()
         WHERE order_id = $1 AND status = 'pending' AND deleted_at IS NULL`,
        [req.params.id]
      )
    }
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('updateOrderStatus error:', err)
    return res.status(500).json({ success: false, message: 'Failed to update order status' })
  }
}

// Billing: generate a real UNPAID invoice from the order — payment comes later
// (cash now via POS, or EVC Plus/Sahal integration in the future).
export async function billOrder(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { guest_id } = req.body ?? {}

  const [{ rows: orders }, { rows: lines }] = await Promise.all([
    query(`SELECT * FROM order_header WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]),
    query(`SELECT * FROM order_line WHERE order_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL`, [req.params.id]),
  ])
  const order = orders[0]
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
  if (['paid', 'cancelled'].includes(order.status)) {
    return res.status(409).json({ success: false, message: `Order is already ${order.status}` })
  }
  if (lines.length === 0) {
    return res.status(400).json({ success: false, message: 'Order has no items to bill' })
  }

  // VAT comes from the organization's configured rate (Systems → Company Info)
  // and is applied here at billing time — the order itself stores net amounts.
  const { rows: orgRows } = await query(
    `SELECT o.vat_rate FROM organization o
     JOIN branch b ON b.organization_id = o.id WHERE b.id = $1`,
    [branchId]
  )
  const vatRate = Number(orgRows[0]?.vat_rate ?? 0)
  const taxable = Number(order.subtotal) - Number(order.discount_amount)
  const vatAmt  = Math.round(taxable * (vatRate / 100) * 100) / 100
  const grandTotal = taxable + Number(order.service_charge) + vatAmt

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const invNo = 'INV-' + Date.now().toString(36).toUpperCase()
    const { rows: [invoice] } = await client.query(
      `INSERT INTO invoice (branch_id, guest_id, order_id, invoice_number, invoice_date,
                            subtotal, discount_amount, tax_amount, vat_rate, service_charge,
                            total_amount, status, created_by)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,'issued',$11)
       RETURNING id, invoice_number, total_amount`,
      [branchId, guest_id ?? null, order.id, invNo,
       order.subtotal, order.discount_amount, vatAmt, vatRate, order.service_charge,
       grandTotal, userId]
    )

    for (const l of lines) {
      await client.query(
        `INSERT INTO invoice_line (invoice_id, description, quantity, unit_price, reference_type, reference_id)
         VALUES ($1,$2,$3,$4,'order_line',$5)`,
        [invoice.id, l.item_name_snap, l.quantity, l.unit_price, l.id]
      )
    }

    await client.query(
      `UPDATE order_header SET status = 'billed', updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, order.id]
    )

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: invoice })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function addOrderLine(req: Request, res: Response) {
  const { id: orderId } = req.params
  const { menu_item_id, quantity = 1, special_request } = req.body

  if (!menu_item_id) {
    return res.status(400).json({ success: false, message: 'menu_item_id is required' })
  }

  const { rows: items } = await query(
    `SELECT id, name, price FROM menu_item WHERE id = $1 AND is_available = TRUE AND deleted_at IS NULL`,
    [menu_item_id]
  )
  if (!items[0]) return res.status(404).json({ success: false, message: 'Menu item not found or unavailable' })

  const { name, price } = items[0]
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [line] } = await client.query(
      `INSERT INTO order_line (order_id, menu_item_id, item_name_snap, quantity, unit_price, special_request)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, quantity, unit_price, line_total`,
      [orderId, menu_item_id, name, quantity, price, special_request ?? null]
    )
    await client.query(
      `UPDATE order_header
       SET subtotal    = subtotal + $1,
           total_amount = total_amount + $1,
           updated_at  = NOW()
       WHERE id = $2`,
      [Number(price) * Number(quantity), orderId]
    )
    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: line })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateLineStatus(req: Request, res: Response) {
  const { status } = req.body
  await query(`UPDATE order_line SET status = $1 WHERE id = $2`, [status, req.params.lineId])
  return res.json({ success: true })
}

export async function closeOrder(req: Request, res: Response) {
  await query(
    `UPDATE order_header SET status = 'billed', closed_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  return res.json({ success: true })
}

export async function cancelOrder(req: Request, res: Response) {
  await query(
    `UPDATE order_header SET status = 'cancelled', closed_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  return res.json({ success: true })
}