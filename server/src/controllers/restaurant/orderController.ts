import { Request, Response } from 'express'
import { PoolClient } from 'pg'
import { randomBytes } from 'crypto'
import { query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { ACTIVE_ORDER, releaseTable } from '../../utils/orderSettlement'
import { logAudit } from '../../utils/audit'
import { getPolicy, requireApproval, ApprovalInput } from '../../utils/approval'

// Approval details travel in the body as { approval: { staff_id, pin }, reason }
const approvalFrom = (req: Request): ApprovalInput => ({ ...(req.body?.approval ?? {}), reason: req.body?.reason ?? req.body?.approval?.reason })

// Kitchen workflow is strictly forward: open → preparing → ready → served
const RANK: Record<string, number> = { open: 0, preparing: 1, ready: 2, served: 3 }
const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery', 'room_service']
const LINE_STATUSES = ['pending', 'preparing', 'ready', 'served', 'cancelled']

// Branch-scoped, row-locked order lookup
async function lockOrder(c: PoolClient, id: string, branchId: string) {
  const { rows } = await c.query(
    `SELECT * FROM order_header WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [id, branchId]
  )
  if (!rows[0]) throw new HttpError(404, 'Order not found')
  return rows[0]
}

// Daily call number (#1, #2… per branch, restarting each day) — what the waiter calls out when the food is ready
async function nextCallNo(c: PoolClient, branchId: string): Promise<number> {
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['callno:' + branchId])
  const { rows: [r] } = await c.query(`SELECT COALESCE(MAX(call_no), 0) + 1 AS n FROM order_header WHERE branch_id = $1 AND opened_at::date = CURRENT_DATE`, [branchId])
  return Number(r.n)
}

// Keep the header's money in step with its live (non-cancelled) lines
async function recalcOrder(c: PoolClient, orderId: string) {
  await c.query(
    `UPDATE order_header o SET
       subtotal     = s.sub,
       total_amount = GREATEST(s.sub - o.discount_amount, 0) + o.service_charge + o.tax_amount,
       updated_at   = NOW()
     FROM (SELECT COALESCE(SUM(line_total), 0) AS sub FROM order_line
           WHERE order_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL) s
     WHERE o.id = $1`,
    [orderId]
  )
}

const staffInBranch = async (staffId: string, branchId: string) =>
  !!(await query(`SELECT 1 FROM staff WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [staffId, branchId])).rows[0]

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function listOrders(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { status, date } = req.query
  const { limit, offset } = getPagination(req, 100)
  let sql = `
    SELECT o.id, o.order_ref, o.call_no, o.order_type, o.status, o.total_amount, o.server_staff_id, o.updated_at,
           o.opened_at, o.closed_at, o.booking_id,
           t.table_number,
           s.first_name || ' ' || s.last_name AS waiter_name,
           (SELECT COUNT(*) FROM order_line ol
             WHERE ol.order_id = o.id AND ol.deleted_at IS NULL AND ol.status <> 'cancelled') AS item_count
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
  const { branchId } = req.auth!
  const [{ rows: orders }, { rows: lines }] = await Promise.all([
    query(`SELECT o.*, t.table_number FROM order_header o
           LEFT JOIN dining_table t ON t.id = o.dining_table_id
           WHERE o.id = $1 AND o.branch_id = $2 AND o.deleted_at IS NULL`, [req.params.id, branchId]),
    query(`SELECT ol.* FROM order_line ol
           JOIN order_header o ON o.id = ol.order_id
           WHERE ol.order_id = $1 AND o.branch_id = $2 AND ol.deleted_at IS NULL
           ORDER BY ol.created_at`, [req.params.id, branchId]),
  ])
  if (!orders[0]) return fail(res, 404, 'Order not found')
  // the bill (if one was made) — so the screen can show / reprint it
  const { rows: [invoice] } = await query(
    `SELECT id, invoice_number, status, total_amount, amount_paid, subtotal, discount_amount, tax_amount, vat_rate, service_charge FROM invoice
     WHERE order_id = $1 AND status <> 'voided' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [req.params.id])
  const { rows: [srv] } = await query(
    `SELECT first_name || ' ' || last_name AS name FROM staff WHERE id = $1`, [orders[0].server_staff_id ?? null])
  return res.json({ success: true, data: { ...orders[0], waiter_name: srv?.name ?? null, invoice: invoice ?? null, lines } })
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createOrder(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { dining_table_id, order_type = 'dine_in', booking_id, server_staff_id } = req.body
  const discount = Number(req.body.discount_amount ?? 0)

  if (!ORDER_TYPES.includes(order_type)) return fail(res, 400, `order_type must be one of: ${ORDER_TYPES.join(', ')}`)
  if (!Number.isFinite(discount) || discount < 0) return fail(res, 400, 'discount_amount cannot be negative')

  try {
    const out = await withTx(async (c) => {
      if (dining_table_id) {
        const { rows } = await c.query(
          `SELECT dt.status FROM dining_table dt
           JOIN table_area ta ON ta.id = dt.area_id JOIN restaurant r ON r.id = ta.restaurant_id
           WHERE dt.id = $1 AND r.branch_id = $2 AND dt.deleted_at IS NULL FOR UPDATE OF dt`,
          [dining_table_id, branchId]
        )
        if (!rows[0]) throw new HttpError(404, 'Table not found in this branch')
        if (rows[0].status === 'inactive') throw new HttpError(409, 'This table is inactive')
      }
      if (server_staff_id && !(await staffInBranch(server_staff_id, branchId))) {
        throw new HttpError(404, 'Waiter not found in this branch')
      }
      // An order charged to a room must point at a guest who is actually in-house
      if (booking_id) {
        const { rows: bk } = await c.query(
          `SELECT 1 FROM booking WHERE id = $1 AND branch_id = $2 AND status = 'checked_in' AND deleted_at IS NULL`,
          [booking_id, branchId]
        )
        if (!bk[0]) throw new HttpError(409, 'That booking is not checked in — room charge is only for in-house guests')
      }

      // A manager can pre-approve the discount while the order is being rung up; billing re-checks it
      let approvedBy: string | null = null
      if (discount > 0 && req.body.approval?.pin) {
        approvedBy = (await requireApproval(req, approvalFrom(req), { action: 'discount', label: 'Discount', detail: { discount } })).by
      }
      const ref = 'ORD-' + randomBytes(4).toString('hex').toUpperCase()
      const { rows } = await c.query(
        `INSERT INTO order_header (branch_id, dining_table_id, order_type, booking_id, order_ref, server_staff_id, discount_amount, discount_approved_by, created_by, call_no)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, order_ref, call_no`,
        [branchId, dining_table_id ?? null, order_type, booking_id ?? null, ref,
         server_staff_id ?? null, round2(discount), approvedBy, userId, await nextCallNo(c, branchId)]
      )
      // Seating a party takes the table out of the "available" pool straight away
      if (dining_table_id) {
        await c.query(
          `UPDATE dining_table SET status = 'occupied' WHERE id = $1 AND status IN ('available','reserved','cleaning')`,
          [dining_table_id]
        )
      }
      return rows[0]
    })
    return res.status(201).json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

// ── Offline sync ──────────────────────────────────────────────────────────────
// An order rung up while the internet was down (POS offline mode) arrives here in ONE call: header + lines
// (+ sent to the kitchen). `client_ref` is made by the POS, so a retry after a dropped connection can never
// create the order twice — the second call just returns the first result.
export async function syncOfflineOrder(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { client_ref, dining_table_id, booking_id, server_staff_id, send_to_kitchen = true } = req.body
  const order_type = req.body.order_type ?? (dining_table_id ? 'dine_in' : 'takeaway')
  const discount = Number(req.body.discount_amount ?? 0)
  const lines: { menu_item_id: string; quantity: number; special_request?: string }[] = Array.isArray(req.body.lines) ? req.body.lines : []

  if (!client_ref || !/^[\w-]{8,60}$/.test(String(client_ref))) return fail(res, 400, 'client_ref is required (8–60 letters/digits)')
  if (!ORDER_TYPES.includes(order_type)) return fail(res, 400, `order_type must be one of: ${ORDER_TYPES.join(', ')}`)
  if (!Number.isFinite(discount) || discount < 0) return fail(res, 400, 'discount_amount cannot be negative')
  if (lines.length === 0 || lines.length > 100) return fail(res, 400, 'an order needs between 1 and 100 lines')
  for (const l of lines) {
    if (!l.menu_item_id || !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1 || Number(l.quantity) > 99) return fail(res, 400, 'every line needs a menu_item_id and a quantity from 1 to 99')
  }
  // The moment the order was really taken (clamped: never in the future, never older than 3 days)
  let openedAt = new Date(req.body.created_at ?? Date.now())
  if (Number.isNaN(openedAt.getTime()) || openedAt.getTime() > Date.now()) openedAt = new Date()
  if (openedAt.getTime() < Date.now() - 3 * 864e5) openedAt = new Date(Date.now() - 3 * 864e5)

  try {
    const out = await withTx(async (c) => {
      const { rows: [dup] } = await c.query(
        `SELECT id, order_ref, status FROM order_header WHERE branch_id = $1 AND client_ref = $2 AND deleted_at IS NULL`, [branchId, client_ref])
      if (dup) return { id: dup.id, order_ref: dup.order_ref, status: dup.status, existing: true }

      if (dining_table_id) {
        const { rows } = await c.query(
          `SELECT dt.status FROM dining_table dt JOIN table_area ta ON ta.id = dt.area_id JOIN restaurant r ON r.id = ta.restaurant_id
           WHERE dt.id = $1 AND r.branch_id = $2 AND dt.deleted_at IS NULL FOR UPDATE OF dt`, [dining_table_id, branchId])
        if (!rows[0]) throw new HttpError(404, 'Table not found in this branch')
      }
      if (server_staff_id && !(await staffInBranch(server_staff_id, branchId))) throw new HttpError(404, 'Waiter not found in this branch')
      if (booking_id) {
        const { rows: bk } = await c.query(`SELECT 1 FROM booking WHERE id = $1 AND branch_id = $2 AND status = 'checked_in' AND deleted_at IS NULL`, [booking_id, branchId])
        if (!bk[0]) throw new HttpError(409, 'That booking is not checked in — room charge is only for in-house guests')
      }

      const ref = 'ORD-' + randomBytes(4).toString('hex').toUpperCase()
      const { rows: [o] } = await c.query(
        `INSERT INTO order_header (branch_id, dining_table_id, order_type, booking_id, order_ref, server_staff_id, discount_amount, client_ref, opened_at, created_by, call_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, order_ref, call_no`,
        [branchId, dining_table_id ?? null, order_type, booking_id ?? null, ref, server_staff_id ?? null, round2(discount), client_ref, openedAt.toISOString(), userId, await nextCallNo(c, branchId)])

      for (const l of lines) {
        // price from the menu, item must belong to THIS branch (same rule as the online path)
        const { rows: [mi] } = await c.query(
          `SELECT mi.name, mi.price FROM menu_item mi JOIN menu_category mc ON mc.id = mi.category_id JOIN restaurant r ON r.id = mc.restaurant_id
           WHERE mi.id = $1 AND r.branch_id = $2 AND mi.deleted_at IS NULL`, [l.menu_item_id, branchId])
        if (!mi) throw new HttpError(404, 'A dish on this order no longer exists on the menu')
        await c.query(
          `INSERT INTO order_line (order_id, menu_item_id, item_name_snap, quantity, unit_price, special_request) VALUES ($1,$2,$3,$4,$5,$6)`,
          [o.id, l.menu_item_id, mi.name, Number(l.quantity), mi.price, l.special_request ? String(l.special_request).slice(0, 300) : null])
      }
      await recalcOrder(c, o.id)
      if (dining_table_id) await c.query(`UPDATE dining_table SET status = 'occupied' WHERE id = $1 AND status IN ('available','reserved','cleaning')`, [dining_table_id])
      if (send_to_kitchen) {
        await c.query(`UPDATE order_header SET status = 'preparing', updated_at = NOW() WHERE id = $1`, [o.id])
        await c.query(`UPDATE order_line SET status = 'preparing', sent_to_kitchen = NOW() WHERE order_id = $1 AND status = 'pending'`, [o.id])
      }
      return { id: o.id, order_ref: o.order_ref, status: send_to_kitchen ? 'preparing' : 'open', existing: false }
    })
    if (!out.existing) logAudit({ userId, branchId, action: 'ORDER_OFFLINE_SYNC', tableName: 'order_header', recordId: out.id, req, newValues: { client_ref, lines: lines.length, orgId } })
    return res.status(out.existing ? 200 : 201).json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

// ── Lines ─────────────────────────────────────────────────────────────────────

export async function addOrderLine(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { menu_item_id, special_request } = req.body
  const quantity = Number(req.body.quantity ?? 1)

  if (!menu_item_id) return fail(res, 400, 'menu_item_id is required')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return fail(res, 400, 'quantity must be a whole number from 1 to 99')

  try {
    const line = await withTx(async (c) => {
      const order = await lockOrder(c, req.params.id, branchId)
      if (!ACTIVE_ORDER.includes(order.status)) {
        throw new HttpError(409, `Cannot add items — order is ${order.status}`)
      }

      // Price always comes from the menu — never from the client — and the item must belong to THIS branch
      const { rows: items } = await c.query(
        `SELECT mi.id, mi.name, mi.price FROM menu_item mi
         JOIN menu_category mc ON mc.id = mi.category_id JOIN restaurant r ON r.id = mc.restaurant_id
         WHERE mi.id = $1 AND r.branch_id = $2 AND mi.is_available = TRUE AND mi.deleted_at IS NULL`,
        [menu_item_id, branchId]
      )
      if (!items[0]) throw new HttpError(404, 'Menu item not found or unavailable')

      const { rows: [row] } = await c.query(
        `INSERT INTO order_line (order_id, menu_item_id, item_name_snap, quantity, unit_price, special_request)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, quantity, unit_price, line_total`,
        [order.id, menu_item_id, items[0].name, quantity, items[0].price, special_request ? String(special_request).slice(0, 300) : null]
      )
      await recalcOrder(c, order.id)
      return row
    })
    return res.status(201).json({ success: true, data: line })
  } catch (err) { return handleHttp(res, err) }
}

export async function updateLineStatus(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { status } = req.body
  if (!LINE_STATUSES.includes(status)) return fail(res, 400, `status must be one of: ${LINE_STATUSES.join(', ')}`)

  try {
    await withTx(async (c) => {
      const order = await lockOrder(c, req.params.id, branchId)
      if (!ACTIVE_ORDER.includes(order.status)) throw new HttpError(409, `Order is ${order.status} — its items can no longer change`)

      const { rows: [line] } = await c.query(
        `SELECT id, status FROM order_line WHERE id = $1 AND order_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.lineId, order.id]
      )
      if (!line) throw new HttpError(404, 'Order line not found')
      if (line.status === 'cancelled') throw new HttpError(409, 'This item was cancelled and cannot be changed')

      // Voiding food that already went to the kitchen needs a reason and a manager's approval
      let voidReason: string | null = null, voidBy: string | null = null
      if (status === 'cancelled' && line.status !== 'pending' && (await getPolicy(orgId)).require_for_void) {
        const ap = await requireApproval(req, approvalFrom(req), {
          action: 'void_item', label: 'Void an item already sent to the kitchen', needReason: true,
          recordId: order.id, detail: { order: order.order_ref, line: line.id },
        })
        voidReason = ap.reason; voidBy = ap.by
      }

      await c.query(
        `UPDATE order_line SET status = $1::varchar,
           served_at = CASE WHEN $1::varchar = 'served' THEN NOW() ELSE served_at END,
           ready_at  = CASE WHEN $1::varchar = 'ready' THEN NOW() ELSE ready_at END,
           void_reason = COALESCE($3, void_reason), void_approved_by = COALESCE($4, void_approved_by)
         WHERE id = $2`,
        [status, line.id, voidReason, voidBy]
      )
      // A cancelled item must come off the bill
      if (status === 'cancelled') await recalcOrder(c, order.id)
      // The kitchen finishing the last cooking item makes the whole order "ready" (keeps Orders page + KDS in step)
      if ((status === 'ready' || status === 'cancelled') && order.status === 'preparing') {
        const { rows: [left] } = await c.query(
          `SELECT COUNT(*) FILTER (WHERE status IN ('pending','preparing')) AS cooking,
                  COUNT(*) FILTER (WHERE status = 'ready') AS ready
           FROM order_line WHERE order_id = $1 AND deleted_at IS NULL`, [order.id])
        if (Number(left.cooking) === 0 && Number(left.ready) > 0) {
          await c.query(`UPDATE order_header SET status = 'ready', updated_at = NOW() WHERE id = $1`, [order.id])
        }
      }
    })
    logAudit({ userId, branchId, action: 'ORDER_LINE_STATUS', tableName: 'order_line', recordId: req.params.lineId, req, newValues: { status } })
    return res.json({ success: true })
  } catch (err) { return handleHttp(res, err) }
}

// ── Kitchen workflow ──────────────────────────────────────────────────────────

export async function updateOrderStatus(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { staff_id } = req.body
  // Accept 'sent_to_kitchen' as an alias — the DB status is 'preparing'
  const status = req.body.status === 'sent_to_kitchen' ? 'preparing' : req.body.status
  if (!(status in RANK)) return fail(res, 400, `status must be one of: ${Object.keys(RANK).join(', ')}`)

  try {
    const out = await withTx(async (c) => {
      const order = await lockOrder(c, req.params.id, branchId)
      if (!ACTIVE_ORDER.includes(order.status)) throw new HttpError(409, `Order is already ${order.status}`)
      // A second round (items added after the first were ready/served) is sent to the kitchen again:
      // the order goes back to "preparing" — but only when there really are unsent items.
      let refire = false
      if (status === 'preparing' && RANK[order.status] > RANK.preparing) {
        const { rows: [p] } = await c.query(
          `SELECT COUNT(*) AS n FROM order_line WHERE order_id = $1 AND status = 'pending' AND deleted_at IS NULL`, [order.id])
        refire = Number(p.n) > 0
      }
      if (!refire && RANK[status] < RANK[order.status]) {
        throw new HttpError(409, `Order cannot go back from ${order.status} to ${status}`)
      }
      if (staff_id && !(await staffInBranch(staff_id, branchId))) throw new HttpError(404, 'Waiter not found in this branch')

      const { rows: [cnt] } = await c.query(
        `SELECT COUNT(*) AS n FROM order_line WHERE order_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL`, [order.id]
      )
      if (status !== 'open' && Number(cnt.n) === 0) throw new HttpError(409, 'The order has no items')

      const { rows: [row] } = await c.query(
        `UPDATE order_header SET status = $1::varchar,
           server_staff_id = COALESCE($2::uuid, server_staff_id), updated_by = $3, updated_at = NOW()
         WHERE id = $4 RETURNING id, order_ref, status`,
        [status, staff_id ?? null, userId, order.id]
      )

      // Line statuses follow the order through the kitchen
      if (status === 'preparing') {
        await c.query(
          `UPDATE order_line SET status = 'preparing', sent_to_kitchen = NOW()
           WHERE order_id = $1 AND status = 'pending' AND deleted_at IS NULL`, [order.id])
      } else if (status === 'ready') {
        await c.query(
          `UPDATE order_line SET status = 'ready', sent_to_kitchen = COALESCE(sent_to_kitchen, NOW())
           WHERE order_id = $1 AND status IN ('pending','preparing') AND deleted_at IS NULL`, [order.id])
      } else if (status === 'served') {
        await c.query(
          `UPDATE order_line SET status = 'served', served_at = NOW(), sent_to_kitchen = COALESCE(sent_to_kitchen, NOW())
           WHERE order_id = $1 AND status IN ('pending','preparing','ready') AND deleted_at IS NULL`, [order.id])
      }
      return row
    })
    return res.json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

// ── Billing ───────────────────────────────────────────────────────────────────

// Generate a real UNPAID invoice from the order — payment is collected separately
// (POS, Finance → Receipts). Totals are recomputed here from the live lines, so a
// cancelled item can never be billed and the client cannot dictate the amount.
export async function billOrder(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { guest_id } = req.body ?? {}

  try {
    const invoice = await withTx(async (c) => {
      const order = await lockOrder(c, req.params.id, branchId)
      if (order.status === 'cancelled') throw new HttpError(409, 'Order is cancelled')
      if (order.status === 'billed' || order.status === 'paid') {
        const { rows: [inv] } = await c.query(
          `SELECT id, invoice_number FROM invoice WHERE order_id = $1 AND status <> 'voided' AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1`, [order.id])
        throw new HttpError(409, `Order is already ${order.status}${inv ? ` (invoice ${inv.invoice_number})` : ''}`, inv)
      }

      const { rows: lines } = await c.query(
        `SELECT id, item_name_snap, quantity, unit_price, line_total FROM order_line
         WHERE order_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL ORDER BY created_at`, [order.id])
      if (lines.length === 0) throw new HttpError(400, 'Order has no items to bill')

      // Guest: explicit pick (must belong to this org), else the in-house guest the order is charged to
      let guestId: string | null = null
      if (guest_id) {
        const { rows } = await c.query(`SELECT 1 FROM guest WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [guest_id, orgId])
        if (!rows[0]) throw new HttpError(404, 'Guest not found')
        guestId = guest_id
      } else if (order.booking_id) {
        const { rows } = await c.query(`SELECT primary_guest_id FROM booking WHERE id = $1`, [order.booking_id])
        guestId = rows[0]?.primary_guest_id ?? null
      }

      const { rows: [org] } = await c.query(`SELECT vat_rate FROM organization WHERE id = $1`, [orgId])
      const vatRate  = Number(org?.vat_rate ?? 0)
      const subtotal = round2(lines.reduce((s: number, l: any) => s + Number(l.line_total), 0))
      // The cashier may set/adjust the discount while billing (Tables screen); it can never exceed the subtotal
      const override = req.body?.discount_amount
      const wanted   = override !== undefined && Number.isFinite(Number(override)) && Number(override) >= 0
        ? Number(override) : Number(order.discount_amount)
      const discount = Math.min(round2(wanted), subtotal)
      // A big discount needs a manager (unless one already approved it when the order was rung up)
      let approvedBy: string | null = order.discount_approved_by ?? null
      const policy = await getPolicy(orgId)
      if (discount > 0 && subtotal > 0 && (discount / subtotal) * 100 > policy.discount_over_pct + 1e-9) {
        const preApproved = !!order.discount_approved_by && discount <= Number(order.discount_amount) + 0.005
        if (!preApproved) {
          const pct = Math.round((discount / subtotal) * 1000) / 10
          approvedBy = (await requireApproval(req, approvalFrom(req), {
            action: 'discount', label: `${pct}% discount (limit without approval: ${policy.discount_over_pct}%)`,
            recordId: order.id, detail: { order: order.order_ref, discount, subtotal, pct },
          })).by
        }
      }
      const taxable  = subtotal - discount
      const vatAmt   = round2(taxable * vatRate / 100)
      const service  = round2(Number(order.service_charge))
      const total    = round2(taxable + service + vatAmt)

      const invNo = 'INV-' + Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase()
      const { rows: [inv] } = await c.query(
        `INSERT INTO invoice (branch_id, guest_id, order_id, invoice_number, invoice_date,
                              subtotal, discount_amount, tax_amount, vat_rate, service_charge,
                              total_amount, status, created_by)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,'issued',$11)
         RETURNING id, invoice_number, total_amount`,
        [branchId, guestId, order.id, invNo, subtotal, discount, vatAmt, vatRate, service, total, userId]
      )
      for (const l of lines) {
        await c.query(
          `INSERT INTO invoice_line (invoice_id, description, quantity, unit_price, reference_type, reference_id)
           VALUES ($1,$2,$3,$4,'order_line',$5)`,
          [inv.id, l.item_name_snap, l.quantity, l.unit_price, l.id]
        )
      }
      await c.query(
        `UPDATE order_header SET status = 'billed', tax_amount = $2, vat_rate = $3, discount_amount = $4,
                discount_approved_by = $6, updated_by = $5, updated_at = NOW() WHERE id = $1`,
        [order.id, vatAmt, vatRate, discount, userId, discount > 0 ? approvedBy : null]
      )
      await recalcOrder(c, order.id)
      return inv
    })
    logAudit({ userId, branchId, action: 'ORDER_BILLED', tableName: 'order_header', recordId: req.params.id, req,
      newValues: { invoice: invoice.invoice_number, total: invoice.total_amount } })
    return res.status(201).json({ success: true, data: invoice })
  } catch (err) { return handleHttp(res, err) }
}

// "Close" now means: the bill has been fully paid → order is finished. (Taking the
// payment itself — which also closes the order — happens through the invoice.)
export async function closeOrder(req: Request, res: Response) {
  const { branchId } = req.auth!
  try {
    await withTx(async (c) => {
      const order = await lockOrder(c, req.params.id, branchId)
      if (order.status === 'paid') return
      if (order.status !== 'billed') throw new HttpError(409, 'Bill the order and collect payment before closing it')
      const { rows: [inv] } = await c.query(
        `SELECT status FROM invoice WHERE order_id = $1 AND status <> 'voided' AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`, [order.id])
      if (inv?.status !== 'paid') throw new HttpError(409, 'The invoice is not fully paid yet')
      await c.query(`UPDATE order_header SET status = 'paid', closed_at = NOW(), updated_at = NOW() WHERE id = $1`, [order.id])
      await releaseTable(c, order.dining_table_id, order.id)
    })
    return res.json({ success: true })
  } catch (err) { return handleHttp(res, err) }
}

export async function cancelOrder(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  let reason = req.body?.reason ? String(req.body.reason).slice(0, 300) : null
  let approvedBy: string | null = null
  try {
    await withTx(async (c) => {
      const order = await lockOrder(c, req.params.id, branchId)
      if (order.status === 'cancelled') throw new HttpError(409, 'Order is already cancelled')
      if (order.status === 'paid') throw new HttpError(409, 'A paid order cannot be cancelled')

      // Throwing away an order that already has items on it needs a reason and a manager's approval
      const { rows: [live] } = await c.query(
        `SELECT COUNT(*) AS n FROM order_line WHERE order_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL`, [order.id])
      if (Number(live.n) > 0 && (await getPolicy(orgId)).require_for_void) {
        const ap = await requireApproval(req, approvalFrom(req), {
          action: 'cancel_order', label: `Cancel order ${order.order_ref}`, needReason: true,
          recordId: order.id, detail: { order: order.order_ref, items: Number(live.n), total: Number(order.total_amount) },
        })
        reason = ap.reason; approvedBy = ap.by
      }

      // An issued-but-unpaid invoice dies with the order; one with money on it needs a refund first
      const { rows: invs } = await c.query(
        `SELECT id, amount_paid FROM invoice WHERE order_id = $1 AND status <> 'voided' AND deleted_at IS NULL FOR UPDATE`, [order.id])
      if (invs.some((i: any) => Number(i.amount_paid) > 0)) {
        throw new HttpError(409, 'This order already has a payment — it cannot be cancelled')
      }
      for (const i of invs) {
        await c.query(`UPDATE invoice SET status = 'voided', voided_at = NOW(), voided_reason = 'Order cancelled', updated_at = NOW() WHERE id = $1`, [i.id])
      }
      await c.query(
        `UPDATE order_header SET status = 'cancelled', closed_at = NOW(), updated_by = $2, updated_at = NOW(),
                notes = CASE WHEN $3::text IS NULL THEN notes ELSE COALESCE(notes || E'\n', '') || 'Cancelled: ' || $3::text || COALESCE(' (approved by ' || $4::text || ')', '') END
         WHERE id = $1`,
        [order.id, userId, reason, approvedBy]
      )
      await releaseTable(c, order.dining_table_id, order.id)
    })
    logAudit({ userId, branchId, action: 'ORDER_CANCELLED', tableName: 'order_header', recordId: req.params.id, req, newValues: { reason } })
    return res.json({ success: true })
  } catch (err) { return handleHttp(res, err) }
}
