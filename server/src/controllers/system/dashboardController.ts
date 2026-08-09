import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function getDashboardStats(req: Request, res: Response) {
  const { branchId } = req.auth!
  const today = new Date().toISOString().split('T')[0]

  try {
    const [revenue, bookings, orders, occupancy] = await Promise.all([
      // Today's revenue
      query<{ total: string }>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM transaction
         WHERE branch_id = $1 AND transaction_date = $2
           AND direction = 'in' AND status = 'completed' AND deleted_at IS NULL`,
        [branchId, today]
      ),
      // Active bookings
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM booking
         WHERE branch_id = $1 AND status IN ('confirmed','checked_in') AND deleted_at IS NULL`,
        [branchId]
      ),
      // Today's restaurant orders
      query<{ count: string; revenue: string }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS revenue
         FROM order_header
         WHERE branch_id = $1 AND DATE(opened_at) = $2
           AND status NOT IN ('cancelled') AND deleted_at IS NULL`,
        [branchId, today]
      ),
      // Occupancy
      query<{ total: string; occupied: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'occupied') AS occupied
         FROM room r
         JOIN hotel h ON h.id = r.hotel_id
         WHERE h.branch_id = $1 AND r.deleted_at IS NULL`,
        [branchId]
      ),
    ])

    const totalRooms    = Number(occupancy.rows[0]?.total    ?? 0)
    const occupiedRooms = Number(occupancy.rows[0]?.occupied ?? 0)

    return res.json({
      success: true,
      data: {
        today_revenue:   Number(revenue.rows[0]?.total ?? 0),
        active_bookings: Number(bookings.rows[0]?.count ?? 0),
        order_count:     Number(orders.rows[0]?.count ?? 0),
        order_revenue:   Number(orders.rows[0]?.revenue ?? 0),
        total_rooms:     totalRooms,
        occupied_rooms:  occupiedRooms,
        occupancy_pct:   totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      },
    })
  } catch (err) {
    console.error('dashboard stats error:', err)
    return res.status(500).json({ success: false, message: 'Failed to load dashboard stats' })
  }
}

export async function getRevenueChart(req: Request, res: Response) {
  const { branchId } = req.auth!
  const days = Number(req.query.days ?? 7)

  try {
    const { rows } = await query(
      `SELECT
         DATE(transaction_date) AS date,
         COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'room_charge'),    0) AS hotel,
         COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'restaurant_charge'),0) AS restaurant
       FROM transaction
       WHERE branch_id = $1
         AND transaction_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         AND direction = 'in' AND status = 'completed' AND deleted_at IS NULL
       GROUP BY DATE(transaction_date)
       ORDER BY date`,
      [branchId, days - 1]
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load revenue chart' })
  }
}

// Live notifications for the navbar bell — built from real data, newest first
export async function getNotifications(req: Request, res: Response) {
  const { branchId } = req.auth!
  try {
    const [bookings, lowStock, orders, unpaid] = await Promise.all([
      // Bookings created in the last 24h
      query(
        `SELECT b.booking_ref, b.created_at, r.room_number,
                g.first_name || ' ' || g.last_name AS guest_name
         FROM booking b
         JOIN room r  ON r.id = b.room_id
         JOIN guest g ON g.id = b.primary_guest_id
         WHERE b.branch_id = $1 AND b.deleted_at IS NULL
           AND b.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY b.created_at DESC LIMIT 5`,
        [branchId]
      ),
      // Items at or below reorder level
      query(
        `SELECT i.name, i.unit_of_measure, sb.quantity_on_hand, sb.last_updated
         FROM stock_balance sb
         JOIN item i      ON i.id = sb.item_id
         JOIN warehouse w ON w.id = sb.warehouse_id
         WHERE w.branch_id = $1 AND sb.quantity_on_hand <= i.reorder_level AND i.deleted_at IS NULL
         ORDER BY sb.quantity_on_hand ASC LIMIT 5`,
        [branchId]
      ),
      // Restaurant orders opened in the last 6h
      query(
        `SELECT order_ref, total_amount, status, opened_at
         FROM order_header
         WHERE branch_id = $1 AND deleted_at IS NULL
           AND opened_at > NOW() - INTERVAL '6 hours'
         ORDER BY opened_at DESC LIMIT 5`,
        [branchId]
      ),
      // Unpaid guest invoices
      query(
        `SELECT invoice_number, total_amount - amount_paid AS due, updated_at
         FROM invoice
         WHERE branch_id = $1 AND deleted_at IS NULL
           AND status IN ('issued','partially_paid')
         ORDER BY updated_at DESC LIMIT 5`,
        [branchId]
      ),
    ])

    const items = [
      ...bookings.rows.map(b => ({
        kind: 'booking', link: '/hotel/bookings', at: b.created_at,
        text: `New booking ${b.booking_ref} — Room ${b.room_number}, ${b.guest_name}`,
      })),
      ...orders.rows.map(o => ({
        kind: 'order', link: '/restaurant/operations', at: o.opened_at,
        text: `Order ${o.order_ref} — $${Number(o.total_amount).toFixed(2)} (${o.status})`,
      })),
      ...unpaid.rows.map(i => ({
        kind: 'invoice', link: '/accounting/receipts', at: i.updated_at,
        text: `Invoice ${i.invoice_number} unpaid — $${Number(i.due).toFixed(2)} due`,
      })),
      ...lowStock.rows.map(s => ({
        kind: 'stock', link: '/inventory/items', at: s.last_updated,
        text: `Low stock: ${s.name} (${Number(s.quantity_on_hand)} ${s.unit_of_measure} left)`,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12)

    return res.json({ success: true, data: items })
  } catch (err) {
    console.error('notifications error:', err)
    return res.status(500).json({ success: false, message: 'Failed to load notifications' })
  }
}

export async function getOccupancySnapshot(req: Request, res: Response) {
  const { branchId } = req.auth!

  try {
    const { rows } = await query(
      `SELECT status, COUNT(*) AS count
       FROM room r
       JOIN hotel h ON h.id = r.hotel_id
       WHERE h.branch_id = $1 AND r.deleted_at IS NULL
       GROUP BY status`,
      [branchId]
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load occupancy' })
  }
}