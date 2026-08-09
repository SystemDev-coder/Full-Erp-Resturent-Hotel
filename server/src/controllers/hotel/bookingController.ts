import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

export async function listBookings(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { status, date } = req.query
  const { limit, offset } = getPagination(req, 100)

  let sql = `
    SELECT b.id, b.booking_ref, b.check_in_date, b.check_out_date, b.num_nights,
           b.num_adults, b.num_children, b.rate_per_night,
           b.total_amount, b.status, b.source, b.breakfast_included,
           b.special_requests, b.created_at,
           g.first_name || ' ' || g.last_name AS guest_name, g.phone AS guest_phone,
           b.room_id, r.room_number, rt.name AS room_type_name
    FROM booking b
    JOIN guest g ON g.id = b.primary_guest_id
    JOIN room r ON r.id = b.room_id
    JOIN room_type rt ON rt.id = r.room_type_id
    WHERE b.branch_id = $1 AND b.deleted_at IS NULL`

  const params: any[] = [branchId]

  if (status) { params.push(status); sql += ` AND b.status = $${params.length}` }
  if (date)   { params.push(date);   sql += ` AND b.check_in_date = $${params.length}` }

  params.push(limit + 1, offset)
  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function getBooking(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT b.*, g.first_name || ' ' || g.last_name AS guest_name,
            r.room_number, rt.name AS room_type_name
     FROM booking b
     JOIN guest g ON g.id = b.primary_guest_id
     JOIN room r ON r.id = b.room_id
     JOIN room_type rt ON rt.id = r.room_type_id
     WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Booking not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createBooking(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const {
    room_id, primary_guest_id, rate_plan_id,
    check_in_date, check_out_date,
    num_adults = 1, num_children = 0,
    rate_per_night, breakfast_included = false,
    source = 'direct', special_requests,
    vat_rate = 0, service_charge_pct = 0,
  } = req.body

  if (!room_id || !primary_guest_id || !check_in_date || !check_out_date || !rate_per_night) {
    return res.status(400).json({ success: false, message: 'Missing required fields' })
  }

  const nights = Math.max(1,
    Math.ceil((new Date(check_out_date).getTime() - new Date(check_in_date).getTime()) / 86_400_000)
  )
  const subtotal       = Number(rate_per_night) * nights
  const vatAmount      = subtotal * (Number(vat_rate) / 100)
  const svcAmount      = subtotal * (Number(service_charge_pct) / 100)
  const totalAmount    = subtotal + vatAmount + svcAmount

  const ref = 'BK-' + Date.now().toString(36).toUpperCase()

  try {
    const { rows } = await query(
      `INSERT INTO booking
         (branch_id, room_id, rate_plan_id, primary_guest_id, booking_ref,
          check_in_date, check_out_date, num_adults, num_children,
          rate_per_night, subtotal, tax_amount, vat_rate, service_charge,
          total_amount, breakfast_included, source, special_requests, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id, booking_ref`,
      [branchId, room_id, rate_plan_id ?? null, primary_guest_id, ref,
       check_in_date, check_out_date, num_adults, num_children,
       rate_per_night, subtotal, vatAmount, vat_rate, svcAmount,
       totalAmount, breakfast_included, source, special_requests ?? null, userId]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    if (err.code === '23P01') {
      return res.status(409).json({ success: false, message: 'Room already booked for those dates' })
    }
    throw err
  }
}

export async function checkIn(req: Request, res: Response) {
  const { id } = req.params
  await query(
    `UPDATE booking SET status = 'checked_in', actual_check_in = NOW(), updated_by = $2 WHERE id = $1`,
    [id, req.auth!.userId]
  )
  await query(
    `UPDATE room SET status = 'occupied' WHERE id = (SELECT room_id FROM booking WHERE id = $1)`,
    [id]
  )
  return res.json({ success: true, message: 'Checked in' })
}

export async function checkOut(req: Request, res: Response) {
  const { id } = req.params
  await query(
    `UPDATE booking SET status = 'checked_out', actual_check_out = NOW(), updated_by = $2 WHERE id = $1`,
    [id, req.auth!.userId]
  )
  await query(
    `UPDATE room SET status = 'cleaning' WHERE id = (SELECT room_id FROM booking WHERE id = $1)`,
    [id]
  )
  return res.json({ success: true, message: 'Checked out — room moved to cleaning' })
}

// Move a guest to a different room mid-stay (or before check-in) — checks the
// target room isn't occupied/out of service, frees the old room (to cleaning
// if the guest was already checked in, since housekeeping still needs to
// service it), and relies on the booking table's date-range exclusion
// constraint to catch any overlap with another active booking in the target room.
export async function transferRoom(req: Request, res: Response) {
  const { id } = req.params
  const { room_id } = req.body
  if (!room_id) return res.status(400).json({ success: false, message: 'room_id is required' })

  const { rows: bookingRows } = await query(
    `SELECT room_id, status FROM booking WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  const booking = bookingRows[0]
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' })
  if (['cancelled', 'checked_out', 'no_show'].includes(booking.status)) {
    return res.status(409).json({ success: false, message: 'This booking is not active — cannot transfer room' })
  }
  if (booking.room_id === room_id) {
    return res.status(400).json({ success: false, message: 'Guest is already in this room' })
  }

  const { rows: roomRows } = await query(`SELECT status FROM room WHERE id = $1`, [room_id])
  if (!roomRows[0]) return res.status(404).json({ success: false, message: 'Target room not found' })
  if (roomRows[0].status !== 'available') {
    return res.status(409).json({
      success: false,
      message: `Room is not available — currently ${roomRows[0].status.replace(/_/g, ' ')}`,
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE booking SET room_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [room_id, req.auth!.userId, id]
    )
    await client.query(`UPDATE room SET status = 'occupied', updated_at = NOW() WHERE id = $1`, [room_id])
    // Only the currently-checked-in guest was actually occupying the old
    // room — a booking that hasn't checked in yet never marked it occupied.
    if (booking.status === 'checked_in') {
      await client.query(`UPDATE room SET status = 'cleaning', updated_at = NOW() WHERE id = $1`, [booking.room_id])
    }

    await client.query('COMMIT')
    return res.json({ success: true, message: 'Room transferred' })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23P01') {
      return res.status(409).json({ success: false, message: 'That room is already booked for these dates' })
    }
    throw err
  } finally {
    client.release()
  }
}

// Swap two active bookings' rooms with each other — unlike transferRoom,
// neither guest ever actually vacates a room (each moves straight into the
// other's), so there's no "is the target room available" check and no
// cleaning step. Both UPDATEs run in one transaction against a DEFERRED
// exclusion constraint (see index.ts) so the momentary state between the two
// writes — where the constraint would otherwise see two active bookings
// briefly sharing a room — isn't checked until COMMIT.
export async function exchangeRooms(req: Request, res: Response) {
  const { id } = req.params
  const { with_booking_id } = req.body
  if (!with_booking_id) return res.status(400).json({ success: false, message: 'with_booking_id is required' })
  if (with_booking_id === id) {
    return res.status(400).json({ success: false, message: 'Select two different bookings to exchange' })
  }

  const { rows } = await query(
    `SELECT id, room_id, status FROM booking WHERE id IN ($1, $2) AND deleted_at IS NULL`,
    [id, with_booking_id]
  )
  const a = rows.find((r: any) => r.id === id)
  const b = rows.find((r: any) => r.id === with_booking_id)
  if (!a || !b) return res.status(404).json({ success: false, message: 'One or both bookings were not found' })

  const inactive = ['cancelled', 'checked_out', 'no_show']
  if (inactive.includes(a.status) || inactive.includes(b.status)) {
    return res.status(409).json({ success: false, message: 'Both bookings must be active (confirmed or checked-in) to exchange rooms' })
  }
  if (a.room_id === b.room_id) {
    return res.status(400).json({ success: false, message: 'These bookings are already in the same room' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE booking SET room_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [b.room_id, req.auth!.userId, a.id]
    )
    await client.query(
      `UPDATE booking SET room_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [a.room_id, req.auth!.userId, b.id]
    )

    await client.query('COMMIT')
    return res.json({ success: true, message: 'Rooms exchanged' })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23P01') {
      return res.status(409).json({ success: false, message: 'These bookings have conflicting dates for a room swap' })
    }
    throw err
  } finally {
    client.release()
  }
}

export async function updateBooking(req: Request, res: Response) {
  const { id } = req.params
  const { check_in_date, check_out_date, rate_per_night, special_requests, num_adults, num_children } = req.body

  const { rows } = await query(
    `SELECT check_in_date, check_out_date, rate_per_night, subtotal, total_amount,
            num_adults, num_children, special_requests
     FROM booking WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Booking not found' })

  const b    = rows[0]
  const ci   = (check_in_date  ?? b.check_in_date).toString().slice(0, 10)
  const co   = (check_out_date ?? b.check_out_date).toString().slice(0, 10)
  const rate = Number(rate_per_night ?? b.rate_per_night)
  const nts  = Math.max(1, Math.ceil((new Date(co).getTime() - new Date(ci).getTime()) / 86_400_000))
  const sub  = rate * nts
  const prevSub = Number(b.subtotal)
  const total   = prevSub > 0 ? sub * (Number(b.total_amount) / prevSub) : sub

  await query(
    `UPDATE booking SET
       check_in_date    = $2,  check_out_date   = $3,
       rate_per_night   = $4,  subtotal         = $5,
       total_amount     = $6,  special_requests = $7,
       num_adults       = $8,  num_children     = $9,
       updated_at       = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, ci, co, rate, sub, total,
     special_requests !== undefined ? (special_requests || null) : (b.special_requests ?? null),
     num_adults !== undefined ? Number(num_adults) : (b.num_adults ?? 1),
     num_children !== undefined ? Number(num_children) : (b.num_children ?? 0)]
  )
  return res.json({ success: true })
}

export async function deleteBooking(req: Request, res: Response) {
  await query(
    `UPDATE booking SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  return res.json({ success: true })
}

export async function cancelBooking(req: Request, res: Response) {
  const { id } = req.params
  const { reason } = req.body
  await query(
    `UPDATE booking SET status = 'cancelled', cancellation_reason = $2,
     cancelled_at = NOW(), cancelled_by = $3 WHERE id = $1`,
    [id, reason ?? null, req.auth!.userId]
  )
  return res.json({ success: true, message: 'Booking cancelled' })
}