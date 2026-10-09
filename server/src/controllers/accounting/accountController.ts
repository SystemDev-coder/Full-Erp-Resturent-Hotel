import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function listAccounts(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, account_type, name, institution, account_number, is_active, opened_date
     FROM account
     WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND deleted_at IS NULL
     ORDER BY account_type, name`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function listAccountBalances(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, organization_id, branch_id, account_type, name, balance
     FROM account_balance
     WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
     ORDER BY account_type, name`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createAccount(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const {
    account_type, name, institution, account_number, opened_date, notes,
    opening_balance = 0, balance_type = 'debit', // debit = money IN the account, credit = negative
  } = req.body

  if (!account_type || !name) {
    return res.status(400).json({ success: false, message: 'account_type and name are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [account] } = await client.query(
      `INSERT INTO account (organization_id, branch_id, account_type, name, institution, account_number, opened_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, account_type, name`,
      [orgId, branchId, account_type, name, institution ?? null, account_number ?? null,
       opened_date ?? new Date().toISOString().slice(0,10), notes ?? null]
    )

    // Opening balance is recorded as a real ledger entry, so the balance view,
    // transactions list, and reports all pick it up automatically.
    if (Number(opening_balance) > 0) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type,
                                  reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,$4,'adjustment','adjustment_entry',$5,$6,$7,$8,$9)`,
        [orgId, branchId, account.id,
         balance_type === 'credit' ? 'out' : 'in',
         account.id,
         `Opening balance — ${name}`,
         Number(opening_balance),
         opened_date ?? new Date().toISOString().slice(0,10), userId]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: account })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateAccount(req: Request, res: Response) {
  const { id } = req.params
  const { name, institution, account_number, notes, is_active } = req.body

  const { rows } = await query(
    `UPDATE account SET
       name           = COALESCE($1, name),
       institution    = COALESCE($2, institution),
       account_number = COALESCE($3, account_number),
       notes          = COALESCE($4, notes),
       is_active      = COALESCE($5, is_active),
       updated_at     = NOW()
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING id, name, account_type, is_active`,
    [name ?? null, institution ?? null, account_number ?? null,
     notes ?? null, is_active ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Account not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteAccount(req: Request, res: Response) {
  const { id } = req.params
  // Block deleting an account that still has money in it
  const { rows: bal } = await query(
    `SELECT balance FROM account_balance WHERE id = $1`, [id]
  )
  if (bal[0] && Number(bal[0].balance) !== 0) {
    return res.status(409).json({
      success: false,
      message: 'Account still has a balance — clear it first (Systems → Account Cleaner)',
    })
  }
  await query(`UPDATE account SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id])
  return res.json({ success: true })
}

// ── Account Transfers ────────────────────────────────────────────────────────

export async function listTransfers(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT at.id, at.amount, at.transfer_date, at.description, at.reference,
            at.from_account_id, at.to_account_id,
            fa.name AS from_account, ta.name AS to_account
     FROM account_transfer at
     JOIN account fa ON fa.id = at.from_account_id
     JOIN account ta ON ta.id = at.to_account_id
     WHERE at.organization_id = $1 AND at.branch_id = $2 AND at.deleted_at IS NULL
     ORDER BY at.transfer_date DESC LIMIT 100`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createTransfer(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { from_account_id, to_account_id, amount, transfer_date, description, reference } = req.body

  if (!from_account_id || !to_account_id || !amount) {
    return res.status(400).json({ success: false, message: 'from_account_id, to_account_id, amount are required' })
  }
  if (from_account_id === to_account_id) {
    return res.status(400).json({ success: false, message: 'Cannot transfer to the same account' })
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be positive' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Equity accounts aren't a limited pool of money — an owner's capital
    // contribution is recorded by moving the equity account further negative
    // (credit-normal), which isn't "running out" the way a cash/bank balance
    // does, so the insufficient-balance check only applies to non-equity sources.
    const { rows: [fromAccount] } = await client.query(
      `SELECT account_type FROM account WHERE id = $1`, [from_account_id]
    )
    if (fromAccount?.account_type !== 'equity') {
      const { rows: [{ balance }] } = await client.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'in'  AND status = 'completed' AND deleted_at IS NULL), 0)
              - COALESCE(SUM(amount) FILTER (WHERE direction = 'out' AND status = 'completed' AND deleted_at IS NULL), 0) AS balance
         FROM transaction WHERE account_id = $1`,
        [from_account_id]
      )
      if (Number(amount) > Number(balance)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ success: false, message: `Insufficient balance in source account — available: $${Number(balance).toFixed(2)}` })
      }
    }

    const { rows: [transfer] } = await client.query(
      `INSERT INTO account_transfer (organization_id, branch_id, from_account_id, to_account_id, amount, transfer_date, description, reference, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [orgId, branchId, from_account_id, to_account_id, amount,
       transfer_date ?? new Date().toISOString().slice(0,10),
       description ?? null, reference ?? null, userId]
    )

    const txDate = transfer_date ?? new Date().toISOString().slice(0,10)
    const desc = description ?? 'Account transfer'

    // Debit source account
    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'out','transfer_out','account_transfer',$4,$5,$6,$7,$8)`,
      [orgId, branchId, from_account_id, transfer.id, desc, amount, txDate, userId]
    )
    // Credit destination account
    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'in','transfer_in','account_transfer',$4,$5,$6,$7,$8)`,
      [orgId, branchId, to_account_id, transfer.id, desc, amount, txDate, userId]
    )

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: transfer })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Edit a transfer: update the record, then replace its two linked ledger
// transactions with corrected ones (rather than editing them in place) so
// account balances stay derived purely from live, non-deleted transaction rows.
export async function updateTransfer(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { from_account_id, to_account_id, amount, transfer_date, description, reference } = req.body

  if (!from_account_id || !to_account_id || !amount) {
    return res.status(400).json({ success: false, message: 'from_account_id, to_account_id, amount are required' })
  }
  if (from_account_id === to_account_id) {
    return res.status(400).json({ success: false, message: 'Cannot transfer to the same account' })
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be positive' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [existing] } = await client.query(
      `SELECT id FROM account_transfer WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (!existing) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Transfer not found' })
    }

    const txDate = transfer_date ?? new Date().toISOString().slice(0,10)
    const desc = description ?? 'Account transfer'

    await client.query(
      `UPDATE account_transfer SET
         from_account_id = $1, to_account_id = $2, amount = $3,
         transfer_date = $4, description = $5, reference = $6
       WHERE id = $7`,
      [from_account_id, to_account_id, amount, txDate, description ?? null, reference ?? null, id]
    )

    await client.query(
      `UPDATE transaction SET deleted_at = NOW()
       WHERE reference_type = 'account_transfer' AND reference_id = $1 AND deleted_at IS NULL`,
      [id]
    )

    // Check the source account's balance with this transfer's old amount
    // already backed out, so re-editing the same transfer isn't blocked by
    // its own prior debit. Equity sources skip this — see createTransfer.
    const { rows: [fromAccount] } = await client.query(
      `SELECT account_type FROM account WHERE id = $1`, [from_account_id]
    )
    if (fromAccount?.account_type !== 'equity') {
      const { rows: [{ balance }] } = await client.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'in'  AND status = 'completed' AND deleted_at IS NULL), 0)
              - COALESCE(SUM(amount) FILTER (WHERE direction = 'out' AND status = 'completed' AND deleted_at IS NULL), 0) AS balance
         FROM transaction WHERE account_id = $1`,
        [from_account_id]
      )
      if (Number(amount) > Number(balance)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ success: false, message: `Insufficient balance in source account — available: $${Number(balance).toFixed(2)}` })
      }
    }

    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'out','transfer_out','account_transfer',$4,$5,$6,$7,$8)`,
      [orgId, branchId, from_account_id, id, desc, amount, txDate, userId]
    )
    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'in','transfer_in','account_transfer',$4,$5,$6,$7,$8)`,
      [orgId, branchId, to_account_id, id, desc, amount, txDate, userId]
    )

    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Undo a transfer: soft-delete the record and its two ledger transactions
export async function deleteTransfer(req: Request, res: Response) {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE account_transfer SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Transfer not found' })
    }
    await client.query(
      `UPDATE transaction SET deleted_at = NOW()
       WHERE reference_type = 'account_transfer' AND reference_id = $1 AND deleted_at IS NULL`,
      [id]
    )
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Other Income ─────────────────────────────────────────────────────────────

export async function listOtherIncome(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT oi.id, oi.name, oi.amount, oi.income_date, oi.description, oi.reference,
            oi.account_id, a.name AS account_name
     FROM other_income oi
     LEFT JOIN account a ON a.id = oi.account_id
     WHERE oi.organization_id = $1 AND oi.branch_id = $2 AND oi.deleted_at IS NULL
     ORDER BY oi.income_date DESC LIMIT 100`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createOtherIncome(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { name, amount, account_id, income_date, description, reference } = req.body

  if (!name || !amount) {
    return res.status(400).json({ success: false, message: 'name and amount are required' })
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be positive' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [income] } = await client.query(
      `INSERT INTO other_income (organization_id, branch_id, name, amount, account_id, income_date, description, reference, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, amount`,
      [orgId, branchId, name, amount, account_id ?? null,
       income_date ?? new Date().toISOString().slice(0,10),
       description ?? null, reference ?? null, userId]
    )

    if (account_id) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'in','income','other_income',$4,$5,$6,$7,$8)`,
        [orgId, branchId, account_id, income.id,
         description ?? name, amount,
         income_date ?? new Date().toISOString().slice(0,10), userId]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: income })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Edit an income entry: update the record, then replace its linked ledger
// transaction (if any) with a corrected one.
export async function updateOtherIncome(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { name, amount, account_id, income_date, description, reference } = req.body

  if (!name || !amount) {
    return res.status(400).json({ success: false, message: 'name and amount are required' })
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be positive' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [existing] } = await client.query(
      `SELECT id FROM other_income WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (!existing) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Income entry not found' })
    }

    const txDate = income_date ?? new Date().toISOString().slice(0,10)

    await client.query(
      `UPDATE other_income SET
         name = $1, amount = $2, account_id = $3,
         income_date = $4, description = $5, reference = $6
       WHERE id = $7`,
      [name, amount, account_id ?? null, txDate, description ?? null, reference ?? null, id]
    )

    await client.query(
      `UPDATE transaction SET deleted_at = NOW()
       WHERE reference_type = 'other_income' AND reference_id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (account_id) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'in','income','other_income',$4,$5,$6,$7,$8)`,
        [orgId, branchId, account_id, id, description ?? name, amount, txDate, userId]
      )
    }

    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Undo an income entry: soft-delete the record and its ledger transaction
export async function deleteOtherIncome(req: Request, res: Response) {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE other_income SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Income entry not found' })
    }
    await client.query(
      `UPDATE transaction SET deleted_at = NOW()
       WHERE reference_type = 'other_income' AND reference_id = $1 AND deleted_at IS NULL`,
      [id]
    )
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export async function listExpenses(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT e.id, e.name, e.category, e.description, e.is_recurring,
            COUNT(ec.id) AS charge_count,
            COALESCE(SUM(ec.amount), 0) AS total_charged
     FROM expense e
     LEFT JOIN expense_charge ec ON ec.expense_id = e.id AND ec.deleted_at IS NULL
     WHERE e.organization_id = $1 AND e.branch_id = $2 AND e.deleted_at IS NULL
     GROUP BY e.id ORDER BY e.name`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createExpense(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { name, category, description, is_recurring = false } = req.body

  if (!name || !category) {
    return res.status(400).json({ success: false, message: 'name and category are required' })
  }

  const { rows } = await query(
    `INSERT INTO expense (organization_id, branch_id, name, category, description, is_recurring, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, category`,
    [orgId, branchId, name, category, description ?? null, is_recurring, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateExpense(req: Request, res: Response) {
  const { id } = req.params
  const { name, category, description, is_recurring } = req.body

  const { rows } = await query(
    `UPDATE expense SET
       name         = COALESCE($1, name),
       category     = COALESCE($2, category),
       description  = COALESCE($3, description),
       is_recurring = COALESCE($4, is_recurring),
       updated_at   = NOW()
     WHERE id = $5 AND deleted_at IS NULL
     RETURNING id, name, category, is_recurring`,
    [name ?? null, category ?? null, description ?? null, is_recurring ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Expense not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteExpense(req: Request, res: Response) {
  const { id } = req.params
  // Block deleting an expense that still has unpaid charges
  const { rows: open } = await query(
    `SELECT 1 FROM expense_charge
     WHERE expense_id = $1 AND status IN ('pending','approved') AND deleted_at IS NULL LIMIT 1`,
    [id]
  )
  if (open[0]) {
    return res.status(409).json({ success: false, message: 'Expense has unpaid charges — pay or delete them first' })
  }
  await query(`UPDATE expense SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id])
  return res.json({ success: true })
}

export async function listExpenseCharges(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT ec.id, ec.amount, ec.charge_date, ec.due_date, ec.status, ec.description,
            e.name AS expense_name, e.category
     FROM expense_charge ec
     JOIN expense e ON e.id = ec.expense_id
     WHERE ec.branch_id = $1 AND ec.deleted_at IS NULL
     ORDER BY ec.charge_date DESC LIMIT 100`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createExpenseCharge(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { expense_id, amount, charge_date, due_date, description } = req.body

  if (!expense_id || !amount) {
    return res.status(400).json({ success: false, message: 'expense_id and amount are required' })
  }

  const { rows: [charge] } = await query(
    `INSERT INTO expense_charge (organization_id, branch_id, expense_id, exp_id, amount, charge_date, due_date, description, created_by)
     SELECT $1,$2,$3, COALESCE((SELECT MAX(exp_id) FROM expense_charge WHERE expense_id=$3),0)+1, $4,$5,$6,$7,$8
     RETURNING id, amount, status, charge_date`,
    [orgId, branchId, expense_id, amount,
     charge_date ?? new Date().toISOString().slice(0,10),
     due_date ?? null, description ?? null, userId]
  )
  return res.status(201).json({ success: true, data: charge })
}

// Only unpaid charges can be edited — once paid, the amount is already in the ledger
export async function updateExpenseCharge(req: Request, res: Response) {
  const { id } = req.params
  const { amount, charge_date, due_date, description } = req.body

  const { rows: existing } = await query(
    `SELECT status FROM expense_charge WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!existing[0]) return res.status(404).json({ success: false, message: 'Charge not found' })
  if (existing[0].status === 'paid') {
    return res.status(409).json({ success: false, message: 'Cannot edit a paid charge' })
  }

  const { rows } = await query(
    `UPDATE expense_charge SET
       amount      = COALESCE($1, amount),
       charge_date = COALESCE($2, charge_date),
       due_date    = $3,
       description = $4
     WHERE id = $5
     RETURNING id, amount, status, charge_date`,
    [amount ?? null, charge_date ?? null, due_date ?? null, description ?? null, id]
  )
  return res.json({ success: true, data: rows[0] })
}

// Only unpaid charges can be deleted — paid ones are already in the ledger
export async function deleteExpenseCharge(req: Request, res: Response) {
  const { id } = req.params
  const { rows } = await query(
    `SELECT status FROM expense_charge WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Charge not found' })
  if (rows[0].status === 'paid') {
    return res.status(409).json({ success: false, message: 'Cannot delete a paid charge' })
  }
  await query(`UPDATE expense_charge SET deleted_at = NOW() WHERE id = $1`, [id])
  return res.json({ success: true })
}

// Undo a payment: reverses the ledger transaction it posted and re-opens the
// charge so it can be paid again. The payment itself is never edited in
// place — like account transfers, a posted payment is immutable; correcting
// one means undoing it and recording it again with the right details.
export async function deleteExpensePayment(req: Request, res: Response) {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: payments } = await client.query(
      `SELECT id, expense_charge_id FROM expense_payment WHERE id = $1 AND deleted_at IS NULL`, [id]
    )
    if (!payments[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Payment not found' })
    }
    await client.query(`UPDATE expense_payment SET deleted_at = NOW() WHERE id = $1`, [id])
    await client.query(
      `UPDATE transaction SET deleted_at = NOW() WHERE reference_type = 'expense_payment' AND reference_id = $1`,
      [id]
    )
    await client.query(
      `UPDATE expense_charge SET status = 'pending' WHERE id = $1`,
      [payments[0].expense_charge_id]
    )
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function payExpenseCharge(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { account_id, payment_date, reference_number, notes } = req.body
  const amount = Number(req.body.amount)

  if (!account_id) return res.status(400).json({ success: false, message: 'account_id and amount are required' })
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'amount must be a positive number' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [charge] } = await client.query(
      `SELECT ec.id, ec.amount AS total, ec.status, e.name AS expense_name,
              COALESCE((SELECT SUM(amount) FROM expense_payment WHERE expense_charge_id = ec.id AND deleted_at IS NULL), 0) AS paid
       FROM expense_charge ec JOIN expense e ON e.id = ec.expense_id
       WHERE ec.id = $1 AND ec.branch_id = $2 AND ec.deleted_at IS NULL FOR UPDATE OF ec`,
      [id, branchId]
    )
    if (!charge) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Expense charge not found' }) }
    if (charge.status === 'paid') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Already paid' }) }
    if (charge.status === 'voided') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'This expense is voided' }) }

    const due = Math.round((Number(charge.total) - Number(charge.paid)) * 100) / 100
    if (amount > due + 0.005) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: `Amount exceeds the balance due (${due.toFixed(2)})` }) }
    const acc = await client.query(
      `SELECT 1 FROM account WHERE id = $1 AND organization_id = $2 AND (branch_id = $3 OR branch_id IS NULL) AND is_active = TRUE AND deleted_at IS NULL`,
      [account_id, orgId, branchId])
    if (!acc.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Account not found' }) }

    const when = payment_date ?? new Date().toISOString().slice(0, 10)
    const { rows: [payment] } = await client.query(
      `INSERT INTO expense_payment (organization_id, branch_id, expense_charge_id, account_id, amount, payment_date, reference_number, notes, paid_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [orgId, branchId, id, account_id, amount, when, reference_number ?? null, notes ?? null, userId]
    )
    await client.query(`UPDATE expense_charge SET status = $2 WHERE id = $1`, [id, amount >= due - 0.005 ? 'paid' : 'approved'])
    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'out','expense','expense_payment',$4,$5,$6,$7,$8)`,
      [orgId, branchId, account_id, payment.id, `Expense: ${charge.expense_name}`, amount, when, userId]
    )
    await client.query('COMMIT')
    return res.json({ success: true, data: payment })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Salary Charges & Payments ────────────────────────────────────────────────

export async function listSalaryCharges(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT sc.id, sc.period_start, sc.period_end, sc.gross_amount, sc.deductions, sc.net_amount, sc.status,
            s.first_name || ' ' || s.last_name AS staff_name, s.employee_id
     FROM salary_charge sc
     JOIN staff s ON s.id = sc.staff_id
     WHERE sc.branch_id = $1 AND sc.deleted_at IS NULL
     ORDER BY sc.period_start DESC LIMIT 100`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createSalaryCharge(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { staff_id, period_start, period_end, gross_amount, deductions = 0 } = req.body

  if (!staff_id || !period_start || !period_end || !gross_amount) {
    return res.status(400).json({ success: false, message: 'staff_id, period_start, period_end, gross_amount are required' })
  }

  const net_amount = Number(gross_amount) - Number(deductions)

  const { rows } = await query(
    `INSERT INTO salary_charge (organization_id, branch_id, staff_id, period_start, period_end, gross_amount, deductions, net_amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, gross_amount, net_amount, status`,
    [orgId, branchId, staff_id, period_start, period_end, gross_amount, deductions, net_amount, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

// Only unpaid salary charges can be edited
export async function updateSalaryCharge(req: Request, res: Response) {
  const { id } = req.params
  const { period_start, period_end, gross_amount, deductions } = req.body

  const { rows: existing } = await query(
    `SELECT status, gross_amount, deductions FROM salary_charge WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!existing[0]) return res.status(404).json({ success: false, message: 'Salary charge not found' })
  if (existing[0].status === 'paid') {
    return res.status(409).json({ success: false, message: 'Cannot edit a paid salary charge' })
  }

  const gross = gross_amount !== undefined ? Number(gross_amount) : Number(existing[0].gross_amount)
  const ded   = deductions   !== undefined ? Number(deductions)   : Number(existing[0].deductions)

  const { rows } = await query(
    `UPDATE salary_charge SET
       period_start = COALESCE($1, period_start),
       period_end   = COALESCE($2, period_end),
       gross_amount = $3,
       deductions   = $4,
       net_amount   = $5
     WHERE id = $6
     RETURNING id, gross_amount, net_amount, status`,
    [period_start ?? null, period_end ?? null, gross, ded, gross - ded, id]
  )
  return res.json({ success: true, data: rows[0] })
}

// Only unpaid salary charges can be deleted
export async function deleteSalaryCharge(req: Request, res: Response) {
  const { id } = req.params
  const { rows } = await query(
    `SELECT status FROM salary_charge WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Salary charge not found' })
  if (rows[0].status === 'paid') {
    return res.status(409).json({ success: false, message: 'Cannot delete a paid salary charge' })
  }
  await query(`UPDATE salary_charge SET deleted_at = NOW() WHERE id = $1`, [id])
  return res.json({ success: true })
}

// Undo a salary payment: reverses its ledger transaction and re-opens the
// charge so it can be paid again — same immutable-payment pattern as expenses.
export async function deleteSalaryPayment(req: Request, res: Response) {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: payments } = await client.query(
      `SELECT id, salary_charge_id FROM salary_payment WHERE id = $1 AND deleted_at IS NULL`, [id]
    )
    if (!payments[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Payment not found' })
    }
    await client.query(`UPDATE salary_payment SET deleted_at = NOW() WHERE id = $1`, [id])
    await client.query(
      `UPDATE transaction SET deleted_at = NOW() WHERE reference_type = 'salary_payment' AND reference_id = $1`,
      [id]
    )
    await client.query(
      `UPDATE salary_charge SET status = 'pending' WHERE id = $1`,
      [payments[0].salary_charge_id]
    )
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function paySalaryCharge(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { id } = req.params
  const { account_id, payment_date, reference_number, notes } = req.body
  const amount = Number(req.body.amount)

  if (!account_id) return res.status(400).json({ success: false, message: 'account_id and amount are required' })
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'amount must be a positive number' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [charge] } = await client.query(
      `SELECT sc.id, sc.net_amount, sc.status, s.first_name || ' ' || s.last_name AS staff_name,
              COALESCE((SELECT SUM(amount) FROM salary_payment WHERE salary_charge_id = sc.id AND deleted_at IS NULL), 0) AS paid
       FROM salary_charge sc JOIN staff s ON s.id = sc.staff_id
       WHERE sc.id = $1 AND sc.branch_id = $2 AND sc.deleted_at IS NULL FOR UPDATE OF sc`,
      [id, branchId]
    )
    if (!charge) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Salary charge not found' }) }
    if (charge.status === 'paid') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Already paid' }) }

    const due = Math.round((Number(charge.net_amount) - Number(charge.paid)) * 100) / 100
    if (amount > due + 0.005) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: `Amount exceeds the salary still due (${due.toFixed(2)})` }) }
    const acc = await client.query(
      `SELECT 1 FROM account WHERE id = $1 AND organization_id = $2 AND (branch_id = $3 OR branch_id IS NULL) AND is_active = TRUE AND deleted_at IS NULL`,
      [account_id, orgId, branchId])
    if (!acc.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Account not found' }) }

    const when = payment_date ?? new Date().toISOString().slice(0, 10)
    const { rows: [payment] } = await client.query(
      `INSERT INTO salary_payment (organization_id, branch_id, salary_charge_id, account_id, amount, payment_date, reference_number, notes, paid_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [orgId, branchId, id, account_id, amount, when, reference_number ?? null, notes ?? null, userId]
    )
    // Only fully paid once the payments add up to the net salary (a part-payment keeps it open)
    await client.query(`UPDATE salary_charge SET status = $2 WHERE id = $1`, [id, amount >= due - 0.005 ? 'paid' : 'approved'])
    await client.query(
      `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type, reference_type, reference_id, description, amount, transaction_date, created_by)
       VALUES ($1,$2,$3,'out','salary','salary_payment',$4,$5,$6,$7,$8)`,
      [orgId, branchId, account_id, payment.id, `Salary: ${charge.staff_name}`, amount, when, userId]
    )
    await client.query('COMMIT')
    return res.json({ success: true, data: payment })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Assets ───────────────────────────────────────────────────────────────────

export async function listAssets(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, asset_type, asset_category, name, description, purchase_date,
            purchase_cost, current_value, depreciation_rate, serial_number, location, is_active
     FROM assets
     WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND deleted_at IS NULL
     ORDER BY asset_type, asset_category, name`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createAsset(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const {
    asset_type, asset_category, name, description,
    purchase_date, purchase_cost = 0, current_value,
    depreciation_rate = 0, serial_number, location, account_id,
  } = req.body

  if (!asset_type || !asset_category || !name) {
    return res.status(400).json({ success: false, message: 'asset_type, asset_category, and name are required' })
  }

  const { rows } = await query(
    `INSERT INTO assets (organization_id, branch_id, asset_type, asset_category, name, description,
                         purchase_date, purchase_cost, current_value, depreciation_rate,
                         serial_number, location, account_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, name, asset_type, current_value`,
    [orgId, branchId, asset_type, asset_category, name, description ?? null,
     purchase_date ?? null, purchase_cost,
     current_value ?? purchase_cost, depreciation_rate,
     serial_number ?? null, location ?? null, account_id ?? null]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateAsset(req: Request, res: Response) {
  const { id } = req.params
  const { name, current_value, depreciation_rate, location, is_active } = req.body

  const { rows } = await query(
    `UPDATE assets SET
       name              = COALESCE($1, name),
       current_value     = COALESCE($2, current_value),
       depreciation_rate = COALESCE($3, depreciation_rate),
       location          = COALESCE($4, location),
       is_active         = COALESCE($5, is_active),
       updated_at        = NOW()
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING id, name, current_value, is_active`,
    [name ?? null, current_value ?? null, depreciation_rate ?? null,
     location ?? null, is_active ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Asset not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteAsset(req: Request, res: Response) {
  await query(`UPDATE assets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

// ── POS Sessions ─────────────────────────────────────────────────────────────

export async function listPosSessions(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT ps.id, ps.terminal_name, ps.opening_cash, ps.closing_cash,
            ps.cash_difference, ps.status, ps.opened_at, ps.closed_at,
            s.first_name || ' ' || s.last_name AS staff_name
     FROM pos_session ps
     JOIN staff s ON s.id = ps.staff_id
     WHERE ps.branch_id = $1 AND ps.deleted_at IS NULL
     ORDER BY ps.opened_at DESC LIMIT 50`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function openPosSession(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { staff_id, terminal_name, opening_cash = 0 } = req.body

  if (!staff_id) {
    return res.status(400).json({ success: false, message: 'staff_id is required' })
  }

  const { rows: open } = await query(
    `SELECT id FROM pos_session WHERE branch_id = $1 AND staff_id = $2 AND status = 'open' AND deleted_at IS NULL`,
    [branchId, staff_id]
  )
  if (open[0]) return res.status(409).json({ success: false, message: 'Staff already has an open session' })

  const { rows } = await query(
    `INSERT INTO pos_session (branch_id, staff_id, terminal_name, opening_cash)
     VALUES ($1,$2,$3,$4) RETURNING id, opened_at, status`,
    [branchId, staff_id, terminal_name ?? null, opening_cash]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function closePosSession(req: Request, res: Response) {
  const { id } = req.params
  const { closing_cash } = req.body

  if (closing_cash == null) {
    return res.status(400).json({ success: false, message: 'closing_cash is required' })
  }

  const { rows: sessions } = await query(
    `SELECT * FROM pos_session WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  if (!sessions[0]) return res.status(404).json({ success: false, message: 'Session not found' })
  if (sessions[0].status !== 'open') return res.status(409).json({ success: false, message: 'Session is not open' })

  const expected = Number(sessions[0].opening_cash)
  const diff = Number(closing_cash) - expected
  const status = Math.abs(diff) > 1 ? 'discrepancy' : 'closed'

  const { rows } = await query(
    `UPDATE pos_session SET
       closing_cash    = $1,
       expected_cash   = $2,
       cash_difference = $3,
       status          = $4,
       closed_at       = NOW()
     WHERE id = $5
     RETURNING id, status, cash_difference, closed_at`,
    [closing_cash, expected, diff, status, id]
  )
  return res.json({ success: true, data: rows[0] })
}
