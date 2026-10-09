import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { logAudit } from '../../utils/audit'

// Supplier bills (accounts payable). Goods received against a purchase order create their
// bill automatically (see purchaseController.receivePO); this controller lists, adds
// manual bills, takes payments and voids.

export async function listAPInvoices(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { status, supplier_id } = req.query
  let sql = `
    SELECT ap.id, ap.invoice_number, ap.invoice_date, ap.due_date,
           ap.total_amount, ap.amount_paid, ap.status,
           s.name AS supplier_name
    FROM ap_invoice ap JOIN supplier s ON s.id = ap.supplier_id
    WHERE ap.branch_id = $1 AND ap.deleted_at IS NULL`
  const params: any[] = [branchId]
  if (status)      { params.push(status);      sql += ` AND ap.status = $${params.length}` }
  if (supplier_id) { params.push(supplier_id); sql += ` AND ap.supplier_id = $${params.length}` }
  sql += ` ORDER BY ap.invoice_date DESC LIMIT 100`
  const { rows } = await query(sql, params)
  return res.json({ success: true, data: rows })
}

export async function getAPInvoice(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT ap.*, s.name AS supplier_name, po.po_number
     FROM ap_invoice ap
     JOIN supplier s ON s.id = ap.supplier_id
     LEFT JOIN purchase_order po ON po.id = ap.po_id
     WHERE ap.id = $1 AND ap.branch_id = $2 AND ap.deleted_at IS NULL`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return fail(res, 404, 'AP Invoice not found')
  return res.json({ success: true, data: rows[0] })
}

export async function createAPInvoice(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { supplier_id, po_id, invoice_number, invoice_date, due_date, notes } = req.body
  const total = round2(Number(req.body.total_amount))
  if (!supplier_id || !invoice_number || !invoice_date || !Number.isFinite(total)) {
    return fail(res, 400, 'supplier_id, invoice_number, invoice_date, total_amount are required')
  }
  if (total <= 0) return fail(res, 400, 'total_amount must be greater than 0')

  const sup = await query(`SELECT 1 FROM supplier WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [supplier_id, orgId])
  if (!sup.rows[0]) return fail(res, 404, 'Supplier not found')
  if (po_id) {
    const po = await query(`SELECT 1 FROM purchase_order WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [po_id, branchId])
    if (!po.rows[0]) return fail(res, 404, 'Purchase order not found')
  }
  const { rows } = await query(
    `INSERT INTO ap_invoice (branch_id, supplier_id, po_id, invoice_number, invoice_date, due_date, total_amount, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, invoice_number, total_amount`,
    [branchId, supplier_id, po_id ?? null, String(invoice_number).slice(0, 60), invoice_date,
     due_date ?? null, total, notes ?? null, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function payAPInvoice(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { account_id, payment_date } = req.body
  const amount = round2(Number(req.body.amount))
  if (!account_id) return fail(res, 400, 'amount and account_id are required')
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'amount must be a positive number')

  try {
    const out = await withTx(async (c) => {
      const { rows: [inv] } = await c.query(
        `SELECT ap.invoice_number, ap.total_amount, ap.amount_paid, ap.status, s.name AS supplier_name
         FROM ap_invoice ap JOIN supplier s ON s.id = ap.supplier_id
         WHERE ap.id = $1 AND ap.branch_id = $2 AND ap.deleted_at IS NULL FOR UPDATE OF ap`,
        [id, branchId]
      )
      if (!inv) throw new HttpError(404, 'AP Invoice not found')
      if (inv.status === 'voided') throw new HttpError(409, 'This bill is voided')
      if (inv.status === 'paid')   throw new HttpError(409, 'Already paid')

      const due = round2(Number(inv.total_amount) - Number(inv.amount_paid))
      if (amount > due + 0.005) throw new HttpError(409, `Amount exceeds the balance due (${due.toFixed(2)})`)

      const { rows: acc } = await c.query(
        `SELECT 1 FROM account WHERE id = $1 AND organization_id = $2 AND (branch_id = $3 OR branch_id IS NULL)
           AND is_active = TRUE AND deleted_at IS NULL`, [account_id, orgId, branchId])
      if (!acc[0]) throw new HttpError(404, 'Account not found')

      const newPaid   = round2(Number(inv.amount_paid) + amount)
      const newStatus = newPaid >= Number(inv.total_amount) - 0.005 ? 'paid' : 'partially_paid'
      const { rows } = await c.query(
        `UPDATE ap_invoice SET amount_paid = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING id, status, amount_paid`,
        [newPaid, newStatus, id]
      )
      await c.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type,
                                  reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'out','payment_made','ap_invoice',$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8)`,
        [orgId, branchId, account_id, id, `Payment to ${inv.supplier_name} — ${inv.invoice_number}`, amount, payment_date ?? null, userId]
      )
      return rows[0]
    })
    logAudit({ userId, branchId, action: 'AP_PAYMENT', tableName: 'ap_invoice', recordId: id, req, newValues: { amount, account_id } })
    return res.json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

// A bill with money on it cannot be voided — pay-backs need a refund entry first.
export async function voidAPInvoice(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { rows } = await query(
    `UPDATE ap_invoice SET status = 'voided', updated_at = NOW()
     WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL AND amount_paid = 0 AND status <> 'voided'
     RETURNING id`,
    [req.params.id, branchId]
  )
  if (!rows[0]) return fail(res, 409, 'Bill not found, already voided, or it already has payments on it')
  logAudit({ userId, branchId, action: 'AP_VOIDED', tableName: 'ap_invoice', recordId: req.params.id, req })
  return res.json({ success: true })
}
