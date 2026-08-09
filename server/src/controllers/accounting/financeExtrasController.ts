import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

// ─── Payment listings (Receipts / Expense / Salary tabs) ─────────────────────

export async function listGuestPayments(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { limit, offset } = getPagination(req, 200)
  // Guest payments live on the invoice: every invoice with money received
  const { rows } = await query(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, i.amount_paid,
            i.amount_due, i.status, i.payment_method, i.updated_at,
            g.first_name || ' ' || g.last_name AS guest_name,
            b.booking_ref
     FROM invoice i
     LEFT JOIN guest g   ON g.id = i.guest_id
     LEFT JOIN booking b ON b.id = i.booking_id
     WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.amount_paid > 0
     ORDER BY i.updated_at DESC LIMIT $2 OFFSET $3`,
    [branchId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function listSupplierPayments(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { limit, offset } = getPagination(req, 200)
  // Supplier payments are transactions written by payAPInvoice
  const { rows } = await query(
    `SELECT t.id, t.amount, t.transaction_date, t.description, t.status,
            a.name AS account_name,
            ap.invoice_number, s.name AS supplier_name
     FROM transaction t
     JOIN account a        ON a.id = t.account_id
     LEFT JOIN ap_invoice ap ON ap.id = t.reference_id
     LEFT JOIN supplier s    ON s.id = ap.supplier_id
     WHERE t.branch_id = $1 AND t.reference_type = 'ap_invoice'
       AND t.transaction_type = 'payment_made' AND t.deleted_at IS NULL
     ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $2 OFFSET $3`,
    [branchId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function listExpensePayments(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { limit, offset } = getPagination(req, 200)
  const { rows } = await query(
    `SELECT ep.id, ep.amount, ep.payment_date, ep.reference_number, ep.notes,
            e.name AS expense_name, e.category, e.is_recurring,
            a.name AS account_name,
            u.full_name AS paid_by_name
     FROM expense_payment ep
     JOIN expense_charge ec ON ec.id = ep.expense_charge_id
     JOIN expense e         ON e.id  = ec.expense_id
     JOIN account a         ON a.id  = ep.account_id
     LEFT JOIN users u      ON u.id  = ep.paid_by
     WHERE ep.branch_id = $1 AND ep.deleted_at IS NULL
     ORDER BY ep.payment_date DESC, ep.created_at DESC LIMIT $2 OFFSET $3`,
    [branchId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function listSalaryPayments(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { limit, offset } = getPagination(req, 200)
  const { rows } = await query(
    `SELECT sp.id, sp.amount, sp.payment_date, sp.reference_number, sp.notes,
            s.first_name || ' ' || s.last_name AS staff_name, s.employee_id,
            sc.period_start, sc.period_end,
            a.name AS account_name,
            u.full_name AS paid_by_name
     FROM salary_payment sp
     JOIN salary_charge sc ON sc.id = sp.salary_charge_id
     JOIN staff s          ON s.id  = sc.staff_id
     JOIN account a        ON a.id  = sp.account_id
     LEFT JOIN users u     ON u.id  = sp.paid_by
     WHERE sp.branch_id = $1 AND sp.deleted_at IS NULL
     ORDER BY sp.payment_date DESC, sp.created_at DESC LIMIT $2 OFFSET $3`,
    [branchId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

// ─── Profit Sharing ───────────────────────────────────────────────────────────

export async function listProfitSharing(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { limit, offset } = getPagination(req, 200)
  const { rows } = await query(
    `SELECT ps.id, ps.partner_name, ps.share_percent, ps.amount, ps.share_date,
            ps.period_note, ps.notes, a.name AS account_name
     FROM profit_sharing ps
     LEFT JOIN account a ON a.id = ps.account_id
     WHERE ps.organization_id = $1 AND ps.deleted_at IS NULL
     ORDER BY ps.share_date DESC, ps.partner_name LIMIT $2 OFFSET $3`,
    [orgId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function createProfitSharing(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { partner_name, share_percent = 0, amount, share_date, account_id, period_note, notes } = req.body

  if (!partner_name || !amount) {
    return res.status(400).json({ success: false, message: 'partner_name and amount are required' })
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be positive' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [share] } = await client.query(
      `INSERT INTO profit_sharing (organization_id, branch_id, partner_name, share_percent, amount,
                                   share_date, account_id, period_note, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, partner_name, amount`,
      [orgId, branchId, partner_name, share_percent, amount,
       share_date ?? new Date().toISOString().slice(0, 10),
       account_id ?? null, period_note ?? null, notes ?? null, userId]
    )

    // Paying from an account → money out
    if (account_id) {
      await client.query(
        `INSERT INTO transaction (organization_id, branch_id, account_id, direction, transaction_type,
                                  reference_type, reference_id, description, amount, transaction_date, created_by)
         VALUES ($1,$2,$3,'out','adjustment','adjustment_entry',$4,$5,$6,$7,$8)`,
        [orgId, branchId, account_id, share.id,
         `Profit share: ${partner_name}${period_note ? ` (${period_note})` : ''}`,
         amount, share_date ?? new Date().toISOString().slice(0, 10), userId]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: share })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function deleteProfitSharing(req: Request, res: Response) {
  await query(`UPDATE profit_sharing SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

// ─── Reports summary ──────────────────────────────────────────────────────────
// One endpoint feeding the whole Reports page.

export async function getReportsSummary(req: Request, res: Response) {
  try {
  const { orgId, branchId } = req.auth!
  const to   = (req.query.to   as string) || new Date().toISOString().slice(0, 10)
  const from = (req.query.from as string) ||
    new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)

  const [
    txTotals, txByType, txDaily,
    bookingStats, roomStats,
    orderStats,
    invoiceStats, apStats,
    stockValue, lowStock,
    expenseTotal, salaryTotal,
    balances, assetTotals,
  ] = await Promise.all([
    // Money in vs out for the period
    query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE direction = 'in'),  0) AS total_in,
         COALESCE(SUM(amount) FILTER (WHERE direction = 'out'), 0) AS total_out
       FROM transaction
       WHERE branch_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND transaction_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Breakdown by transaction type
    query(
      `SELECT transaction_type, direction, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM transaction
       WHERE branch_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND transaction_date BETWEEN $2 AND $3
       GROUP BY transaction_type, direction
       ORDER BY total DESC`,
      [branchId, from, to]
    ),
    // Daily in/out series for the chart
    query(
      `SELECT transaction_date::text AS date,
              COALESCE(SUM(amount) FILTER (WHERE direction = 'in'),  0) AS money_in,
              COALESCE(SUM(amount) FILTER (WHERE direction = 'out'), 0) AS money_out
       FROM transaction
       WHERE branch_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND transaction_date BETWEEN $2 AND $3
       GROUP BY transaction_date ORDER BY transaction_date`,
      [branchId, from, to]
    ),
    // Bookings in period (room → hotel → branch)
    query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE b.status = 'checked_in')  AS checked_in,
              COUNT(*) FILTER (WHERE b.status = 'checked_out') AS checked_out,
              COUNT(*) FILTER (WHERE b.status = 'cancelled')   AS cancelled,
              COALESCE(SUM(b.total_amount) FILTER (WHERE b.status NOT IN ('cancelled','no_show')), 0) AS booking_value
       FROM booking b
       JOIN room r  ON r.id = b.room_id
       JOIN hotel h ON h.id = r.hotel_id
       WHERE h.branch_id = $1 AND b.deleted_at IS NULL
         AND b.check_in_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Room occupancy snapshot (today)
    query(
      `SELECT COUNT(*) AS total_rooms,
              COUNT(*) FILTER (WHERE r.status = 'occupied')  AS occupied,
              COUNT(*) FILTER (WHERE r.status = 'available') AS available
       FROM room r
       JOIN hotel h ON h.id = r.hotel_id
       WHERE h.branch_id = $1 AND r.deleted_at IS NULL`,
      [branchId]
    ),
    // Restaurant orders in period
    query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(total_amount), 0) AS order_revenue,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
       FROM order_header
       WHERE branch_id = $1 AND deleted_at IS NULL
         AND created_at::date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Guest invoices in period
    query(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(total_amount), 0) AS invoiced,
              COALESCE(SUM(amount_paid), 0)  AS collected,
              COALESCE(SUM(total_amount - amount_paid) FILTER (WHERE status NOT IN ('voided')), 0) AS outstanding
       FROM invoice
       WHERE branch_id = $1 AND deleted_at IS NULL AND status <> 'voided'
         AND invoice_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Supplier bills in period
    query(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(total_amount), 0) AS billed,
              COALESCE(SUM(amount_paid), 0)  AS paid,
              COALESCE(SUM(total_amount - amount_paid) FILTER (WHERE status NOT IN ('voided')), 0) AS payable
       FROM ap_invoice
       WHERE branch_id = $1 AND deleted_at IS NULL AND status <> 'voided'
         AND invoice_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Inventory value now
    query(
      `SELECT COALESCE(SUM(sb.quantity_on_hand * sb.average_cost), 0) AS stock_value,
              COUNT(DISTINCT sb.item_id) AS item_count
       FROM stock_balance sb
       JOIN warehouse w ON w.id = sb.warehouse_id
       WHERE w.branch_id = $1`,
      [branchId]
    ),
    query(
      `SELECT COUNT(*) AS low_count
       FROM stock_balance sb
       JOIN item i      ON i.id = sb.item_id
       JOIN warehouse w ON w.id = sb.warehouse_id
       WHERE w.branch_id = $1 AND sb.quantity_on_hand <= i.reorder_level AND i.deleted_at IS NULL`,
      [branchId]
    ),
    // Expense paid in period
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expense_payment
       WHERE branch_id = $1 AND deleted_at IS NULL AND payment_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Salary paid in period
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM salary_payment
       WHERE branch_id = $1 AND deleted_at IS NULL AND payment_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    ),
    // Account balances (all time)
    query(
      `SELECT id, account_type, name, balance
       FROM account_balance
       WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
       ORDER BY balance DESC`,
      [orgId, branchId]
    ),
    // Assets
    query(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(purchase_cost), 0) AS purchase_cost,
              COALESCE(SUM(current_value), 0) AS current_value
       FROM assets
       WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         AND deleted_at IS NULL AND is_active = TRUE`,
      [orgId, branchId]
    ),
  ])

  const totals = txTotals.rows[0]
  return res.json({
    success: true,
    data: {
      period: { from, to },
      money: {
        total_in:  Number(totals.total_in),
        total_out: Number(totals.total_out),
        net:       Number(totals.total_in) - Number(totals.total_out),
        by_type:   txByType.rows,
        daily:     txDaily.rows,
      },
      hotel: {
        bookings:  bookingStats.rows[0],
        rooms:     roomStats.rows[0],
      },
      restaurant: orderStats.rows[0],
      receivables: invoiceStats.rows[0],
      payables:    apStats.rows[0],
      inventory: {
        ...stockValue.rows[0],
        low_stock: Number(lowStock.rows[0].low_count),
      },
      expenses_paid: Number(expenseTotal.rows[0].total),
      salaries_paid: Number(salaryTotal.rows[0].total),
      accounts: balances.rows,
      assets: assetTotals.rows[0],
    },
  })
  } catch (err) {
    console.error('getReportsSummary error:', err)
    return res.status(500).json({ success: false, message: 'Failed to build report summary' })
  }
}
