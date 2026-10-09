import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { col, DETAIL_LIMIT, type DetailPayload } from '../../utils/detail'

// One round-trip for the whole dashboard. Every number here is real: nothing is a
// placeholder and nothing is compared against a made-up baseline — deltas are
// today vs yesterday, or absent when there is nothing to compare with.
//
//   Collected  = money actually received today (invoice payments in the ledger)
//   Room rev.  = what in-house stays earn per night (accrual — hotel bookings are
//                not paid through the ledger yet, so "collected" alone would hide them)
//   Sales      = restaurant invoices issued today (what was sold, paid or not)

const num = (v: unknown) => Number(v ?? 0)
const pctChange = (now: number, before: number): number | null =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null

const SOURCE_SQL = `CASE WHEN i.order_id IS NOT NULL THEN 'restaurant'
                         WHEN i.booking_id IS NOT NULL THEN 'hotel' ELSE 'other' END`

export async function getDashboardSummary(req: Request, res: Response) {
  const { branchId } = req.auth!

  const [days, collected, rooms, roomRevenue, sales, orderCounts, flow, hk, outstanding, lowStock,
         recentBookings, recentOrders, topItems, hkList] = await Promise.all([
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS d FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day') d ORDER BY d`),

    query(
      `SELECT t.transaction_date::text AS d, ${SOURCE_SQL} AS source, COALESCE(SUM(t.amount), 0) AS total
       FROM transaction t
       JOIN invoice i ON t.reference_type = 'invoice' AND t.reference_id = i.id
       WHERE t.branch_id = $1 AND t.direction = 'in' AND t.status = 'completed' AND t.deleted_at IS NULL
         AND t.transaction_date BETWEEN CURRENT_DATE - 6 AND CURRENT_DATE
       GROUP BY 1, 2`, [branchId]),

    query(
      `SELECT r.status, COUNT(*) AS count FROM room r JOIN hotel h ON h.id = r.hotel_id
       WHERE h.branch_id = $1 AND r.deleted_at IS NULL GROUP BY r.status`, [branchId]),

    query(
      `SELECT
         COALESCE(SUM(rate_per_night) FILTER (WHERE check_in_date <= CURRENT_DATE     AND check_out_date > CURRENT_DATE),     0) AS today,
         COALESCE(SUM(rate_per_night) FILTER (WHERE check_in_date <= CURRENT_DATE - 1 AND check_out_date > CURRENT_DATE - 1), 0) AS yesterday
       FROM booking WHERE branch_id = $1 AND deleted_at IS NULL AND status IN ('checked_in','checked_out')`, [branchId]),

    query(
      `SELECT
         COALESCE(SUM(total_amount) FILTER (WHERE invoice_date = CURRENT_DATE),     0) AS today,
         COALESCE(SUM(total_amount) FILTER (WHERE invoice_date = CURRENT_DATE - 1), 0) AS yesterday,
         COUNT(*) FILTER (WHERE invoice_date = CURRENT_DATE)                           AS invoices_today
       FROM invoice WHERE branch_id = $1 AND order_id IS NOT NULL AND deleted_at IS NULL AND status <> 'voided'`, [branchId]),

    query(
      `SELECT
         COUNT(*) FILTER (WHERE opened_at::date = CURRENT_DATE     AND status <> 'cancelled') AS today,
         COUNT(*) FILTER (WHERE opened_at::date = CURRENT_DATE - 1 AND status <> 'cancelled') AS yesterday,
         COUNT(*) FILTER (WHERE status IN ('open','preparing','ready','served'))              AS live
       FROM order_header WHERE branch_id = $1 AND deleted_at IS NULL`, [branchId]),

    query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND check_in_date = CURRENT_DATE)  AS arrivals,
         COUNT(*) FILTER (WHERE status = 'checked_in' AND check_out_date <= CURRENT_DATE)            AS departures,
         COUNT(*) FILTER (WHERE status = 'checked_in')                                               AS in_house
       FROM booking WHERE branch_id = $1 AND deleted_at IS NULL`, [branchId]),

    query(
      `SELECT hk.status, COUNT(*) AS count
       FROM housekeeping_task hk JOIN room r ON r.id = hk.room_id JOIN hotel h ON h.id = r.hotel_id
       WHERE h.branch_id = $1 AND hk.scheduled_for = CURRENT_DATE AND hk.deleted_at IS NULL GROUP BY hk.status`, [branchId]),

    query(
      `SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS due, COUNT(*) AS count FROM invoice
       WHERE branch_id = $1 AND deleted_at IS NULL AND status IN ('issued','partially_paid','overdue')`, [branchId]),

    query(
      `SELECT COUNT(*) AS n FROM stock_balance sb JOIN item i ON i.id = sb.item_id JOIN warehouse w ON w.id = sb.warehouse_id
       WHERE w.branch_id = $1 AND i.deleted_at IS NULL AND sb.quantity_on_hand <= i.reorder_level`, [branchId]),

    query(
      `SELECT b.id, b.booking_ref, b.status, b.check_in_date::text AS check_in_date, b.check_out_date::text AS check_out_date,
              b.total_amount, g.first_name || ' ' || g.last_name AS guest_name, r.room_number
       FROM booking b JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 6`, [branchId]),

    query(
      `SELECT o.id, o.order_ref, o.status, o.total_amount, o.opened_at, t.table_number, o.order_type
       FROM order_header o LEFT JOIN dining_table t ON t.id = o.dining_table_id
       WHERE o.branch_id = $1 AND o.deleted_at IS NULL ORDER BY o.opened_at DESC LIMIT 6`, [branchId]),

    query(
      `SELECT ol.item_name_snap AS name, SUM(ol.quantity)::int AS qty, SUM(ol.line_total) AS revenue
       FROM order_line ol JOIN order_header o ON o.id = ol.order_id
       WHERE o.branch_id = $1 AND o.deleted_at IS NULL AND o.opened_at::date = CURRENT_DATE
         AND o.status <> 'cancelled' AND ol.status <> 'cancelled' AND ol.deleted_at IS NULL
       GROUP BY ol.item_name_snap ORDER BY qty DESC, revenue DESC LIMIT 5`, [branchId]),

    query(
      `SELECT hk.id, hk.task_type, hk.status, r.room_number, s.first_name || ' ' || s.last_name AS assigned_to_name
       FROM housekeeping_task hk JOIN room r ON r.id = hk.room_id JOIN hotel h ON h.id = r.hotel_id
       LEFT JOIN staff s ON s.id = hk.assigned_to
       WHERE h.branch_id = $1 AND hk.scheduled_for = CURRENT_DATE AND hk.deleted_at IS NULL
       ORDER BY hk.status, r.room_number LIMIT 6`, [branchId]),
  ])

  // 7-day series, zero-filled
  const dayList: string[] = days.rows.map((r: any) => r.d)
  const today = dayList[dayList.length - 1]
  const yesterday = dayList[dayList.length - 2]
  const cell = (d: string, s: string) =>
    num(collected.rows.find((r: any) => r.d === d && r.source === s)?.total)
  const series = dayList.map(d => ({
    date: d, hotel: cell(d, 'hotel'), restaurant: cell(d, 'restaurant'), other: cell(d, 'other'),
  }))
  const dayTotal = (d: string) => cell(d, 'hotel') + cell(d, 'restaurant') + cell(d, 'other')

  const roomCounts = Object.fromEntries(rooms.rows.map((r: any) => [r.status, num(r.count)])) as Record<string, number>
  const totalRooms = Object.values(roomCounts).reduce((a, b) => a + b, 0)
  const occupied   = roomCounts.occupied ?? 0

  const hkCounts = Object.fromEntries(hk.rows.map((r: any) => [r.status, num(r.count)])) as Record<string, number>
  const hkOpen   = (hkCounts.pending ?? 0) + (hkCounts.in_progress ?? 0)

  const salesToday = num(sales.rows[0].today)
  const invoicesToday = num(sales.rows[0].invoices_today)

  return res.json({
    success: true,
    data: {
      generated_at: new Date().toISOString(),
      today, yesterday,
      collected: {
        today: dayTotal(today), yesterday: dayTotal(yesterday),
        delta: pctChange(dayTotal(today), dayTotal(yesterday)),
        hotel: cell(today, 'hotel'), restaurant: cell(today, 'restaurant'), other: cell(today, 'other'),
      },
      room_revenue: {
        today: num(roomRevenue.rows[0].today), yesterday: num(roomRevenue.rows[0].yesterday),
        delta: pctChange(num(roomRevenue.rows[0].today), num(roomRevenue.rows[0].yesterday)),
      },
      restaurant: {
        sales_today: salesToday, sales_yesterday: num(sales.rows[0].yesterday),
        sales_delta: pctChange(salesToday, num(sales.rows[0].yesterday)),
        orders_today: num(orderCounts.rows[0].today), orders_yesterday: num(orderCounts.rows[0].yesterday),
        orders_delta: pctChange(num(orderCounts.rows[0].today), num(orderCounts.rows[0].yesterday)),
        live_orders: num(orderCounts.rows[0].live),
        avg_ticket: invoicesToday > 0 ? Math.round((salesToday / invoicesToday) * 100) / 100 : 0,
      },
      rooms: {
        total: totalRooms, occupied,
        occupancy_pct: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0,
        by_status: Object.entries(roomCounts).map(([status, count]) => ({ status, count })),
        arrivals: num(flow.rows[0].arrivals), departures: num(flow.rows[0].departures), in_house: num(flow.rows[0].in_house),
      },
      housekeeping: { open: hkOpen, done: (hkCounts.completed ?? 0) + (hkCounts.inspected ?? 0), tasks: hkList.rows },
      outstanding: { due: num(outstanding.rows[0].due), count: num(outstanding.rows[0].count) },
      low_stock: num(lowStock.rows[0].n),
      series,
      top_items: topItems.rows.map((r: any) => ({ name: r.name, qty: num(r.qty), revenue: num(r.revenue) })),
      recent_bookings: recentBookings.rows,
      recent_orders: recentOrders.rows,
    },
  })
}

// ─── Click-through details ─────────────────────────────────────────────────────

type Builder = (branchId: string) => Promise<DetailPayload>

const orderCols = [
  col('order_ref', 'Order'), col('table_number', 'Table'), col('order_type', 'Type'),
  col('status', 'Status', 'status'), col('total_amount', 'Total', 'money'), col('opened_at', 'Opened', 'datetime'),
]

const BUILDERS: Record<string, Builder> = {
  // Cash actually received — today first, then the 6 days before, so the card is never a blank
  // page on a quiet day
  revenue: async (branchId) => {
    const { rows } = await query(
      `SELECT t.transaction_date::text AS date, (t.transaction_date = CURRENT_DATE) AS is_today,
              t.created_at, i.invoice_number, ${SOURCE_SQL} AS source, i.payment_method, t.amount,
              COALESCE(g.first_name || ' ' || g.last_name, '—') AS guest
       FROM transaction t
       JOIN invoice i ON t.reference_type = 'invoice' AND t.reference_id = i.id
       LEFT JOIN guest g ON g.id = i.guest_id
       WHERE t.branch_id = $1 AND t.direction = 'in' AND t.status = 'completed' AND t.deleted_at IS NULL
         AND t.transaction_date BETWEEN CURRENT_DATE - 6 AND CURRENT_DATE
       ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT ${DETAIL_LIMIT}`, [branchId])
    const sumOf = (list: any[]) => list.reduce((a: number, r: any) => a + num(r.amount), 0)
    const today = rows.filter((r: any) => r.is_today)
    return {
      title: 'Money collected', subtitle: 'Payments received into your accounts — today first, then the previous 6 days',
      empty: 'No payments were received in the last 7 days.',
      summary: [
        { label: 'Today', value: sumOf(today), type: 'money' },
        { label: 'Last 7 days', value: sumOf(rows), type: 'money' },
        { label: 'Restaurant (7d)', value: sumOf(rows.filter((r: any) => r.source === 'restaurant')), type: 'money' },
        { label: 'Hotel (7d)', value: sumOf(rows.filter((r: any) => r.source === 'hotel')), type: 'money' },
      ],
      columns: [col('date', 'Date', 'date'), col('created_at', 'Time', 'datetime'), col('invoice_number', 'Invoice'), col('guest', 'Guest'),
                col('source', 'Source', 'status'), col('payment_method', 'Method', 'status'), col('amount', 'Amount', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' },
    }
  },

  // In-house stays earning tonight
  room_revenue: async (branchId) => {
    const { rows } = await query(
      `SELECT b.booking_ref, g.first_name || ' ' || g.last_name AS guest, r.room_number, b.status,
              b.check_in_date::text AS check_in_date, b.check_out_date::text AS check_out_date, b.rate_per_night
       FROM booking b JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL AND b.status IN ('checked_in','checked_out')
         AND b.check_in_date <= CURRENT_DATE AND b.check_out_date > CURRENT_DATE
       ORDER BY r.room_number LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'No guests are in-house tonight.', title: 'Room revenue today', subtitle: 'Nightly rate of every stay that includes tonight',
      summary: [
        { label: 'Room revenue', value: rows.reduce((a: number, r: any) => a + num(r.rate_per_night), 0), type: 'money' },
        { label: 'Rooms', value: rows.length, type: 'number' },
      ],
      columns: [col('booking_ref', 'Booking'), col('guest', 'Guest'), col('room_number', 'Room'),
                col('check_in_date', 'Check-in', 'date'), col('check_out_date', 'Check-out', 'date'),
                col('status', 'Status', 'status'), col('rate_per_night', 'Rate / night', 'money')],
      rows, link: { to: '/hotel/bookings', label: 'Open Bookings' },
    }
  },

  // Restaurant orders — last 7 days (today first)
  sales: async (branchId) => {
    const { rows } = await query(
      `SELECT o.order_ref, t.table_number, o.order_type, o.status, o.total_amount, o.opened_at,
              (o.opened_at::date = CURRENT_DATE) AS is_today
       FROM order_header o LEFT JOIN dining_table t ON t.id = o.dining_table_id
       WHERE o.branch_id = $1 AND o.deleted_at IS NULL AND o.opened_at::date BETWEEN CURRENT_DATE - 6 AND CURRENT_DATE
         AND o.status <> 'cancelled'
       ORDER BY o.opened_at DESC LIMIT ${DETAIL_LIMIT}`, [branchId])
    const value = (list: any[]) => list.reduce((a: number, r: any) => a + num(r.total_amount), 0)
    const today = rows.filter((r: any) => r.is_today)
    return {
      title: 'Restaurant orders', subtitle: 'Today first, then the previous 6 days (cancelled orders excluded)',
      empty: 'No restaurant orders in the last 7 days.',
      summary: [
        { label: 'Orders today', value: today.length, type: 'number' },
        { label: 'Value today', value: value(today), type: 'money' },
        { label: 'Orders (7d)', value: rows.length, type: 'number' },
        { label: 'Value (7d)', value: value(rows), type: 'money' },
      ],
      columns: orderCols, rows, link: { to: '/restaurant/operations', label: 'Open Orders & Tables' },
    }
  },

  orders_open: async (branchId) => {
    const { rows } = await query(
      `SELECT o.order_ref, t.table_number, o.order_type, o.status, o.total_amount, o.opened_at
       FROM order_header o LEFT JOIN dining_table t ON t.id = o.dining_table_id
       WHERE o.branch_id = $1 AND o.deleted_at IS NULL AND o.status IN ('open','preparing','ready','served')
       ORDER BY o.opened_at LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'No orders are in progress — everything has been billed.', title: 'Orders in progress', subtitle: 'Not yet billed',
      summary: [{ label: 'Open orders', value: rows.length, type: 'number' }],
      columns: orderCols, rows, link: { to: '/restaurant/operations', label: 'Open Orders & Tables' },
    }
  },

  occupancy: async (branchId) => {
    const { rows } = await query(
      `SELECT r.room_number, rt.name AS room_type, r.floor, r.status,
              g.first_name || ' ' || g.last_name AS guest, b.check_out_date::text AS check_out_date
       FROM room r
       JOIN hotel h ON h.id = r.hotel_id JOIN room_type rt ON rt.id = r.room_type_id
       LEFT JOIN booking b ON b.room_id = r.id AND b.status = 'checked_in' AND b.deleted_at IS NULL
       LEFT JOIN guest g ON g.id = b.primary_guest_id
       WHERE h.branch_id = $1 AND r.deleted_at IS NULL
       ORDER BY r.floor, r.room_number LIMIT ${DETAIL_LIMIT}`, [branchId])
    const count = (s: string) => rows.filter((r: any) => r.status === s).length
    return {
      empty: 'No rooms have been set up yet.', title: 'Rooms right now', subtitle: 'Live status of every room',
      summary: [
        { label: 'Occupied', value: count('occupied'), type: 'number' },
        { label: 'Available', value: count('available'), type: 'number' },
        { label: 'Cleaning', value: count('cleaning'), type: 'number' },
        { label: 'Out of service', value: count('maintenance') + count('out_of_order'), type: 'number' },
      ],
      columns: [col('room_number', 'Room'), col('room_type', 'Type'), col('floor', 'Floor', 'number'),
                col('status', 'Status', 'status'), col('guest', 'Guest'), col('check_out_date', 'Check-out', 'date')],
      rows, link: { to: '/hotel/rooms', label: 'Open Rooms' },
    }
  },

  arrivals: async (branchId) => {
    const { rows } = await query(
      `SELECT b.booking_ref, g.first_name || ' ' || g.last_name AS guest, g.phone, r.room_number, b.status,
              b.check_out_date::text AS check_out_date, b.num_adults, b.num_children
       FROM booking b JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL AND b.status IN ('pending','confirmed') AND b.check_in_date = CURRENT_DATE
       ORDER BY r.room_number LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'No arrivals are expected today.', title: 'Arrivals today', subtitle: 'Guests due to check in',
      summary: [{ label: 'Arrivals', value: rows.length, type: 'number' }],
      columns: [col('booking_ref', 'Booking'), col('guest', 'Guest'), col('phone', 'Phone'), col('room_number', 'Room'),
                col('num_adults', 'Adults', 'number'), col('check_out_date', 'Departs', 'date'), col('status', 'Status', 'status')],
      rows, link: { to: '/hotel/bookings', label: 'Open Bookings' },
    }
  },

  departures: async (branchId) => {
    const { rows } = await query(
      `SELECT b.booking_ref, g.first_name || ' ' || g.last_name AS guest, g.phone, r.room_number,
              b.check_out_date::text AS check_out_date, b.total_amount
       FROM booking b JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL AND b.status = 'checked_in' AND b.check_out_date <= CURRENT_DATE
       ORDER BY r.room_number LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'No departures are due today.', title: 'Departures today', subtitle: 'In-house guests due to check out',
      summary: [{ label: 'Departures', value: rows.length, type: 'number' }],
      columns: [col('booking_ref', 'Booking'), col('guest', 'Guest'), col('phone', 'Phone'), col('room_number', 'Room'),
                col('check_out_date', 'Check-out', 'date'), col('total_amount', 'Stay total', 'money')],
      rows, link: { to: '/hotel/bookings', label: 'Open Bookings' },
    }
  },

  housekeeping: async (branchId) => {
    const { rows } = await query(
      `SELECT r.room_number, hk.task_type, hk.status, s.first_name || ' ' || s.last_name AS assigned_to
       FROM housekeeping_task hk JOIN room r ON r.id = hk.room_id JOIN hotel h ON h.id = r.hotel_id
       LEFT JOIN staff s ON s.id = hk.assigned_to
       WHERE h.branch_id = $1 AND hk.scheduled_for = CURRENT_DATE AND hk.deleted_at IS NULL
       ORDER BY hk.status, r.room_number LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'No cleaning tasks are scheduled for today.', title: "Today's housekeeping", subtitle: 'Cleaning tasks scheduled for today',
      summary: [
        { label: 'Open', value: rows.filter((r: any) => ['pending', 'in_progress'].includes(r.status)).length, type: 'number' },
        { label: 'Done', value: rows.filter((r: any) => ['completed', 'inspected'].includes(r.status)).length, type: 'number' },
      ],
      columns: [col('room_number', 'Room'), col('task_type', 'Task', 'status'), col('assigned_to', 'Assigned to'), col('status', 'Status', 'status')],
      rows, link: { to: '/hotel/housekeeping', label: 'Open Housekeeping' },
    }
  },

  outstanding: async (branchId) => {
    const { rows } = await query(
      `SELECT i.invoice_number, COALESCE(g.first_name || ' ' || g.last_name, '—') AS guest, i.invoice_date::text AS invoice_date,
              i.status, i.total_amount, i.amount_paid, i.total_amount - i.amount_paid AS due
       FROM invoice i LEFT JOIN guest g ON g.id = i.guest_id
       WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status IN ('issued','partially_paid','overdue')
       ORDER BY i.invoice_date LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'Great — no guest invoices are unpaid.', title: 'Unpaid invoices', subtitle: 'Money guests still owe',
      summary: [
        { label: 'Outstanding', value: rows.reduce((a: number, r: any) => a + num(r.due), 0), type: 'money' },
        { label: 'Invoices', value: rows.length, type: 'number' },
      ],
      columns: [col('invoice_number', 'Invoice'), col('guest', 'Guest'), col('invoice_date', 'Date', 'date'),
                col('status', 'Status', 'status'), col('total_amount', 'Total', 'money'), col('amount_paid', 'Paid', 'money'), col('due', 'Due', 'money')],
      rows, link: { to: '/accounting/receipts', label: 'Open Receipts' },
    }
  },

  stock: async (branchId) => {
    const { rows } = await query(
      `SELECT i.name, i.sku, w.name AS warehouse, sb.quantity_on_hand, i.reorder_level, i.unit_of_measure
       FROM stock_balance sb JOIN item i ON i.id = sb.item_id JOIN warehouse w ON w.id = sb.warehouse_id
       WHERE w.branch_id = $1 AND i.deleted_at IS NULL AND sb.quantity_on_hand <= i.reorder_level
       ORDER BY sb.quantity_on_hand LIMIT ${DETAIL_LIMIT}`, [branchId])
    return {
      empty: 'All stock is above its reorder level.', title: 'Low stock', subtitle: 'At or below the reorder level',
      summary: [{ label: 'Items', value: rows.length, type: 'number' }],
      columns: [col('name', 'Item'), col('sku', 'SKU'), col('warehouse', 'Warehouse'),
                col('quantity_on_hand', 'On hand', 'number'), col('reorder_level', 'Reorder at', 'number'), col('unit_of_measure', 'Unit')],
      rows, link: { to: '/inventory/items', label: 'Open Inventory' },
    }
  },
}

export async function getDashboardDetail(req: Request, res: Response) {
  const build = BUILDERS[req.params.kind]
  if (!build) return res.status(404).json({ success: false, message: 'Unknown detail view' })
  return res.json({ success: true, data: await build(req.auth!.branchId) })
}
