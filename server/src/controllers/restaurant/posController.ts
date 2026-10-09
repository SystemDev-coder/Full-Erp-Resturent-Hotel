import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'

// ─── POS staff login (waiter/cashier PIN) ─────────────────────────────────────

// Staff shown on the POS lock screen — waiters, cashiers, and managers
const POS_ROLES = ['waiter', 'cashier', 'bar_staff', 'manager', 'branch_manager']

export async function listPosStaff(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  // "is_me": the staff profile that belongs to the person signed in to the system (same email, phone or full name),
  // so the POS can open straight on their PIN pad instead of asking "who is working?"
  const { rows } = await query(
    `SELECT s.id, s.first_name, s.last_name, s.role, s.employee_id,
            (s.pos_pin IS NOT NULL) AS has_pin,
            (u.id IS NOT NULL AND (
               (s.email IS NOT NULL AND lower(s.email) = lower(u.email))
            OR (length(regexp_replace(COALESCE(s.phone, ''), '\\D', '', 'g')) >= 7
                AND right(regexp_replace(COALESCE(s.phone, ''), '\\D', '', 'g'), 9) = right(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 9))
            OR lower(trim(s.first_name || ' ' || s.last_name)) = lower(trim(u.full_name))
            )) AS is_me
     FROM staff s LEFT JOIN users u ON u.id = $3
     WHERE s.branch_id = $1 AND s.is_active = TRUE AND s.deleted_at IS NULL
       AND s.role = ANY($2)
     ORDER BY s.first_name`,
    [branchId, POS_ROLES, userId]
  )
  return res.json({ success: true, data: rows })
}

// "My sales today" for the POS chip: what this person has collected, and how many orders
export async function getMySales(req: Request, res: Response) {
  const { branchId } = req.auth!
  const staffId = String(req.query.staff_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) return res.status(400).json({ success: false, message: 'staff_id is required' })
  const { rows: [r] } = await query(
    `SELECT COALESCE(SUM(amount), 0) AS collected, COUNT(DISTINCT order_id) AS orders,
            COALESCE(SUM(amount) FILTER (WHERE method = 'cash'), 0) AS cash,
            COALESCE(SUM(amount) FILTER (WHERE method IN ('mobile','card','bank_transfer')), 0) AS other,
            COALESCE(SUM(amount) FILTER (WHERE method = 'room_charge'), 0) AS room
     FROM payment_collection
     WHERE branch_id = $1 AND staff_id = $2 AND created_at::date = CURRENT_DATE`, [branchId, staffId])
  return res.json({ success: true, data: { collected: Number(r.collected), orders: Number(r.orders), cash: Number(r.cash), other: Number(r.other), room: Number(r.room) } })
}

// NOTE: wrong-PIN, "no PIN set" and locked responses deliberately use 400/409/423, never 401.
// The frontend's axios interceptor treats ANY 401 as "your session token is
// invalid" and force-logs-out the whole browser (clears the token, redirects
// to /login) — that must never happen just because a waiter mistyped their
// 4-digit PIN. 401 is reserved for the actual JWT session check.
const PIN_MAX_ATTEMPTS = 5
const PIN_LOCK_MINUTES = 5

export async function verifyPosPin(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { staff_id, pin } = req.body
  if (!staff_id || !pin) {
    return res.status(400).json({ success: false, message: 'staff_id and pin are required' })
  }
  if (!/^\d{4,6}$/.test(String(pin))) {
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' })
  }

  // Staff must belong to THIS branch
  const { rows } = await query(
    `SELECT id, first_name, last_name, role, pos_pin, pos_pin_failed, pos_pin_locked_until
     FROM staff WHERE id = $1 AND branch_id = $2 AND is_active = TRUE AND deleted_at IS NULL`,
    [staff_id, branchId]
  )
  const staff = rows[0]
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' })
  if (!staff.pos_pin) {
    return res.status(409).json({ success: false, message: 'No PIN set — ask a manager to set your PIN in HR → Staff' })
  }

  if (staff.pos_pin_locked_until && new Date(staff.pos_pin_locked_until) > new Date()) {
    const mins = Math.ceil((new Date(staff.pos_pin_locked_until).getTime() - Date.now()) / 60_000)
    return res.status(423).json({
      success: false,
      message: `Too many wrong PINs — this profile is locked for ${mins} more minute${mins === 1 ? '' : 's'}. A manager can reset your PIN in HR → Staff.`,
    })
  }

  const ok = await bcrypt.compare(String(pin), staff.pos_pin)
  if (!ok) {
    const failed = Number(staff.pos_pin_failed) + 1
    const lock = failed >= PIN_MAX_ATTEMPTS
    await query(
      `UPDATE staff SET pos_pin_failed = $2,
              pos_pin_locked_until = CASE WHEN $3::boolean THEN NOW() + ($4 || ' minutes')::INTERVAL ELSE NULL END
       WHERE id = $1`,
      [staff.id, lock ? 0 : failed, lock, PIN_LOCK_MINUTES]
    )
    logAudit({ branchId, action: 'LOGIN_FAILED', tableName: 'staff', recordId: staff.id, req,
      newValues: { reason: lock ? 'pos_pin_locked' : 'wrong_pos_pin', staff_name: `${staff.first_name} ${staff.last_name}`, attempts: failed } })
    const left = PIN_MAX_ATTEMPTS - failed
    return res.status(lock ? 423 : 400).json({
      success: false,
      message: lock
        ? `Too many wrong PINs — this profile is locked for ${PIN_LOCK_MINUTES} minutes.`
        : `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left before this profile locks.`,
    })
  }

  await query(`UPDATE staff SET pos_pin_failed = 0, pos_pin_locked_until = NULL WHERE id = $1`, [staff.id])
  logAudit({ branchId, action: 'LOGIN_SUCCESS', tableName: 'staff', recordId: staff.id, req,
    newValues: { via: 'pos_pin', staff_name: `${staff.first_name} ${staff.last_name}` } })

  return res.json({
    success: true,
    data: { id: staff.id, name: `${staff.first_name} ${staff.last_name}`, role: staff.role },
  })
}

// Managers set / reset a staff member's POS PIN from HR → Staff (also clears any lockout)
export async function setStaffPin(req: Request, res: Response) {
  const { pin } = req.body
  const { branchId, userId } = req.auth!
  if (!pin || !/^\d{4,6}$/.test(String(pin))) {
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' })
  }
  const hash = await bcrypt.hash(String(pin), 10)
  const { rows } = await query(
    `UPDATE staff SET pos_pin = $1, pos_pin_failed = 0, pos_pin_locked_until = NULL, updated_at = NOW()
     WHERE id = $2 AND branch_id = $3 AND deleted_at IS NULL RETURNING id, first_name, last_name`,
    [hash, req.params.id, branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Staff not found' })
  logAudit({ userId, branchId, action: 'POS_PIN_SET', tableName: 'staff', recordId: rows[0].id, req })
  return res.json({ success: true, data: rows[0] })
}

// Guests currently staying in the hotel — the POS "Room charge" picker. Charging
// to a room must be tied to a real checked-in booking so the restaurant bill
// lands on that guest's statement (a typed name/room number linked to nothing).
export async function listInHouseBookings(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT b.id, b.booking_ref, b.primary_guest_id AS guest_id, r.room_number,
            g.first_name || ' ' || g.last_name AS guest_name
     FROM booking b
     JOIN room r  ON r.id = b.room_id
     JOIN guest g ON g.id = b.primary_guest_id
     WHERE b.branch_id = $1 AND b.status = 'checked_in' AND b.deleted_at IS NULL
     ORDER BY r.room_number`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}
