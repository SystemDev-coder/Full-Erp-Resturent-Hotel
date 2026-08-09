import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

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
     WHERE ap.id = $1 AND ap.deleted_at IS NULL`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'AP Invoice not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createAPInvoice(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { supplier_id, po_id, invoice_number, invoice_date, due_date, total_amount, notes } = req.body
  if (!supplier_id || !invoice_number || !invoice_date || !total_amount) {
    return res.status(400).json({ success: false, message: 'supplier_id, invoice_number, invoice_date, total_amount are required' })
  }
  const { rows } = await query(
    `INSERT INTO ap_invoice (branch_id, supplier_id, po_id, invoice_number, invoice_date, due_date, total_amount, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, invoice_number, total_amount`,
    [branchId, supplier_id, po_id ?? null, invoice_number, invoice_date,
     due_date ?? null, total_amount, notes ?? null, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function payAPInvoice(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { amount, account_id, payment_date, reference_number } = req.body
  if (!amount || !account_id) {
    return res.status(400).json({ success: false, message: 'amount and account_id are required' })
  }

  const { rows: invs } = await query(
    `SELECT ap.*, s.name AS supplier_name FROM ap_invoice ap
     JOIN supplier s ON s.id = ap.supplier_id
     WHERE ap.id = $1 AND ap.deleted_at IS NULL`,
    [id]
  )
  if (!invs[0]) return res.status(404).json({ success: false, message: 'AP Invoice not found' })
  if (invs[0].status === 'paid') return res.status(409).json({ success: false, message: 'Already paid' })

  const newPaid = Number(invs[0].amount_paid) + Number(amount)
  const newStatus = newPaid >= Number(invs[0].total_amount) ? 'paid' : 'partially_paid'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE ap_invoice SET amount_paid = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id, status, amount_paid`,
      [newPaid, newStatus, id]
    )
    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type,
                                reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'out','payment_made','ap_invoice',$4,$5,$6,$7,$8)`,
      [orgId, branchId, account_id, id,
       `Payment to ${invs[0].supplier_name} — ${invs[0].invoice_number}`,
       amount, payment_date ?? new Date().toISOString().slice(0,10), userId]
    )
    await client.query('COMMIT')
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function voidAPInvoice(req: Request, res: Response) {
  await query(
    `UPDATE ap_invoice SET status = 'voided', updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  return res.json({ success: true })
}
