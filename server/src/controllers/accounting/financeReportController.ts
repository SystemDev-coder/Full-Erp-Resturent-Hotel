import { Request, Response } from 'express'
import { query } from '../../db/pool'

// Finance report — the accountant's view of a period:
//   • Profit & loss: money earned (guest payments, receipts, other income) vs money spent
//     (expenses, salaries, supplier payments). Transfers between your own accounts and
//     opening-balance adjustments are NOT income or cost, so they are kept out.
//   • Cash & bank position per account.
//   • Ageing of what guests owe you and what you owe suppliers (as of today).

const num = (v: unknown) => Number(v ?? 0)
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

export const SOURCE_SQL = `CASE WHEN i.order_id IS NOT NULL THEN 'restaurant' WHEN i.booking_id IS NOT NULL THEN 'hotel' ELSE 'other' END`

export function periodFrom(req: Request) {
  const to   = isDay(req.query.to)   ? req.query.to   : new Date().toISOString().slice(0, 10)
  const from = isDay(req.query.from) ? req.query.from : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  return { from, to }
}

const BUCKETS = [
  { key: 'current', label: '0–30 days',  min: 0,  max: 30 },
  { key: 'd31',     label: '31–60 days', min: 31, max: 60 },
  { key: 'd61',     label: '61–90 days', min: 61, max: 90 },
  { key: 'd90',     label: 'Over 90 days', min: 91, max: 100000 },
]

const aging = (rows: any[]) =>
  BUCKETS.map(b => {
    const inB = rows.filter(r => r.age >= b.min && r.age <= b.max)
    return { key: b.key, label: b.label, count: inB.length, due: inB.reduce((a, r) => a + num(r.due), 0) }
  })

export async function getFinanceReport(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { from, to } = periodFrom(req)

  const [bySource, other, expenses, salaries, purchases, accounts, ar, ap, daily] = await Promise.all([
    query(
      `SELECT ${SOURCE_SQL} AS source, COALESCE(i.payment_method, 'unknown') AS method, SUM(t.amount) AS total, COUNT(*) AS count
       FROM transaction t JOIN invoice i ON t.reference_type = 'invoice' AND t.reference_id = i.id
       WHERE t.branch_id = $1 AND t.direction = 'in' AND t.status = 'completed' AND t.deleted_at IS NULL
         AND t.transaction_date BETWEEN $2 AND $3
       GROUP BY 1, 2`, [branchId, from, to]),

    query(
      `SELECT t.reference_type AS kind, SUM(t.amount) AS total, COUNT(*) AS count
       FROM transaction t
       WHERE t.branch_id = $1 AND t.direction = 'in' AND t.status = 'completed' AND t.deleted_at IS NULL
         AND t.reference_type IN ('receipt', 'other_income') AND t.transaction_date BETWEEN $2 AND $3
       GROUP BY 1`, [branchId, from, to]),

    query(
      `SELECT e.name, SUM(ep.amount) AS total, COUNT(*) AS count
       FROM expense_payment ep
       JOIN expense_charge ec ON ec.id = ep.expense_charge_id JOIN expense e ON e.id = ec.expense_id
       WHERE ep.branch_id = $1 AND ep.deleted_at IS NULL AND ep.payment_date BETWEEN $2 AND $3
       GROUP BY e.name ORDER BY total DESC`, [branchId, from, to]),

    query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM salary_payment
       WHERE branch_id = $1 AND deleted_at IS NULL AND payment_date BETWEEN $2 AND $3`, [branchId, from, to]),

    query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM transaction
       WHERE branch_id = $1 AND direction = 'out' AND transaction_type = 'payment_made' AND status = 'completed'
         AND deleted_at IS NULL AND transaction_date BETWEEN $2 AND $3`, [branchId, from, to]),

    query(
      `SELECT a.id, a.name, a.account_type, a.institution,
              COALESCE(ab.balance, 0) AS balance,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'in'  AND t.transaction_date BETWEEN $3 AND $4), 0) AS money_in,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'out' AND t.transaction_date BETWEEN $3 AND $4), 0) AS money_out
       FROM account a
       LEFT JOIN account_balance ab ON ab.id = a.id
       LEFT JOIN transaction t ON t.account_id = a.id AND t.status = 'completed' AND t.deleted_at IS NULL
       WHERE a.organization_id = $1 AND (a.branch_id = $2 OR a.branch_id IS NULL) AND a.deleted_at IS NULL
         AND a.account_type IN ('cash', 'bank', 'mobile_money')
       GROUP BY a.id, ab.balance ORDER BY a.account_type, a.name`, [orgId, branchId, from, to]),

    query(
      `SELECT (CURRENT_DATE - invoice_date)::int AS age, total_amount - amount_paid AS due FROM invoice
       WHERE branch_id = $1 AND deleted_at IS NULL AND status IN ('issued','partially_paid','overdue') AND total_amount > amount_paid`, [branchId]),

    query(
      `SELECT (CURRENT_DATE - invoice_date)::int AS age, total_amount - amount_paid AS due FROM ap_invoice
       WHERE branch_id = $1 AND deleted_at IS NULL AND status NOT IN ('paid','voided') AND total_amount > amount_paid`, [branchId]),

    query(
      `SELECT d::date::text AS date,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'in'  AND t.transaction_type IN ('payment_received','income')), 0) AS earned,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'out' AND t.transaction_type IN ('expense','salary','payment_made')), 0) AS spent
       FROM generate_series($2::date, $3::date, '1 day') d
       LEFT JOIN transaction t ON t.transaction_date = d::date AND t.branch_id = $1 AND t.status = 'completed' AND t.deleted_at IS NULL
       GROUP BY d ORDER BY d`, [branchId, from, to]),
  ])

  const src = (s: string) => bySource.rows.filter((r: any) => r.source === s)
  const sumOf = (rows: any[]) => rows.reduce((a, r) => a + num(r.total), 0)
  const revenue = {
    hotel: sumOf(src('hotel')), restaurant: sumOf(src('restaurant')), invoices_other: sumOf(src('other')),
    receipts: sumOf(other.rows.filter((r: any) => r.kind === 'receipt')),
    other_income: sumOf(other.rows.filter((r: any) => r.kind === 'other_income')),
  }
  const revenueTotal = revenue.hotel + revenue.restaurant + revenue.invoices_other + revenue.receipts + revenue.other_income
  const expenseTotal = sumOf(expenses.rows)
  const salaryTotal = num(salaries.rows[0].total)
  const purchaseTotal = num(purchases.rows[0].total)
  const costTotal = expenseTotal + salaryTotal + purchaseTotal

  const methods = new Map<string, number>()
  for (const r of bySource.rows) methods.set(r.method, (methods.get(r.method) ?? 0) + num(r.total))

  return res.json({
    success: true,
    data: {
      period: { from, to },
      revenue: { ...revenue, total: revenueTotal },
      costs: {
        expenses: expenseTotal, salaries: salaryTotal, purchases: purchaseTotal, total: costTotal,
        by_category: expenses.rows.map((r: any) => ({ name: r.name, total: num(r.total), count: num(r.count) })),
      },
      profit: revenueTotal - costTotal,
      margin_pct: revenueTotal > 0 ? Math.round(((revenueTotal - costTotal) / revenueTotal) * 1000) / 10 : null,
      by_method: [...methods.entries()].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total),
      accounts: accounts.rows.map((a: any) => ({ ...a, balance: num(a.balance), money_in: num(a.money_in), money_out: num(a.money_out) })),
      cash_total: accounts.rows.reduce((s: number, a: any) => s + num(a.balance), 0),
      receivables: { total: ar.rows.reduce((s: number, r: any) => s + num(r.due), 0), count: ar.rows.length, aging: aging(ar.rows) },
      payables:    { total: ap.rows.reduce((s: number, r: any) => s + num(r.due), 0), count: ap.rows.length, aging: aging(ap.rows) },
      daily: daily.rows.map((d: any) => ({ date: d.date, earned: num(d.earned), spent: num(d.spent) })),
    },
  })
}
