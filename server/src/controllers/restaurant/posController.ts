import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'

// ─── POS staff login (waiter/cashier PIN) ─────────────────────────────────────

// Staff shown on the POS lock screen — waiters, cashiers, and managers
const POS_ROLES = ['waiter', 'cashier', 'bar_staff', 'manager', 'branch_manager']

export async function listPosStaff(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, first_name, last_name, role, employee_id,
            (pos_pin IS NOT NULL) AS has_pin
     FROM staff
     WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL
       AND role = ANY($2)
     ORDER BY first_name`,
    [branchId, POS_ROLES]
  )
  return res.json({ success: true, data: rows })
}

// NOTE: wrong-PIN and "no PIN set" responses deliberately use 400/409, never 401.
// The frontend's axios interceptor treats ANY 401 as "your session token is
// invalid" and force-logs-out the whole browser (clears the token, redirects
// to /login) — that must never happen just because a waiter mistyped their
// 4-digit PIN. 401 is reserved for the actual JWT session check.
export async function verifyPosPin(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { staff_id, pin } = req.body
  if (!staff_id || !pin) {
    return res.status(400).json({ success: false, message: 'staff_id and pin are required' })
  }

  const { rows } = await query(
    `SELECT id, first_name, last_name, role, pos_pin
     FROM staff WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [staff_id]
  )
  const staff = rows[0]
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' })
  if (!staff.pos_pin) {
    return res.status(409).json({ success: false, message: 'No PIN set — ask a manager to set your PIN in HR → Staff' })
  }

  const ok = await bcrypt.compare(String(pin), staff.pos_pin)
  if (!ok) {
    logAudit({ branchId, action: 'LOGIN_FAILED', tableName: 'staff', recordId: staff.id, req,
      newValues: { reason: 'wrong_pos_pin', staff_name: `${staff.first_name} ${staff.last_name}` } })
    return res.status(400).json({
      success: false,
      message: 'Incorrect PIN. Please try to remember your PIN or contact your administrator to reset it.',
    })
  }

  logAudit({ branchId, action: 'LOGIN_SUCCESS', tableName: 'staff', recordId: staff.id, req,
    newValues: { via: 'pos_pin', staff_name: `${staff.first_name} ${staff.last_name}` } })

  return res.json({
    success: true,
    data: { id: staff.id, name: `${staff.first_name} ${staff.last_name}`, role: staff.role },
  })
}

// Managers set / reset a staff member's POS PIN from HR → Staff
export async function setStaffPin(req: Request, res: Response) {
  const { pin } = req.body
  if (!pin || !/^\d{4,6}$/.test(String(pin))) {
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' })
  }
  const hash = await bcrypt.hash(String(pin), 10)
  const { rows } = await query(
    `UPDATE staff SET pos_pin = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL RETURNING id, first_name, last_name`,
    [hash, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Staff not found' })
  return res.json({ success: true, data: rows[0] })
}
