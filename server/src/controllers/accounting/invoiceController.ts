import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

export async function listInvoices(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, invoice_number, invoice_date, total_amount, amount_paid,
            amount_due, status, guest_id
     FROM invoice WHERE branch_id = $1 AND deleted_at IS NULL
     ORDER BY invoice_date DESC LIMIT 100`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function getInvoice(req: Request, res: Response) {
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
       WHERE i.id = $1`,
      [req.params.id]
    ),
    query(`SELECT * FROM invoice_line WHERE invoice_id = $1 ORDER BY created_at`, [req.params.id]),
  ])
  if (!invs[0]) return res.status(404).json({ success: false, message: 'Invoice not found' })
  return res.json({ success: true, data: { ...invs[0], lines } })
}

export async function createInvoice(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const {
    guest_id, booking_id, order_id,
    lines, vat_rate = 0, service_charge_pct = 0,
    discount_amount = 0, due_date, notes,
  } = req.body

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ success: false, message: 'lines[] is required' })
  }

  const invNumber = 'INV-' + Date.now().toString(36).toUpperCase()

  let subtotal = 0
  for (const l of lines) {
    subtotal += Number(l.quantity ?? 1) * Number(l.unit_price)
  }
  const disc   = Number(discount_amount)
  const taxable = subtotal - disc
  const vatAmt  = taxable * (Number(vat_rate) / 100)
  const svcAmt  = taxable * (Number(service_charge_pct) / 100)
  const total   = taxable + vatAmt + svcAmt

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [inv] } = await client.query(
      `INSERT INTO invoice
         (branch_id, guest_id, booking_id, order_id, invoice_number,
          subtotal, discount_amount, tax_amount, vat_rate, service_charge,
          total_amount, status, due_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'issued',$12,$13,$14)
       RETURNING id, invoice_number, total_amount`,
      [branchId, guest_id ?? null, booking_id ?? null, order_id ?? null, invNumber,
       subtotal, disc, vatAmt, vat_rate, svcAmt,
       total, due_date ?? null, notes ?? null, userId]
    )

    for (const l of lines) {
      await client.query(
        `INSERT INTO invoice_line (invoice_id, description, quantity, unit_price, reference_type, reference_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [inv.id, l.description, l.quantity ?? 1, l.unit_price,
         l.reference_type ?? null, l.reference_id ?? null]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: inv })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function voidInvoice(req: Request, res: Response) {
  const { reason } = req.body
  await query(
    `UPDATE invoice SET status = 'voided', voided_at = NOW(), voided_reason = $2 WHERE id = $1`,
    [req.params.id, reason]
  )
  return res.json({ success: true })
}

export async function recordPayment(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { amount, payment_method, account_id } = req.body

  if (!amount || !payment_method) {
    return res.status(400).json({ success: false, message: 'amount and payment_method are required' })
  }
  // Room charge defers the amount to the guest's folio (a receivable settled
  // at checkout) rather than depositing cash right now, so it's the one
  // payment method that doesn't need an account.
  if (payment_method !== 'room_charge' && !account_id) {
    return res.status(400).json({ success: false, message: 'account_id is required for this payment method' })
  }

  const { rows: invs } = await query(
    `SELECT invoice_number, total_amount, amount_paid, status FROM invoice WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (!invs[0]) return res.status(404).json({ success: false, message: 'Invoice not found' })
  if (invs[0].status === 'voided') return res.status(409).json({ success: false, message: 'Invoice is voided' })
  if (invs[0].status === 'paid')   return res.status(409).json({ success: false, message: 'Invoice already paid' })

  const newPaid = Number(invs[0].amount_paid) + Number(amount)
  const newStatus = newPaid >= Number(invs[0].total_amount) ? 'paid' : 'partially_paid'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `UPDATE invoice SET amount_paid = $1, status = $2, payment_method = $3, updated_at = NOW()
       WHERE id = $4 RETURNING id, invoice_number, amount_paid, total_amount, status`,
      [newPaid, newStatus, payment_method, id]
    )

    // Deposit the payment into the chosen account — this is what actually
    // moves the money in the ledger; without it, the account balance never
    // reflected invoice payments at all. Skipped for room_charge, which has
    // no account (see check above).
    if (account_id) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'in','payment_received','invoice',$4,$5,$6,CURRENT_DATE,$7)`,
        [orgId, branchId, account_id, id, `Payment: ${invs[0].invoice_number}`, amount, userId]
      )
    }

    await client.query('COMMIT')
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}