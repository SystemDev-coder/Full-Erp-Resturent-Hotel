import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { logAudit } from '../../utils/audit'
import { notifyBookingPayment } from '../../utils/notifyHooks'

const METHODS = ['cash', 'card', 'mobile', 'bank_transfer']

// Money received from a guest against their stay (deposit, part-payment or the
// final settlement). Each payment is stored as its own PAID invoice linked to the
// booking — so it appears on the guest statement ("Total Paid"), in Finance →
// Receipts, in the dashboard's "Collected today" (attributed to Hotel) and in the
// account's ledger, exactly like every other payment in the system.
export async function recordBookingPayment(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { payment_method, account_id } = req.body
  const amount = round2(Number(req.body.amount))
  const notes = req.body.notes ? String(req.body.notes).slice(0, 300) : null

  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'amount must be a positive number')
  if (!METHODS.includes(payment_method)) return fail(res, 400, `payment_method must be one of: ${METHODS.join(', ')}`)
  if (!account_id) return fail(res, 400, 'account_id is required')

  try {
    const out = await withTx(async (c) => {
      const { rows: [b] } = await c.query(
        `SELECT id, booking_ref, status, primary_guest_id, total_amount FROM booking
         WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, branchId]
      )
      if (!b) throw new HttpError(404, 'Booking not found')
      if (['cancelled', 'no_show'].includes(b.status)) throw new HttpError(409, `A ${b.status.replace('_', ' ')} booking cannot take payments`)

      const { rows: [f] } = await c.query(
        `SELECT
           COALESCE((SELECT SUM(line_total) FROM booking_service WHERE booking_id = $1 AND deleted_at IS NULL), 0) AS extras,
           COALESCE((SELECT SUM(amount_paid) FROM invoice WHERE booking_id = $1 AND status <> 'voided' AND deleted_at IS NULL), 0) AS paid`,
        [id]
      )
      const due = round2(Number(b.total_amount) + Number(f.extras) - Number(f.paid))
      if (due <= 0) throw new HttpError(409, 'This stay is already fully paid')
      if (amount > due + 0.005) throw new HttpError(409, `Amount exceeds the balance due (${due.toFixed(2)})`)

      const { rows: acc } = await c.query(
        `SELECT 1 FROM account WHERE id = $1 AND organization_id = $2
           AND (branch_id = $3 OR branch_id IS NULL) AND is_active = TRUE AND deleted_at IS NULL`,
        [account_id, orgId, branchId]
      )
      if (!acc[0]) throw new HttpError(404, 'Account not found')

      const invNo = 'PAY-' + Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase()
      const { rows: [inv] } = await c.query(
        `INSERT INTO invoice (branch_id, guest_id, booking_id, invoice_number, invoice_date,
                              subtotal, total_amount, amount_paid, status, payment_method, notes, created_by)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$5,$5,'paid',$6,$7,$8)
         RETURNING id, invoice_number`,
        [branchId, b.primary_guest_id, b.id, invNo, amount, payment_method, notes ?? `Stay payment — ${b.booking_ref}`, userId]
      )
      await c.query(
        `INSERT INTO invoice_line (invoice_id, description, quantity, unit_price, reference_type, reference_id)
         VALUES ($1,$2,1,$3,'booking',$4)`,
        [inv.id, `Payment received — booking ${b.booking_ref}`, amount, b.id]
      )
      await c.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'in','payment_received','invoice',$4,$5,$6,CURRENT_DATE,$7)`,
        [orgId, branchId, account_id, inv.id, `Stay payment: ${b.booking_ref}`, amount, userId]
      )
      return { invoice_id: inv.id, receipt_number: inv.invoice_number, amount, balance_due: round2(due - amount), booking_ref: b.booking_ref }
    })
    logAudit({ userId, branchId, action: 'BOOKING_PAYMENT', tableName: 'booking', recordId: id, req,
      newValues: { amount, payment_method, receipt: out.receipt_number } })
    notifyBookingPayment(id, amount, out.balance_due)
    return res.status(201).json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}
