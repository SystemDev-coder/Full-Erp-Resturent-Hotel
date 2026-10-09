import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { col, DETAIL_LIMIT, type DetailPayload } from '../../utils/detail'
import { SOURCE_SQL } from './financeReportController'

// "What is behind this report card?" — the rows that add up to each KPI on the
// Reports page, for the selected period. Same generic payload the dashboard uses,
// so one modal component renders all of it.

const num = (v: unknown) => Number(v ?? 0)
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

interface Ctx { orgId: string; branchId: string; from: string; to: string }
type Builder = (c: Ctx) => Promise<DetailPayload>

const sum = (rows: any[], key: string) => rows.reduce((a, r) => a + num(r[key]), 0)
const period = (c: Ctx) => `${c.from} → ${c.to}`

const txRows = (c: Ctx, direction: 'in' | 'out') => query(
  `SELECT t.transaction_date::text AS date, t.description, t.transaction_type, a.name AS account, t.amount
   FROM transaction t JOIN account a ON a.id = t.account_id
   WHERE t.branch_id = $1 AND t.status = 'completed' AND t.deleted_at IS NULL AND t.direction = $4
     AND t.transaction_date BETWEEN $2 AND $3
   ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT ${DETAIL_LIMIT}`,
  [c.branchId, c.from, c.to, direction])

const txCols = [col('date', 'Date', 'date'), col('description', 'Description'), col('transaction_type', 'Type', 'status'),
                col('account', 'Account'), col('amount', 'Amount', 'money')]

const BUILDERS: Record<string, Builder> = {
  money_in: async (c) => {
    const { rows } = await txRows(c, 'in')
    return { empty: 'No money came in during this period. Try a wider date range.', title: 'Money in', subtitle: period(c),
      summary: [{ label: 'Total in', value: sum(rows, 'amount'), type: 'money' }, { label: 'Transactions', value: rows.length, type: 'number' }],
      columns: txCols, rows, link: { to: '/accounting/accounts', label: 'Open Accounts' } }
  },
  money_out: async (c) => {
    const { rows } = await txRows(c, 'out')
    return { empty: 'No money went out during this period. Try a wider date range.', title: 'Money out', subtitle: period(c),
      summary: [{ label: 'Total out', value: sum(rows, 'amount'), type: 'money' }, { label: 'Transactions', value: rows.length, type: 'number' }],
      columns: txCols, rows, link: { to: '/accounting/accounts', label: 'Open Accounts' } }
  },
  net: async (c) => {
    const { rows } = await query(
      `SELECT transaction_type, direction, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM transaction WHERE branch_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND transaction_date BETWEEN $2 AND $3
       GROUP BY transaction_type, direction ORDER BY total DESC`, [c.branchId, c.from, c.to])
    const inn = sum(rows.filter((r: any) => r.direction === 'in'), 'total')
    const out = sum(rows.filter((r: any) => r.direction === 'out'), 'total')
    return { empty: 'There were no transactions in this period.', title: inn - out >= 0 ? 'Net profit' : 'Net loss', subtitle: `${period(c)} · money in minus money out`,
      summary: [{ label: 'Money in', value: inn, type: 'money' }, { label: 'Money out', value: out, type: 'money' },
                { label: 'Net', value: inn - out, type: 'money' }],
      columns: [col('transaction_type', 'Type', 'status'), col('direction', 'Direction', 'status'),
                col('count', 'Count', 'number'), col('total', 'Total', 'money')],
      rows }
  },
  outstanding: async (c) => {
    const { rows } = await query(
      `SELECT i.invoice_number, COALESCE(g.first_name || ' ' || g.last_name, '—') AS guest, i.invoice_date::text AS invoice_date,
              i.status, i.total_amount, i.amount_paid, i.total_amount - i.amount_paid AS due
       FROM invoice i LEFT JOIN guest g ON g.id = i.guest_id
       WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status <> 'voided' AND i.total_amount > i.amount_paid
         AND i.invoice_date BETWEEN $2 AND $3
       ORDER BY i.invoice_date LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { empty: 'No unpaid guest invoices in this period.', title: 'Outstanding invoices', subtitle: `${period(c)} · unpaid guest invoices`,
      summary: [{ label: 'Outstanding', value: sum(rows, 'due'), type: 'money' }, { label: 'Invoices', value: rows.length, type: 'number' }],
      columns: [col('invoice_number', 'Invoice'), col('guest', 'Guest'), col('invoice_date', 'Date', 'date'), col('status', 'Status', 'status'),
                col('total_amount', 'Total', 'money'), col('amount_paid', 'Paid', 'money'), col('due', 'Due', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' } }
  },
  receivables: async (c) => {
    const { rows } = await query(
      `SELECT i.invoice_number, COALESCE(g.first_name || ' ' || g.last_name, '—') AS guest, i.invoice_date::text AS invoice_date,
              i.status, i.total_amount, i.amount_paid
       FROM invoice i LEFT JOIN guest g ON g.id = i.guest_id
       WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status <> 'voided' AND i.invoice_date BETWEEN $2 AND $3
       ORDER BY i.invoice_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { empty: 'No guest invoices were issued in this period.', title: 'Guest invoices', subtitle: period(c),
      summary: [{ label: 'Invoiced', value: sum(rows, 'total_amount'), type: 'money' }, { label: 'Collected', value: sum(rows, 'amount_paid'), type: 'money' },
                { label: 'Outstanding', value: sum(rows, 'total_amount') - sum(rows, 'amount_paid'), type: 'money' }],
      columns: [col('invoice_number', 'Invoice'), col('guest', 'Guest'), col('invoice_date', 'Date', 'date'), col('status', 'Status', 'status'),
                col('total_amount', 'Total', 'money'), col('amount_paid', 'Paid', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' } }
  },
  payables: async (c) => {
    const { rows } = await query(
      `SELECT a.invoice_number, s.name AS supplier, a.invoice_date::text AS invoice_date, a.due_date::text AS due_date,
              a.status, a.total_amount, a.amount_paid, a.total_amount - a.amount_paid AS due
       FROM ap_invoice a JOIN supplier s ON s.id = a.supplier_id
       WHERE a.branch_id = $1 AND a.deleted_at IS NULL AND a.status <> 'voided' AND a.invoice_date BETWEEN $2 AND $3
       ORDER BY a.invoice_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { empty: 'No supplier bills in this period.', title: 'Supplier bills', subtitle: period(c),
      summary: [{ label: 'Billed', value: sum(rows, 'total_amount'), type: 'money' }, { label: 'Paid', value: sum(rows, 'amount_paid'), type: 'money' },
                { label: 'Payable', value: sum(rows, 'due'), type: 'money' }],
      columns: [col('invoice_number', 'Bill'), col('supplier', 'Supplier'), col('invoice_date', 'Date', 'date'), col('due_date', 'Due', 'date'),
                col('status', 'Status', 'status'), col('total_amount', 'Total', 'money'), col('due', 'Payable', 'money')],
      rows, link: { to: '/inventory/orders', label: 'Open Purchasing' } }
  },
  hotel: async (c) => {
    const { rows } = await query(
      `SELECT b.booking_ref, g.first_name || ' ' || g.last_name AS guest, r.room_number, b.status,
              b.check_in_date::text AS check_in_date, b.check_out_date::text AS check_out_date, b.total_amount
       FROM booking b JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL AND b.check_in_date BETWEEN $2 AND $3
       ORDER BY b.check_in_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    const live = rows.filter((r: any) => !['cancelled', 'no_show'].includes(r.status))
    return { empty: 'No bookings checked in during this period. Try a wider date range.', title: 'Hotel bookings', subtitle: `${period(c)} · by check-in date`,
      summary: [{ label: 'Bookings', value: rows.length, type: 'number' }, { label: 'Booking value', value: sum(live, 'total_amount'), type: 'money' },
                { label: 'Cancelled', value: rows.length - live.length, type: 'number' }],
      columns: [col('booking_ref', 'Booking'), col('guest', 'Guest'), col('room_number', 'Room'), col('check_in_date', 'Check-in', 'date'),
                col('check_out_date', 'Check-out', 'date'), col('status', 'Status', 'status'), col('total_amount', 'Total', 'money')],
      rows, link: { to: '/hotel/bookings', label: 'Open Bookings' } }
  },
  restaurant: async (c) => {
    const { rows } = await query(
      `SELECT o.order_ref, t.table_number, o.order_type, o.status, o.total_amount, o.opened_at
       FROM order_header o LEFT JOIN dining_table t ON t.id = o.dining_table_id
       WHERE o.branch_id = $1 AND o.deleted_at IS NULL AND o.opened_at::date BETWEEN $2 AND $3
       ORDER BY o.opened_at DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    const live = rows.filter((r: any) => r.status !== 'cancelled')
    return { empty: 'No restaurant orders in this period. Try a wider date range.', title: 'Restaurant orders', subtitle: period(c),
      summary: [{ label: 'Orders', value: live.length, type: 'number' }, { label: 'Order value', value: sum(live, 'total_amount'), type: 'money' },
                { label: 'Cancelled', value: rows.length - live.length, type: 'number' }],
      columns: [col('order_ref', 'Order'), col('table_number', 'Table'), col('order_type', 'Type'), col('status', 'Status', 'status'),
                col('total_amount', 'Total', 'money'), col('opened_at', 'Opened', 'datetime')],
      rows, link: { to: '/restaurant/operations', label: 'Open Orders & Tables' } }
  },
  inventory: async (c) => {
    const { rows } = await query(
      `SELECT i.name, i.sku, w.name AS warehouse, sb.quantity_on_hand, i.unit_of_measure, i.reorder_level,
              sb.quantity_on_hand * sb.average_cost AS value, (sb.quantity_on_hand <= i.reorder_level) AS low
       FROM stock_balance sb JOIN item i ON i.id = sb.item_id JOIN warehouse w ON w.id = sb.warehouse_id
       WHERE w.branch_id = $1 AND i.deleted_at IS NULL
       ORDER BY (sb.quantity_on_hand <= i.reorder_level) DESC, i.name LIMIT ${DETAIL_LIMIT}`, [c.branchId])
    return { empty: 'No stock has been recorded yet.', title: 'Inventory', subtitle: 'Stock on hand (low-stock items first)',
      summary: [{ label: 'Stock value', value: sum(rows, 'value'), type: 'money' }, { label: 'Items', value: rows.length, type: 'number' },
                { label: 'Low stock', value: rows.filter((r: any) => r.low).length, type: 'number' }],
      columns: [col('name', 'Item'), col('warehouse', 'Warehouse'), col('quantity_on_hand', 'On hand', 'number'), col('unit_of_measure', 'Unit'),
                col('reorder_level', 'Reorder at', 'number'), col('value', 'Value', 'money')],
      rows, link: { to: '/inventory/items', label: 'Open Inventory' } }
  },
  payroll: async (c) => {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT sp.payment_date::text AS date, 'Salary' AS kind, s.first_name || ' ' || s.last_name AS description,
                a.name AS account, sp.amount
         FROM salary_payment sp JOIN salary_charge sc ON sc.id = sp.salary_charge_id JOIN staff s ON s.id = sc.staff_id
         JOIN account a ON a.id = sp.account_id
         WHERE sp.branch_id = $1 AND sp.deleted_at IS NULL AND sp.payment_date BETWEEN $2 AND $3
         UNION ALL
         SELECT ep.payment_date::text, 'Expense', COALESCE(ec.description, e.name), a.name, ep.amount
         FROM expense_payment ep JOIN expense_charge ec ON ec.id = ep.expense_charge_id JOIN expense e ON e.id = ec.expense_id
         JOIN account a ON a.id = ep.account_id
         WHERE ep.branch_id = $1 AND ep.deleted_at IS NULL AND ep.payment_date BETWEEN $2 AND $3
       ) x ORDER BY date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { empty: 'No salaries or expenses were paid in this period.', title: 'Salaries & expenses paid', subtitle: period(c),
      summary: [{ label: 'Salaries', value: sum(rows.filter((r: any) => r.kind === 'Salary'), 'amount'), type: 'money' },
                { label: 'Expenses', value: sum(rows.filter((r: any) => r.kind === 'Expense'), 'amount'), type: 'money' }],
      columns: [col('date', 'Date', 'date'), col('kind', 'Kind', 'status'), col('description', 'Description'), col('account', 'Paid from'), col('amount', 'Amount', 'money')],
      rows, link: { to: '/accounting/expenses', label: 'Open Expenses' } }
  },
  assets: async (c) => {
    const { rows } = await query(
      `SELECT name, asset_category, asset_type, purchase_date::text AS purchase_date, purchase_cost, current_value
       FROM assets WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND deleted_at IS NULL AND is_active = TRUE
       ORDER BY current_value DESC LIMIT ${DETAIL_LIMIT}`, [c.orgId, c.branchId])
    return { empty: 'No assets have been registered.', title: 'Assets', subtitle: 'Active assets',
      summary: [{ label: 'Purchase cost', value: sum(rows, 'purchase_cost'), type: 'money' }, { label: 'Current value', value: sum(rows, 'current_value'), type: 'money' }],
      columns: [col('name', 'Asset'), col('asset_category', 'Category'), col('asset_type', 'Type', 'status'), col('purchase_date', 'Bought', 'date'),
                col('purchase_cost', 'Cost', 'money'), col('current_value', 'Value now', 'money')],
      rows }
  },
  // ── Finance tab ──────────────────────────────────────────────────────────────
  fin_revenue: async (c) => {
    const { rows } = await query(
      `SELECT t.transaction_date::text AS date,
              CASE WHEN t.reference_type = 'invoice' THEN ${SOURCE_SQL}
                   WHEN t.reference_type = 'receipt' THEN 'receipt' ELSE 'other income' END AS source,
              t.description, a.name AS account, t.amount
       FROM transaction t JOIN account a ON a.id = t.account_id
       LEFT JOIN invoice i ON t.reference_type = 'invoice' AND t.reference_id = i.id
       WHERE t.branch_id = $1 AND t.direction = 'in' AND t.status = 'completed' AND t.deleted_at IS NULL
         AND t.transaction_type IN ('payment_received', 'income') AND t.transaction_date BETWEEN $2 AND $3
       ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'Revenue received', subtitle: `${period(c)} · guest payments, receipts and other income`,
      empty: 'No money was earned in this period. Try a wider date range.',
      summary: [{ label: 'Revenue', value: sum(rows, 'amount'), type: 'money' }, { label: 'Payments', value: rows.length, type: 'number' }],
      columns: [col('date', 'Date', 'date'), col('source', 'Source', 'status'), col('description', 'Description'), col('account', 'Account'), col('amount', 'Amount', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' } }
  },
  // ── VAT return drill-downs ──
  vat_restaurant: async (c) => {
    const { rows } = await query(
      `SELECT i.invoice_date::text AS date, i.invoice_number, i.status, i.subtotal - i.discount_amount AS base, i.vat_rate, i.tax_amount AS vat
       FROM invoice i WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status <> 'voided' AND i.order_id IS NOT NULL AND i.invoice_date BETWEEN $2 AND $3
       ORDER BY i.invoice_date DESC, i.invoice_number LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'VAT charged — restaurant', subtitle: `${period(c)} · order invoices issued in the period`, empty: 'No restaurant invoices in this period.',
      summary: [{ label: 'VAT', value: sum(rows, 'vat'), type: 'money' }, { label: 'Sales before VAT', value: sum(rows, 'base'), type: 'money' }, { label: 'Invoices', value: rows.length, type: 'number' }],
      columns: [col('date', 'Date', 'date'), col('invoice_number', 'Invoice'), col('status', 'Status', 'status'), col('base', 'Sales (ex VAT)', 'money'), col('vat_rate', 'Rate %', 'number'), col('vat', 'VAT', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' } }
  },
  vat_hotel: async (c) => {
    const { rows } = await query(
      `SELECT COALESCE(b.actual_check_out::date, b.check_out_date)::text AS date, b.booking_ref, g.first_name || ' ' || g.last_name AS guest, r.room_number,
              b.subtotal AS base, b.vat_rate, b.tax_amount AS vat
       FROM booking b JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL AND b.status = 'checked_out' AND COALESCE(b.actual_check_out::date, b.check_out_date) BETWEEN $2 AND $3
       ORDER BY 1 DESC, b.booking_ref LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'VAT charged — hotel', subtitle: `${period(c)} · stays checked out in the period`, empty: 'No stays were checked out in this period.',
      summary: [{ label: 'VAT', value: sum(rows, 'vat'), type: 'money' }, { label: 'Room charges (ex VAT)', value: sum(rows, 'base'), type: 'money' }, { label: 'Stays', value: rows.length, type: 'number' }],
      columns: [col('date', 'Check-out', 'date'), col('booking_ref', 'Booking'), col('guest', 'Guest'), col('room_number', 'Room'), col('base', 'Charges (ex VAT)', 'money'), col('vat_rate', 'Rate %', 'number'), col('vat', 'VAT', 'money')],
      rows, link: { to: '/hotel/bookings', label: 'Open Bookings' } }
  },
  vat_other: async (c) => {
    const { rows } = await query(
      `SELECT i.invoice_date::text AS date, i.invoice_number, i.status, i.subtotal - i.discount_amount AS base, i.vat_rate, i.tax_amount AS vat
       FROM invoice i WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status <> 'voided' AND i.order_id IS NULL AND i.booking_id IS NULL AND i.tax_amount > 0 AND i.invoice_date BETWEEN $2 AND $3
       ORDER BY i.invoice_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'VAT charged — other invoices', subtitle: period(c), empty: 'No other invoices with VAT in this period.',
      summary: [{ label: 'VAT', value: sum(rows, 'vat'), type: 'money' }, { label: 'Invoices', value: rows.length, type: 'number' }],
      columns: [col('date', 'Date', 'date'), col('invoice_number', 'Invoice'), col('status', 'Status', 'status'), col('base', 'Amount (ex VAT)', 'money'), col('vat_rate', 'Rate %', 'number'), col('vat', 'VAT', 'money')], rows }
  },
  fin_expenses: async (c) => {
    const { rows } = await query(
      `SELECT ep.payment_date::text AS date, e.name AS category, COALESCE(ec.description, '—') AS description, a.name AS account, ep.amount
       FROM expense_payment ep JOIN expense_charge ec ON ec.id = ep.expense_charge_id JOIN expense e ON e.id = ec.expense_id
       JOIN account a ON a.id = ep.account_id
       WHERE ep.branch_id = $1 AND ep.deleted_at IS NULL AND ep.payment_date BETWEEN $2 AND $3
       ORDER BY ep.payment_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'Expenses paid', subtitle: period(c), empty: 'No expenses were paid in this period.',
      summary: [{ label: 'Expenses', value: sum(rows, 'amount'), type: 'money' }, { label: 'Payments', value: rows.length, type: 'number' }],
      columns: [col('date', 'Date', 'date'), col('category', 'Category'), col('description', 'Description'), col('account', 'Paid from'), col('amount', 'Amount', 'money')],
      rows, link: { to: '/accounting/expenses', label: 'Open Expenses' } }
  },
  fin_salaries: async (c) => {
    const { rows } = await query(
      `SELECT sp.payment_date::text AS date, s.first_name || ' ' || s.last_name AS staff, sc.period_start::text AS period_start,
              sc.period_end::text AS period_end, a.name AS account, sp.amount
       FROM salary_payment sp JOIN salary_charge sc ON sc.id = sp.salary_charge_id JOIN staff s ON s.id = sc.staff_id
       JOIN account a ON a.id = sp.account_id
       WHERE sp.branch_id = $1 AND sp.deleted_at IS NULL AND sp.payment_date BETWEEN $2 AND $3
       ORDER BY sp.payment_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'Salaries paid', subtitle: period(c), empty: 'No salaries were paid in this period.',
      summary: [{ label: 'Salaries', value: sum(rows, 'amount'), type: 'money' }, { label: 'Payments', value: rows.length, type: 'number' }],
      columns: [col('date', 'Paid on', 'date'), col('staff', 'Staff'), col('period_start', 'From', 'date'), col('period_end', 'To', 'date'), col('account', 'Paid from'), col('amount', 'Amount', 'money')],
      rows, link: { to: '/accounting/salary', label: 'Open Salary' } }
  },
  fin_purchases: async (c) => {
    const { rows } = await query(
      `SELECT t.transaction_date::text AS date, t.description, a.name AS account, t.amount
       FROM transaction t JOIN account a ON a.id = t.account_id
       WHERE t.branch_id = $1 AND t.direction = 'out' AND t.transaction_type = 'payment_made' AND t.status = 'completed'
         AND t.deleted_at IS NULL AND t.transaction_date BETWEEN $2 AND $3
       ORDER BY t.transaction_date DESC LIMIT ${DETAIL_LIMIT}`, [c.branchId, c.from, c.to])
    return { title: 'Supplier payments', subtitle: period(c), empty: 'No supplier bills were paid in this period.',
      summary: [{ label: 'Paid to suppliers', value: sum(rows, 'amount'), type: 'money' }, { label: 'Payments', value: rows.length, type: 'number' }],
      columns: [col('date', 'Date', 'date'), col('description', 'Description'), col('account', 'Paid from'), col('amount', 'Amount', 'money')],
      rows, link: { to: '/inventory/orders', label: 'Open Purchasing' } }
  },
  fin_profit: async (c) => {
    const q = async (sql: string) => num((await query(sql, [c.branchId, c.from, c.to])).rows[0]?.t)
    const inv = (src: string) => q(`SELECT COALESCE(SUM(t.amount),0) AS t FROM transaction t JOIN invoice i ON t.reference_type = 'invoice' AND t.reference_id = i.id
      WHERE t.branch_id = $1 AND t.direction = 'in' AND t.status = 'completed' AND t.deleted_at IS NULL AND t.transaction_date BETWEEN $2 AND $3 AND ${SOURCE_SQL} = '${src}'`)
    const ref = (r: string) => q(`SELECT COALESCE(SUM(amount),0) AS t FROM transaction WHERE branch_id = $1 AND direction = 'in' AND status = 'completed' AND deleted_at IS NULL AND transaction_date BETWEEN $2 AND $3 AND reference_type = '${r}'`)
    const [hotel, rest, oth, rec, inc] = await Promise.all([inv('hotel'), inv('restaurant'), inv('other'), ref('receipt'), ref('other_income')])
    const exp = await q(`SELECT COALESCE(SUM(amount),0) AS t FROM expense_payment WHERE branch_id = $1 AND deleted_at IS NULL AND payment_date BETWEEN $2 AND $3`)
    const sal = await q(`SELECT COALESCE(SUM(amount),0) AS t FROM salary_payment WHERE branch_id = $1 AND deleted_at IS NULL AND payment_date BETWEEN $2 AND $3`)
    const pur = await q(`SELECT COALESCE(SUM(amount),0) AS t FROM transaction WHERE branch_id = $1 AND direction = 'out' AND transaction_type = 'payment_made' AND status = 'completed' AND deleted_at IS NULL AND transaction_date BETWEEN $2 AND $3`)
    const rows = [
      { section: 'income', line: 'Hotel guest payments', amount: hotel }, { section: 'income', line: 'Restaurant sales', amount: rest },
      { section: 'income', line: 'Other invoices', amount: oth }, { section: 'income', line: 'General receipts', amount: rec }, { section: 'income', line: 'Other income', amount: inc },
      { section: 'cost', line: 'Expenses', amount: exp }, { section: 'cost', line: 'Salaries', amount: sal }, { section: 'cost', line: 'Supplier payments', amount: pur },
    ]
    const revenue = hotel + rest + oth + rec + inc, costs = exp + sal + pur
    return { title: revenue - costs >= 0 ? 'Profit' : 'Loss', subtitle: `${period(c)} · cash basis — transfers between your own accounts are not counted`,
      empty: 'Nothing to report for this period.',
      summary: [{ label: 'Revenue', value: revenue, type: 'money' }, { label: 'Costs', value: costs, type: 'money' }, { label: revenue - costs >= 0 ? 'Profit' : 'Loss', value: revenue - costs, type: 'money' }],
      columns: [col('section', 'Type', 'status'), col('line', 'Line'), col('amount', 'Amount', 'money')], rows }
  },
  ar_aging: async (c) => {
    const { rows } = await query(
      `SELECT i.invoice_number, COALESCE(g.first_name || ' ' || g.last_name, '—') AS guest, i.invoice_date::text AS invoice_date,
              (CURRENT_DATE - i.invoice_date)::int AS age_days,
              CASE WHEN CURRENT_DATE - i.invoice_date <= 30 THEN '0–30' WHEN CURRENT_DATE - i.invoice_date <= 60 THEN '31–60'
                   WHEN CURRENT_DATE - i.invoice_date <= 90 THEN '61–90' ELSE '90+' END AS bucket,
              i.total_amount - i.amount_paid AS due
       FROM invoice i LEFT JOIN guest g ON g.id = i.guest_id
       WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status IN ('issued','partially_paid','overdue') AND i.total_amount > i.amount_paid
       ORDER BY i.invoice_date LIMIT ${DETAIL_LIMIT}`, [c.branchId])
    return { title: 'Guests owe you', subtitle: 'Unpaid invoices by age, as of today', empty: 'No guest invoices are unpaid.',
      summary: [{ label: 'Total owed', value: sum(rows, 'due'), type: 'money' }, { label: 'Invoices', value: rows.length, type: 'number' },
                { label: 'Over 60 days', value: sum(rows.filter((r: any) => r.age_days > 60), 'due'), type: 'money' }],
      columns: [col('invoice_number', 'Invoice'), col('guest', 'Guest'), col('invoice_date', 'Date', 'date'), col('age_days', 'Age (days)', 'number'), col('bucket', 'Bucket', 'status'), col('due', 'Due', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' } }
  },
  ap_aging: async (c) => {
    const { rows } = await query(
      `SELECT a.invoice_number, s.name AS supplier, a.invoice_date::text AS invoice_date, a.due_date::text AS due_date,
              (CURRENT_DATE - a.invoice_date)::int AS age_days,
              CASE WHEN CURRENT_DATE - a.invoice_date <= 30 THEN '0–30' WHEN CURRENT_DATE - a.invoice_date <= 60 THEN '31–60'
                   WHEN CURRENT_DATE - a.invoice_date <= 90 THEN '61–90' ELSE '90+' END AS bucket,
              a.total_amount - a.amount_paid AS due
       FROM ap_invoice a JOIN supplier s ON s.id = a.supplier_id
       WHERE a.branch_id = $1 AND a.deleted_at IS NULL AND a.status NOT IN ('paid','voided') AND a.total_amount > a.amount_paid
       ORDER BY a.invoice_date LIMIT ${DETAIL_LIMIT}`, [c.branchId])
    return { title: 'You owe suppliers', subtitle: 'Unpaid supplier bills by age, as of today', empty: 'No supplier bills are unpaid.',
      summary: [{ label: 'Total owed', value: sum(rows, 'due'), type: 'money' }, { label: 'Bills', value: rows.length, type: 'number' }],
      columns: [col('invoice_number', 'Bill'), col('supplier', 'Supplier'), col('invoice_date', 'Date', 'date'), col('due_date', 'Due', 'date'), col('age_days', 'Age (days)', 'number'), col('bucket', 'Bucket', 'status'), col('due', 'Payable', 'money')],
      rows, link: { to: '/inventory/orders', label: 'Open Purchasing' } }
  },
  cash_accounts: async (c) => {
    const { rows } = await query(
      `SELECT a.name, a.account_type, COALESCE(a.institution, '—') AS institution, COALESCE(a.account_number, '—') AS account_number,
              COALESCE(ab.balance, 0) AS balance,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'in'  AND t.transaction_date BETWEEN $3 AND $4), 0) AS money_in,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'out' AND t.transaction_date BETWEEN $3 AND $4), 0) AS money_out
       FROM account a LEFT JOIN account_balance ab ON ab.id = a.id
       LEFT JOIN transaction t ON t.account_id = a.id AND t.status = 'completed' AND t.deleted_at IS NULL
       WHERE a.organization_id = $1 AND (a.branch_id = $2 OR a.branch_id IS NULL) AND a.deleted_at IS NULL AND a.account_type IN ('cash','bank','mobile_money')
       GROUP BY a.id, ab.balance ORDER BY a.account_type, a.name`, [c.orgId, c.branchId, c.from, c.to])
    return { title: 'Cash, bank & mobile money', subtitle: `Balances now · movement ${period(c)}`, empty: 'No cash, bank or mobile-money accounts yet.',
      summary: [{ label: 'Total balance', value: sum(rows, 'balance'), type: 'money' }, { label: 'Accounts', value: rows.length, type: 'number' }],
      columns: [col('name', 'Account'), col('account_type', 'Type', 'status'), col('institution', 'Institution'), col('account_number', 'Number'),
                col('money_in', 'In', 'money'), col('money_out', 'Out', 'money'), col('balance', 'Balance', 'money')],
      rows, link: { to: '/accounting/accounts', label: 'Open Accounts' } }
  },
}

export async function getReportDetail(req: Request, res: Response) {
  const build = BUILDERS[req.params.kind]
  if (!build) return res.status(404).json({ success: false, message: 'Unknown report detail' })

  const { orgId, branchId } = req.auth!
  const to   = isDay(req.query.to)   ? req.query.to   : new Date().toISOString().slice(0, 10)
  const from = isDay(req.query.from) ? req.query.from : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  return res.json({ success: true, data: await build({ orgId, branchId, from, to }) })
}
