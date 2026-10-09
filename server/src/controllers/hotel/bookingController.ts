import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { PoolClient } from 'pg'
import { query } from '../../db/pool'
import { withTx, HttpError, handleHttp as handle, round2, fail } from '../../utils/tx'
import { getPagination, sliceHasMore } from '../../utils/pagination'
import { logAudit } from '../../utils/audit'
import { notifyBookingCreated } from '../../utils/notifyHooks'

// ── Helpers ───────────────────────────────────────────────────────────────────

const INACTIVE = ['cancelled', 'checked_out', 'no_show']
const BLOCKED_ROOM_STATUSES = ['maintenance', 'out_of_order']

const todayStr = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Accepts 'YYYY-MM-DD' (or an ISO string starting with it); returns null if invalid.
function parseDate(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null
}

const nightsBetween = (ci: string, co: string) => Math.round((Date.parse(co) - Date.parse(ci)) / 86_400_000)

const pct = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

// Row-locked, branch-scoped booking lookup (dates as text to avoid JS Date/timezone drift).
async function lockBooking(c: PoolClient, id: string, branchId: string) {
  const { rows } = await c.query(
    `SELECT id, room_id, status, primary_guest_id, rate_per_night, subtotal, tax_amount,
            service_charge, discount_amount, vat_rate, num_adults, num_children, special_requests,
            to_char(check_in_date,  'YYYY-MM-DD') AS check_in_date,
            to_char(check_out_date, 'YYYY-MM-DD') AS check_out_date
     FROM booking
     WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL
     FOR UPDATE`,
    [id, branchId]
  )
  if (!rows[0]) throw new HttpError(404, 'Booking not found')
  return rows[0]
}

// ── Queries ───────────────────────────────────────────────────────────────────

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
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT b.*, g.first_name || ' ' || g.last_name AS guest_name,
            r.room_number, rt.name AS room_type_name,
            COALESCE((SELECT SUM(bs.line_total) FROM booking_service bs
                      WHERE bs.booking_id = b.id AND bs.deleted_at IS NULL), 0) AS services_total,
            COALESCE((SELECT SUM(i.amount_paid) FROM invoice i
                      WHERE i.booking_id = b.id AND i.status <> 'voided' AND i.deleted_at IS NULL), 0) AS amount_paid
     FROM booking b
     JOIN guest g ON g.id = b.primary_guest_id
     JOIN room r ON r.id = b.room_id
     JOIN room_type rt ON rt.id = r.room_type_id
     WHERE b.id = $1 AND b.branch_id = $2 AND b.deleted_at IS NULL`,
    [req.params.id, branchId]
  )
  if (!rows[0]) return fail(res, 404, 'Booking not found')
  const b = rows[0]
  const balance = round2(Number(b.total_amount) + Number(b.services_total) - Number(b.amount_paid))
  return res.json({ success: true, data: { ...b, balance_due: balance } })
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createBooking(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const {
    room_id, primary_guest_id, rate_plan_id,
    num_adults = 1, num_children = 0,
    rate_per_night, breakfast_included = false,
    source = 'direct', special_requests,
    vat_rate = 0, service_charge_pct = 0,
  } = req.body

  const ci = parseDate(req.body.check_in_date)
  const co = parseDate(req.body.check_out_date)
  if (!room_id || !primary_guest_id || !ci || !co || !rate_per_night) {
    return fail(res, 400, 'room_id, primary_guest_id, valid check-in/check-out dates and rate_per_night are required')
  }
  if (co <= ci) return fail(res, 400, 'Check-out date must be after check-in date')
  if (ci < todayStr()) return fail(res, 400, 'Check-in date cannot be in the past')

  const rate = Number(rate_per_night)
  if (!Number.isFinite(rate) || rate <= 0) return fail(res, 400, 'rate_per_night must be a positive number')
  const adults   = Number(num_adults)
  const children = Number(num_children)
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    return fail(res, 400, 'num_adults must be at least 1 and num_children cannot be negative')
  }

  // The room must belong to THIS branch's hotel and be bookable
  const { rows: roomRows } = await query(
    `SELECT r.status, rt.max_adults, rt.max_children
     FROM room r
     JOIN hotel h ON h.id = r.hotel_id
     JOIN room_type rt ON rt.id = r.room_type_id
     WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL`,
    [room_id, branchId]
  )
  const room = roomRows[0]
  if (!room) return fail(res, 404, 'Room not found in this branch')
  if (BLOCKED_ROOM_STATUSES.includes(room.status)) {
    return fail(res, 409, `Room is ${room.status.replace(/_/g, ' ')} and cannot be booked`)
  }
  if (adults > Number(room.max_adults) || children > Number(room.max_children)) {
    return fail(res, 400, `Room capacity exceeded (max ${room.max_adults} adults, ${room.max_children} children)`)
  }

  // The guest must belong to this organization and not be blacklisted
  const { rows: guestRows } = await query(
    `SELECT is_blacklisted FROM guest WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [primary_guest_id, orgId]
  )
  if (!guestRows[0]) return fail(res, 404, 'Guest not found')
  if (guestRows[0].is_blacklisted) return fail(res, 409, 'This guest is blacklisted and cannot be booked')

  if (rate_plan_id) {
    const { rows: rp } = await query(
      `SELECT 1 FROM rate_plan rp JOIN hotel h ON h.id = rp.hotel_id
       WHERE rp.id = $1 AND h.branch_id = $2 AND rp.deleted_at IS NULL`,
      [rate_plan_id, branchId]
    )
    if (!rp[0]) return fail(res, 404, 'Rate plan not found in this branch')
  }

  const nights    = nightsBetween(ci, co)
  const subtotal  = round2(rate * nights)
  const vatPct    = pct(vat_rate)
  const svcPct    = pct(service_charge_pct)
  const vatAmount = round2(subtotal * vatPct / 100)
  const svcAmount = round2(subtotal * svcPct / 100)
  const total     = round2(subtotal + vatAmount + svcAmount)

  const ref = 'BK-' + randomBytes(4).toString('hex').toUpperCase()

  const { rows } = await query(
    `INSERT INTO booking
       (branch_id, room_id, rate_plan_id, primary_guest_id, booking_ref,
        check_in_date, check_out_date, num_adults, num_children,
        rate_per_night, subtotal, tax_amount, vat_rate, service_charge,
        total_amount, breakfast_included, source, special_requests, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id, booking_ref`,
    [branchId, room_id, rate_plan_id ?? null, primary_guest_id, ref,
     ci, co, adults, children,
     rate, subtotal, vatAmount, vatPct, svcAmount,
     total, !!breakfast_included, source, special_requests ?? null, userId]
  )
  logAudit({ userId, branchId, action: 'BOOKING_CREATED', tableName: 'booking', recordId: rows[0].id, req,
    newValues: { room_id, primary_guest_id, check_in_date: ci, check_out_date: co, total } })
  notifyBookingCreated(rows[0].id)
  return res.status(201).json({ success: true, data: rows[0] })
}

// ── Check-in / check-out ──────────────────────────────────────────────────────

export async function checkIn(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  try {
    await withTx(async (c) => {
      const b = await lockBooking(c, req.params.id, branchId)
      if (!['pending', 'confirmed'].includes(b.status)) {
        throw new HttpError(409, `Cannot check in — booking is ${b.status.replace(/_/g, ' ')}`)
      }
      if (b.check_in_date > todayStr()) {
        throw new HttpError(409, `Too early — this booking arrives on ${b.check_in_date}`)
      }

      const { rows: [room] } = await c.query(`SELECT status FROM room WHERE id = $1 FOR UPDATE`, [b.room_id])
      if (room.status !== 'available') {
        throw new HttpError(409, `Room is not ready — currently ${room.status.replace(/_/g, ' ')}`)
      }
      const { rows: [guest] } = await c.query(`SELECT is_blacklisted FROM guest WHERE id = $1`, [b.primary_guest_id])
      if (guest?.is_blacklisted) throw new HttpError(409, 'This guest is blacklisted')

      await c.query(
        `UPDATE booking SET status = 'checked_in', actual_check_in = NOW(), updated_by = $2, updated_at = NOW() WHERE id = $1`,
        [b.id, userId]
      )
      await c.query(`UPDATE room SET status = 'occupied', updated_at = NOW() WHERE id = $1`, [b.room_id])
    })
    logAudit({ userId, branchId, action: 'BOOKING_CHECKED_IN', tableName: 'booking', recordId: req.params.id, req })
    return res.json({ success: true, message: 'Checked in' })
  } catch (err) { return handle(res, err) }
}

// Check-out. A guest who leaves BEFORE the booked departure date would otherwise keep the
// room blocked for the remaining nights (the booking still covers them), so the stay is
// shortened to the nights actually spent and the bill is recalculated. Because that changes
// what the guest pays, the client must confirm it first (early_ok) — without it the server
// answers 409 with the numbers so the screen can ask.
export async function checkOut(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const earlyOk = req.body?.early_ok === true
  try {
    const result = await withTx(async (c) => {
      const b = await lockBooking(c, req.params.id, branchId)
      if (b.status !== 'checked_in') {
        throw new HttpError(409, `Cannot check out — booking is ${b.status.replace(/_/g, ' ')}`)
      }

      const today = todayStr()
      let shortened: { from: string; to: string; nights: number; total: number } | null = null
      if (b.check_out_date > today) {
        // at least one night is always charged; never end before the arrival date
        const minOut = new Date(Date.parse(b.check_in_date) + 86_400_000).toISOString().slice(0, 10)
        const newOut = today > minOut ? today : minOut
        if (newOut < b.check_out_date) {
          const nights = nightsBetween(b.check_in_date, newOut)
          const sub = round2(Number(b.rate_per_night) * nights)
          const tax = round2(sub * Number(b.vat_rate) / 100)
          const svcPct = Number(b.subtotal) > 0 ? Number(b.service_charge) / Number(b.subtotal) : 0
          const svc = round2(sub * svcPct)
          const total = round2(sub + tax + svc - Number(b.discount_amount))
          if (!earlyOk) {
            throw new HttpError(409,
              `This guest booked until ${b.check_out_date}. Checking out now shortens the stay to ${nights} night${nights === 1 ? '' : 's'} and changes the room charge to $${total.toFixed(2)}.`,
              { code: 'early_checkout', booked_until: b.check_out_date, new_check_out: newOut, nights, new_total: total })
          }
          await c.query(
            `UPDATE booking SET check_out_date = $2, subtotal = $3, tax_amount = $4, service_charge = $5, total_amount = $6 WHERE id = $1`,
            [b.id, newOut, sub, tax, svc, total])
          shortened = { from: b.check_out_date, to: newOut, nights, total }
        }
      }

      await c.query(
        `UPDATE booking SET status = 'checked_out', actual_check_out = NOW(), updated_by = $2, updated_at = NOW() WHERE id = $1`,
        [b.id, userId]
      )
      await c.query(`UPDATE room SET status = 'cleaning', updated_at = NOW() WHERE id = $1`, [b.room_id])
      // Housekeeping is queued automatically so the room doesn't sit in "cleaning" with no task
      await c.query(
        `INSERT INTO housekeeping_task (room_id, booking_id, task_type, scheduled_for)
         VALUES ($1, $2, 'checkout_clean', CURRENT_DATE)`,
        [b.room_id, b.id]
      )

      const { rows: [f] } = await c.query(
        `SELECT b.total_amount
                + COALESCE((SELECT SUM(line_total) FROM booking_service WHERE booking_id = b.id AND deleted_at IS NULL), 0)
                - COALESCE((SELECT SUM(amount_paid) FROM invoice WHERE booking_id = b.id AND status <> 'voided' AND deleted_at IS NULL), 0)
                AS balance
         FROM booking b WHERE b.id = $1`,
        [b.id]
      )
      return { balance: round2(Number(f.balance)), shortened }
    })
    logAudit({ userId, branchId, action: 'BOOKING_CHECKED_OUT', tableName: 'booking', recordId: req.params.id, req,
      newValues: { balance_due: result.balance, shortened: result.shortened } })
    const { balance, shortened } = result
    return res.json({
      success: true,
      message: (shortened ? `Checked out early — stay shortened to ${shortened.nights} night${shortened.nights === 1 ? '' : 's'}. ` : 'Checked out — ')
        + (balance > 0 ? `Outstanding balance: ${balance.toFixed(2)}` : 'room moved to cleaning'),
      data: { balance_due: balance, shortened },
    })
  } catch (err) { return handle(res, err) }
}

// ── Transfer / exchange ───────────────────────────────────────────────────────

// Move a guest to a different room. A guest who is already checked in needs the
// target room physically free (and the old room goes to cleaning); a future
// booking only needs the target room to be bookable for its dates — room
// statuses are NOT touched until that guest actually checks in. The booking
// table's exclusion constraint rejects any date overlap in the target room.
export async function transferRoom(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { room_id } = req.body
  if (!room_id) return fail(res, 400, 'room_id is required')

  try {
    await withTx(async (c) => {
      const b = await lockBooking(c, req.params.id, branchId)
      if (INACTIVE.includes(b.status)) throw new HttpError(409, 'This booking is not active — cannot transfer room')
      if (b.room_id === room_id) throw new HttpError(400, 'Guest is already in this room')

      const { rows: [target] } = await c.query(
        `SELECT r.status FROM room r JOIN hotel h ON h.id = r.hotel_id
         WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL FOR UPDATE OF r`,
        [room_id, branchId]
      )
      if (!target) throw new HttpError(404, 'Target room not found in this branch')

      const inHouse = b.status === 'checked_in'
      if (inHouse ? target.status !== 'available' : BLOCKED_ROOM_STATUSES.includes(target.status)) {
        throw new HttpError(409, `Room is not available — currently ${target.status.replace(/_/g, ' ')}`)
      }

      await c.query(
        `UPDATE booking SET room_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
        [room_id, userId, b.id]
      )
      if (inHouse) {
        await c.query(`UPDATE room SET status = 'occupied', updated_at = NOW() WHERE id = $1`, [room_id])
        await c.query(`UPDATE room SET status = 'cleaning', updated_at = NOW() WHERE id = $1`, [b.room_id])
      }
    })
    logAudit({ userId, branchId, action: 'BOOKING_ROOM_TRANSFERRED', tableName: 'booking', recordId: req.params.id, req,
      newValues: { room_id } })
    return res.json({ success: true, message: 'Room transferred' })
  } catch (err) { return handle(res, err) }
}

// Swap two active bookings' rooms. Both UPDATEs run in one transaction against
// the DEFERRED exclusion constraint (see index.ts), so the momentary overlap
// between the two writes is only checked at COMMIT.
export async function exchangeRooms(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { id } = req.params
  const { with_booking_id } = req.body
  if (!with_booking_id) return fail(res, 400, 'with_booking_id is required')
  if (with_booking_id === id) return fail(res, 400, 'Select two different bookings to exchange')

  try {
    await withTx(async (c) => {
      // Lock in a stable order so two concurrent swaps can't deadlock
      const [first, second] = [id, with_booking_id].sort()
      const rowFirst  = await lockBooking(c, first,  branchId)
      const rowSecond = await lockBooking(c, second, branchId)
      const a = first === id ? rowFirst : rowSecond
      const b = first === id ? rowSecond : rowFirst

      if (INACTIVE.includes(a.status) || INACTIVE.includes(b.status)) {
        throw new HttpError(409, 'Both bookings must be active (confirmed or checked-in) to exchange rooms')
      }
      if (a.room_id === b.room_id) throw new HttpError(400, 'These bookings are already in the same room')

      await c.query(`UPDATE booking SET room_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [b.room_id, userId, a.id])
      await c.query(`UPDATE booking SET room_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [a.room_id, userId, b.id])

      // Only guests who are physically in-house change what a room looks like
      const aIn = a.status === 'checked_in'
      const bIn = b.status === 'checked_in'
      if (aIn !== bIn) {
        const setStatus = (roomId: string, status: string) =>
          c.query(`UPDATE room SET status = $1, updated_at = NOW() WHERE id = $2`, [status, roomId])
        // a now sits in b's old room, b in a's old room
        await setStatus(b.room_id, aIn ? 'occupied' : 'cleaning')
        await setStatus(a.room_id, bIn ? 'occupied' : 'cleaning')
      }
    })
    logAudit({ userId, branchId, action: 'BOOKING_ROOMS_EXCHANGED', tableName: 'booking', recordId: id, req,
      newValues: { with_booking_id } })
    return res.json({ success: true, message: 'Rooms exchanged' })
  } catch (err) { return handle(res, err) }
}

// ── Update / cancel / delete ──────────────────────────────────────────────────

export async function updateBooking(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { rate_per_night, special_requests, num_adults, num_children } = req.body

  try {
    await withTx(async (c) => {
      const b = await lockBooking(c, req.params.id, branchId)
      if (INACTIVE.includes(b.status)) {
        throw new HttpError(409, `A ${b.status.replace(/_/g, ' ')} booking cannot be edited`)
      }

      const ci = req.body.check_in_date  !== undefined ? parseDate(req.body.check_in_date)  : b.check_in_date
      const co = req.body.check_out_date !== undefined ? parseDate(req.body.check_out_date) : b.check_out_date
      if (!ci || !co) throw new HttpError(400, 'Invalid check-in or check-out date')
      if (co <= ci) throw new HttpError(400, 'Check-out date must be after check-in date')
      if (b.status === 'checked_in' && ci !== b.check_in_date) {
        throw new HttpError(409, 'The check-in date of a guest who is already in-house cannot be changed')
      }
      if (b.status !== 'checked_in' && ci !== b.check_in_date && ci < todayStr()) {
        throw new HttpError(400, 'Check-in date cannot be in the past')
      }

      const rate = Number(rate_per_night ?? b.rate_per_night)
      if (!Number.isFinite(rate) || rate <= 0) throw new HttpError(400, 'rate_per_night must be a positive number')
      const adults   = num_adults   !== undefined ? Number(num_adults)   : Number(b.num_adults)
      const children = num_children !== undefined ? Number(num_children) : Number(b.num_children)
      if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
        throw new HttpError(400, 'num_adults must be at least 1 and num_children cannot be negative')
      }

      const { rows: [cap] } = await c.query(
        `SELECT rt.max_adults, rt.max_children FROM room r JOIN room_type rt ON rt.id = r.room_type_id WHERE r.id = $1`,
        [b.room_id]
      )
      if (adults > Number(cap.max_adults) || children > Number(cap.max_children)) {
        throw new HttpError(400, `Room capacity exceeded (max ${cap.max_adults} adults, ${cap.max_children} children)`)
      }

      // Recompute the money from the booking's own stored rates — tax and
      // service charge were previously left stale when dates/rate changed.
      const prevSub = Number(b.subtotal)
      const svcPct  = prevSub > 0 ? Number(b.service_charge) / prevSub : 0
      const sub     = round2(rate * nightsBetween(ci, co))
      const tax     = round2(sub * Number(b.vat_rate) / 100)
      const svc     = round2(sub * svcPct)
      const total   = round2(sub + tax + svc - Number(b.discount_amount))

      await c.query(
        `UPDATE booking SET
           check_in_date = $2, check_out_date = $3, rate_per_night = $4,
           subtotal = $5, tax_amount = $6, service_charge = $7, total_amount = $8,
           special_requests = $9, num_adults = $10, num_children = $11,
           updated_by = $12, updated_at = NOW()
         WHERE id = $1`,
        [b.id, ci, co, rate, sub, tax, svc, total,
         special_requests !== undefined ? (special_requests || null) : (b.special_requests ?? null),
         adults, children, userId]
      )
    })
    logAudit({ userId, branchId, action: 'BOOKING_UPDATED', tableName: 'booking', recordId: req.params.id, req,
      newValues: { check_in_date: req.body.check_in_date, check_out_date: req.body.check_out_date, rate_per_night } })
    return res.json({ success: true })
  } catch (err) { return handle(res, err) }
}

export async function cancelBooking(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null
  try {
    await withTx(async (c) => {
      const b = await lockBooking(c, req.params.id, branchId)
      if (!['pending', 'confirmed'].includes(b.status)) {
        throw new HttpError(409,
          b.status === 'checked_in'
            ? 'A guest who is checked in cannot be cancelled — check them out instead'
            : `Booking is already ${b.status.replace(/_/g, ' ')}`)
      }
      await c.query(
        `UPDATE booking SET status = 'cancelled', cancellation_reason = $2,
                cancelled_at = NOW(), cancelled_by = $3, updated_by = $3, updated_at = NOW()
         WHERE id = $1`,
        [b.id, reason, userId]
      )
    })
    logAudit({ userId, branchId, action: 'BOOKING_CANCELLED', tableName: 'booking', recordId: req.params.id, req,
      newValues: { reason } })
    return res.json({ success: true, message: 'Booking cancelled' })
  } catch (err) { return handle(res, err) }
}

// Soft delete is only for bookings that never became a stay — anything that was
// checked in/out must stay on record for the guest's folio and the audit trail.
export async function deleteBooking(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  try {
    await withTx(async (c) => {
      const b = await lockBooking(c, req.params.id, branchId)
      if (['checked_in', 'checked_out'].includes(b.status)) {
        throw new HttpError(409, 'A booking that has been checked in cannot be deleted')
      }
      await c.query(
        `UPDATE booking SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
        [b.id, userId]
      )
    })
    logAudit({ userId, branchId, action: 'BOOKING_DELETED', tableName: 'booking', recordId: req.params.id, req })
    return res.json({ success: true })
  } catch (err) { return handle(res, err) }
}
