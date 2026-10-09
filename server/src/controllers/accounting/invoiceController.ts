import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { query } from '../../db/pool'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { settleOrder } from '../../utils/orderSettlement'
import { logAudit } from '../../utils/audit'

const PAYMENT_METHODS = ['cash', 'card', 'mobile', 'room_charge', 'bank_transfer', 'complimentary']
// Methods that do not move money into an account
const NO_ACCOUNT = ['room_charge', 'complimentary']

const invoiceNumber = () => 'INV-' + Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase()

export async function listInvoices(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, invoice_number, invoice_date, total_amount, amount_paid,
            amount_due, status, guest_id
     FROM invoice WHERE branch_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 100`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function getInvoice(req: Request, res: Response) {
  const { branchId } = req.auth!
  const [{ rows: invs }, { rows: lines }] = await Promise.all([
    // Pull guest / order / table context so the printed bill can show
    // Order No, Table No and the guest name like a real restaurant receipt
    query(
      `SELECT i.*,
              g.first_name || ' ' || g.last_name AS guest_name,
              o.order_ref, o.order_type,
              t.table_number
       FROM invoice i
       LEFT JOIN guest g        ON g.id = i.guest_id
       LEFT JOIN order_header o ON o.id = i.order_id
       LEFT JOIN dining_table t ON t.id = o.dining_table_id
       WHERE i.id = $1 AND i.branch_id = $2 AND i.deleted_at IS NULL`,
      [req.params.id, branchId]
    ),
    query(
      `SELECT il.* FROM invoice_line il JOIN invoice i ON i.id = il.invoice_id
       WHERE il.invoice_id = $1 AND i.branch_id = $2 AND il.deleted_at IS NULL ORDER BY il.created_at`,
      [req.params.id, branchId]
    ),
  ])
  if (!invs[0]) return fail(res, 404, 'Invoice not found')
  return res.json({ success: true, data: { ...invs[0], lines } })
}

export async function createInvoice(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { guest_id, booking_id, order_id, lines, due_date, notes } = req.body
  const vatPct = Math.min(100, Math.max(0, Number(req.body.vat_rate ?? 0) || 0))
  const svcPct = Math.min(100, Math.max(0, Number(req.body.service_charge_pct ?? 0) || 0))
  const disc   = Number(req.body.discount_amount ?? 0)

  if (!Array.isArray(lines) || lines.length === 0) return fail(res, 400, 'lines[] is required')
  let subtotal = 0
  for (const l of lines) {
    const qty = Number(l.quantity ?? 1), price = Number(l.unit_price)
    if (!l.description || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      return fail(res, 400, 'Each line needs a description, a positive quantity and a non-negative unit_price')
    }
    subtotal += qty * price
  }
  subtotal = round2(subtotal)
  if (!Number.isFinite(disc) || disc < 0 || disc > subtotal) return fail(res, 400, 'discount_amount must be between 0 and the subtotal')

  const taxable = round2(subtotal - disc)
  const vatAmt  = round2(taxable * vatPct / 100)
  const svcAmt  = round2(taxable * svcPct / 100)
  const total   = round2(taxable + vatAmt + svcAmt)

  try {
    const inv = await withTx(async (c) => {
      // Everything the invoice points at must belong to this org/branch
      if (guest_id && !(await c.query(`SELECT 1 FROM guest WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [guest_id, orgId])).rows[0]) {
        throw new HttpError(404, 'Guest not found')
      }
      if (booking_id && !(await c.query(`SELECT 1 FROM booking WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [booking_id, branchId])).rows[0]) {
        throw new HttpError(404, 'Booking not found')
      }
      if (order_id && !(await c.query(`SELECT 1 FROM order_header WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [order_id, branchId])).rows[0]) {
        throw new HttpError(404, 'Order not found')
      }

      const { rows: [row] } = await c.query(
        `INSERT INTO invoice
           (branch_id, guest_id, booking_id, order_id, invoice_number,
            subtotal, discount_amount, tax_amount, vat_rate, service_charge,
            total_amount, status, due_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'issued',$12,$13,$14)
         RETURNING id, invoice_number, total_amount`,
        [branchId, guest_id ?? null, booking_id ?? null, order_id ?? null, invoiceNumber(),
         subtotal, disc, vatAmt, vatPct, svcAmt, total, due_date ?? null, notes ?? null, userId]
      )
      for (const l of lines) {
        await c.query(
          `INSERT INTO invoice_line (invoice_id, description, quantity, unit_price, reference_type, reference_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [row.id, String(l.description).slice(0, 300), l.quantity ?? 1, l.unit_price,
           l.reference_type ?? null, l.reference_id ?? null]
        )
      }
      return row
    })
    return res.status(201).json({ success: true, data: inv })
  } catch (err) { return handleHttp(res, err) }
}

// Void an invoice that has had no money applied. A reason is mandatory, and the
// order it came from goes back to "served" so it can be corrected and re-billed.
export async function voidInvoice(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
  if (!reason) return fail(res, 400, 'A reason is required to void an invoice')

  try {
    await withTx(async (c) => {
      const { rows: [inv] } = await c.query(
        `SELECT id, status, amount_paid, order_id FROM invoice
         WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.id, branchId]
      )
      if (!inv) throw new HttpError(404, 'Invoice not found')
      if (inv.status === 'voided') throw new HttpError(409, 'Invoice is already voided')
      if (Number(inv.amount_paid) > 0) throw new HttpError(409, 'This invoice has payments on it — it cannot be voided')

      await c.query(
        `UPDATE invoice SET status = 'voided', voided_at = NOW(), voided_reason = $2, updated_at = NOW() WHERE id = $1`,
        [inv.id, reason]
      )
      if (inv.order_id) {
        await c.query(`UPDATE order_header SET status = 'served', updated_at = NOW() WHERE id = $1 AND status = 'billed'`, [inv.order_id])
      }
    })
    logAudit({ userId, branchId, action: 'INVOICE_VOIDED', tableName: 'invoice', recordId: req.params.id, req, newValues: { reason } })
    return res.json({ success: true })
  } catch (err) { return handleHttp(res, err) }
}

export async function recordPayment(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { payment_method, account_id } = req.body
  const amount = round2(Number(req.body.amount))
  const collectorId: string | null = req.body.staff_id ? String(req.body.staff_id) : null   // POS: who is holding the till

  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'amount must be a positive number')
  if (!PAYMENT_METHODS.includes(payment_method)) return fail(res, 400, `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}`)
  // Room charge / complimentary defer or waive the amount, so they are the only methods without an account
  if (!NO_ACCOUNT.includes(payment_method) && !account_id) {
    return fail(res, 400, 'account_id is required for this payment method')
  }

  try {
    const result = await withTx(async (c) => {
      // Row lock: two cashiers paying the same invoice at once can no longer both succeed
      const { rows: [inv] } = await c.query(
        `SELECT invoice_number, total_amount, amount_paid, status, order_id FROM invoice
         WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, branchId]
      )
      if (!inv) throw new HttpError(404, 'Invoice not found')
      if (inv.status === 'voided') throw new HttpError(409, 'Invoice is voided')
      if (inv.status === 'paid')   throw new HttpError(409, 'Invoice already paid')

      const due = round2(Number(inv.total_amount) - Number(inv.amount_paid))
      if (amount > due + 0.005) throw new HttpError(409, `Amount exceeds the balance due (${due.toFixed(2)})`)

      if (payment_method === 'room_charge') {
        const { rows: link } = await c.query(
          `SELECT o.booking_id, b.status AS booking_status
           FROM order_header o LEFT JOIN booking b ON b.id = o.booking_id WHERE o.id = $1`, [inv.order_id]
        )
        if (!link[0]?.booking_id) throw new HttpError(400, 'Room charge needs an order linked to a checked-in guest')
        if (link[0].booking_status !== 'checked_in') throw new HttpError(409, 'That guest is no longer checked in')
      }
      if (account_id) {
        const { rows: acc } = await c.query(
          `SELECT 1 FROM account WHERE id = $1 AND organization_id = $2
             AND (branch_id = $3 OR branch_id IS NULL) AND is_active = TRUE AND deleted_at IS NULL`,
          [account_id, orgId, branchId]
        )
        if (!acc[0]) throw new HttpError(404, 'Account not found')
      }

      const newPaid   = round2(Number(inv.amount_paid) + amount)
      const newStatus = newPaid >= Number(inv.total_amount) - 0.005 ? 'paid' : 'partially_paid'

      const { rows: [row] } = await c.query(
        `UPDATE invoice SET amount_paid = $1, status = $2, payment_method = $3, updated_at = NOW()
         WHERE id = $4 RETURNING id, invoice_number, amount_paid, total_amount, status`,
        [newPaid, newStatus, payment_method, id]
      )

      // Money in → the chosen account's ledger (skipped for room charge / complimentary)
      if (account_id) {
        await c.query(
          `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
           VALUES ($1,$2,$3,'in','payment_received','invoice',$4,$5,$6,CURRENT_DATE,$7)`,
          [orgId, branchId, account_id, id, `Payment: ${inv.invoice_number}`, amount, userId]
        )
      }

      // Restaurant sale: remember WHO collected it (the PIN-signed-in waiter/cashier; else the order's waiter)
      if (inv.order_id) {
        const { rows: [ord] } = await c.query(`SELECT server_staff_id FROM order_header WHERE id = $1`, [inv.order_id])
        let collector: string | null = null
        if (collectorId) {
          const { rows: ok } = await c.query(`SELECT 1 FROM staff WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [collectorId, branchId])
          if (!ok[0]) throw new HttpError(404, 'Staff member not found in this branch')
          collector = collectorId
        }
        await c.query(
          `INSERT INTO payment_collection (branch_id, invoice_id, order_id, staff_id, waiter_id, method, amount) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [branchId, id, inv.order_id, collector ?? ord?.server_staff_id ?? null, ord?.server_staff_id ?? null, payment_method, amount])
      }

      // A fully-paid restaurant invoice finishes its order: status, table, stock
      if (newStatus === 'paid' && inv.order_id) await settleOrder(c, inv.order_id, branchId, userId)
      return row
    })
    logAudit({ userId, branchId, action: 'INVOICE_PAYMENT', tableName: 'invoice', recordId: id, req,
      newValues: { amount, payment_method, account_id } })
    return res.json({ success: true, data: result })
  } catch (err) { return handleHttp(res, err) }
}
