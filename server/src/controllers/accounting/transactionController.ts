import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

export async function listTransactions(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { limit, offset } = getPagination(req, 100)
  const { rows } = await query(
    `SELECT t.id, t.description, t.transaction_type, t.direction,
            t.amount, t.transaction_date, t.status, a.name AS account_name
     FROM transaction t JOIN account a ON a.id = t.account_id
     WHERE t.branch_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.transaction_date DESC, t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [branchId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function createTransaction(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const {
    account_id, direction, transaction_type, reference_type,
    reference_id, description, amount, transaction_date, notes,
  } = req.body

  if (!account_id || !direction || !transaction_type || !reference_type || !description || !amount) {
    return res.status(400).json({ success: false, message: 'Missing required fields' })
  }
  if (!['in','out'].includes(direction)) {
    return res.status(400).json({ success: false, message: 'direction must be "in" or "out"' })
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'amount must be positive' })
  }

  const { rows } = await query(
    `INSERT INTO transaction
       (organization_id, branch_id, account_id, direction, transaction_type,
        reference_type, reference_id, description, amount, transaction_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, amount, direction, transaction_date`,
    [orgId, branchId, account_id, direction, transaction_type,
     reference_type, reference_id ?? null, description, amount,
     transaction_date ?? new Date().toISOString().slice(0,10),
     notes ?? null, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}