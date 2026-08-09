import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

interface ReceiptLineInput {
  description: string
  quantity: number
  unit_price: number
}

async function logReceiptAudit(
  client: any, userId: string, branchId: string, action: string, recordId: string, newValues?: unknown
) {
  await client.query(
    `INSERT INTO audit_log (user_id, branch_id, action, table_name, record_id, new_values)
     VALUES ($1,$2,$3,'receipt',$4,$5)`,
    [userId, branchId, action, recordId, newValues ? JSON.stringify(newValues) : null]
  )
}

function validateLines(lines: any): ReceiptLineInput[] | null {
  if (!Array.isArray(lines) || lines.length === 0) return null
  const clean: ReceiptLineInput[] = []
  for (const l of lines) {
    const description = String(l?.description ?? '').trim()
    const quantity = Number(l?.quantity)
    const unit_price = Number(l?.unit_price)
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unit_price) || unit_price < 0) {
      return null
    }
    clean.push({ description, quantity, unit_price })
  }
  return clean
}

export async function listReceipts(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { status, q } = req.query
  const { limit, offset } = getPagination(req, 200)
  let sql = `
    SELECT r.id, r.receipt_number, r.receipt_date, r.guest_id, r.customer_name, r.reference,
           r.payment_method, r.currency, r.notes, r.subtotal, r.total_amount, r.status,
           r.created_at, r.updated_at,
           g.first_name || ' ' || g.last_name AS guest_name,
           (SELECT COUNT(*) FROM receipt_line rl WHERE rl.receipt_id = r.id AND rl.deleted_at IS NULL) AS item_count
    FROM receipt r
    LEFT JOIN guest g ON g.id = r.guest_id
    WHERE r.branch_id = $1 AND r.deleted_at IS NULL`
  const params: any[] = [branchId]
  if (status) { params.push(status); sql += ` AND r.status = $${params.length}` }
  if (q) {
    params.push(`%${q}%`)
    sql += ` AND (r.receipt_number ILIKE $${params.length} OR r.customer_name ILIKE $${params.length} OR r.reference ILIKE $${params.length})`
  }
  params.push(limit + 1, offset)
  sql += ` ORDER BY r.receipt_date DESC, r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows: rawRows } = await query(sql, params)
  const { rows, hasMore } = sliceHasMore(rawRows, limit)
  return res.json({ success: true, data: rows, hasMore })
}

export async function getReceipt(req: Request, res: Response) {
  const { branchId } = req.auth!
  const [{ rows: receipts }, { rows: lines }] = await Promise.all([
    query(
      `SELECT r.*, g.first_name || ' ' || g.last_name AS guest_name,
              (SELECT t.account_id FROM transaction t
               WHERE t.reference_type = 'receipt' AND t.reference_id = r.id AND t.deleted_at IS NULL
               LIMIT 1) AS account_id
       FROM receipt r LEFT JOIN guest g ON g.id = r.guest_id
       WHERE r.id = $1 AND r.branch_id = $2 AND r.deleted_at IS NULL`,
      [req.params.id, branchId]
    ),
    query(
      `SELECT id, description, quantity, unit_price, amount, sort_order
       FROM receipt_line WHERE receipt_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
      [req.params.id]
    ),
  ])
  if (!receipts[0]) return res.status(404).json({ success: false, message: 'Receipt not found' })
  return res.json({ success: true, data: { ...receipts[0], lines } })
}

export async function createReceipt(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const {
    receipt_date, guest_id, customer_name, reference,
    payment_method = 'cash', currency = 'USD', notes, status = 'issued', lines, account_id,
  } = req.body

  const cleanLines = validateLines(lines)
  if (!cleanLines) {
    return res.status(400).json({ success: false, message: 'At least one valid line item (description, quantity > 0, unit price >= 0) is required' })
  }
  if (!guest_id && !customer_name?.trim()) {
    return res.status(400).json({ success: false, message: 'Provide a guest or a customer name' })
  }
  // A draft receipt is just a document — no money has actually moved yet.
  // Anything issued represents payment already collected, so it needs a
  // real account to land in.
  if (status !== 'draft' && !account_id) {
    return res.status(400).json({ success: false, message: 'Select which account received the payment' })
  }

  const subtotal = cleanLines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const receiptNumber = 'RCT-' + Date.now().toString(36).toUpperCase()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [receipt] } = await client.query(
      `INSERT INTO receipt (branch_id, receipt_number, receipt_date, guest_id, customer_name, reference,
                             payment_method, currency, notes, subtotal, total_amount, status, created_by)
       VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10,$10,$11,$12)
       RETURNING id, receipt_number`,
      [branchId, receiptNumber, receipt_date ?? null, guest_id ?? null, customer_name ?? null, reference ?? null,
       payment_method, currency, notes ?? null, subtotal, status, userId]
    )
    for (let i = 0; i < cleanLines.length; i++) {
      const l = cleanLines[i]
      await client.query(
        `INSERT INTO receipt_line (receipt_id, description, quantity, unit_price, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [receipt.id, l.description, l.quantity, l.unit_price, l.quantity * l.unit_price, i]
      )
    }
    if (status !== 'draft' && account_id) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'in','payment_received','receipt',$4,$5,$6,COALESCE($7,CURRENT_DATE),$8)`,
        [orgId, branchId, account_id, receipt.id, `Receipt: ${receipt.receipt_number}`, subtotal, receipt_date ?? null, userId]
      )
    }
    await logReceiptAudit(client, userId, branchId, 'RECEIPT_CREATE', receipt.id, { receipt_number: receipt.receipt_number, total_amount: subtotal })
    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: receipt })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateReceipt(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const {
    receipt_date, guest_id, customer_name, reference,
    payment_method, currency, notes, status, lines, account_id,
  } = req.body

  const cleanLines = validateLines(lines)
  if (!cleanLines) {
    return res.status(400).json({ success: false, message: 'At least one valid line item (description, quantity > 0, unit price >= 0) is required' })
  }

  const { rows: existingRows } = await query(
    `SELECT id, status FROM receipt WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`,
    [req.params.id, branchId]
  )
  const existing = existingRows[0]
  if (!existing) return res.status(404).json({ success: false, message: 'Receipt not found' })
  if (existing.status === 'cancelled') {
    return res.status(409).json({ success: false, message: 'A cancelled receipt cannot be edited' })
  }

  const subtotal = cleanLines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const newStatus = status ?? existing.status
  if (newStatus !== 'draft' && !account_id) {
    return res.status(400).json({ success: false, message: 'Select which account received the payment' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [receipt] } = await client.query(
      `UPDATE receipt SET
         receipt_date   = COALESCE($1, receipt_date),
         guest_id       = $2,
         customer_name  = $3,
         reference      = $4,
         payment_method = COALESCE($5, payment_method),
         currency       = COALESCE($6, currency),
         notes          = $7,
         subtotal       = $8,
         total_amount   = $8,
         status         = COALESCE($9, status),
         updated_by     = $10,
         updated_at     = NOW()
       WHERE id = $11
       RETURNING id, receipt_number`,
      [receipt_date ?? null, guest_id ?? null, customer_name ?? null, reference ?? null,
       payment_method ?? null, currency ?? null, notes ?? null, subtotal, status ?? null, userId, req.params.id]
    )
    await client.query(`UPDATE receipt_line SET deleted_at = NOW() WHERE receipt_id = $1`, [req.params.id])
    for (let i = 0; i < cleanLines.length; i++) {
      const l = cleanLines[i]
      await client.query(
        `INSERT INTO receipt_line (receipt_id, description, quantity, unit_price, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, l.description, l.quantity, l.unit_price, l.quantity * l.unit_price, i]
      )
    }

    // Replace the linked ledger transaction with a corrected one — handles
    // draft→issued (create), issued→cancelled (remove), and amount/account
    // changes on an already-issued receipt (replace), the same way editing
    // a transfer or other-income entry already works.
    await client.query(
      `UPDATE transaction SET deleted_at = NOW()
       WHERE reference_type = 'receipt' AND reference_id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    )
    if (newStatus !== 'draft' && account_id) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'in','payment_received','receipt',$4,$5,$6,COALESCE($7,CURRENT_DATE),$8)`,
        [orgId, branchId, account_id, req.params.id, `Receipt: ${receipt.receipt_number}`, subtotal, receipt_date ?? null, userId]
      )
    }

    await logReceiptAudit(client, userId, branchId, 'RECEIPT_UPDATE', req.params.id, { receipt_number: receipt.receipt_number, total_amount: subtotal })
    await client.query('COMMIT')
    return res.json({ success: true, data: receipt })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function deleteReceipt(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE receipt SET deleted_at = NOW(), deleted_by = $1
       WHERE id = $2 AND branch_id = $3 AND deleted_at IS NULL RETURNING id, receipt_number`,
      [userId, req.params.id, branchId]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Receipt not found' })
    }
    await client.query(
      `UPDATE transaction SET deleted_at = NOW()
       WHERE reference_type = 'receipt' AND reference_id = $1 AND deleted_at IS NULL`,
      [rows[0].id]
    )
    await logReceiptAudit(client, userId, branchId, 'RECEIPT_DELETE', rows[0].id, { receipt_number: rows[0].receipt_number })
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
