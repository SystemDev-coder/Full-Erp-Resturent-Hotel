import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'
import { getPagination, sliceHasMore } from '../../utils/pagination'

export async function listStaff(req: Request, res: Response) {
  const { branchId } = req.auth!
  // Housekeeping/Salary pickers call this without ?limit= and need the full
  // roster, so the default stays generous (200, the pagination cap); the
  // Staff DataTable's "Load More" explicitly sends limit=50.
  const { limit, offset } = getPagination(req, 200)
  const { rows } = await query(
    `SELECT s.id, s.employee_id, s.first_name, s.last_name, s.email, s.phone,
            s.role, s.employment_type, s.basic_salary, s.joined_at, s.is_active,
            d.name AS department_name,
            EXISTS (SELECT 1 FROM users u JOIN user_branch ub ON ub.user_id = u.id AND ub.branch_id = s.branch_id AND ub.deleted_at IS NULL
                    WHERE s.email IS NOT NULL AND lower(u.email) = lower(s.email) AND u.deleted_at IS NULL) AS has_login
     FROM staff s LEFT JOIN department d ON d.id = s.department_id
     WHERE s.branch_id = $1 AND s.deleted_at IS NULL
     ORDER BY s.first_name
     LIMIT $2 OFFSET $3`,
    [branchId, limit + 1, offset]
  )
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function getStaff(req: Request, res: Response) {
  // Explicit columns - never SELECT * here: it would return the POS PIN hash
  const { rows } = await query(
    `SELECT id, branch_id, department_id, employee_id, first_name, last_name, email, phone, role,
            employment_type, basic_salary, joined_at, left_at, is_active, notes, created_at, updated_at,
            (pos_pin IS NOT NULL) AS has_pin
     FROM staff WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Staff not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createStaff(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const {
    department_id, employee_id, first_name, last_name,
    email, phone, role, employment_type = 'full_time',
    basic_salary = 0, joined_at, notes,
  } = req.body

  if (!first_name || !last_name || !role) {
    return res.status(400).json({ success: false, message: 'first_name, last_name and role are required' })
  }

  if (!Number.isFinite(Number(basic_salary)) || Number(basic_salary) < 0) {
    return res.status(400).json({ success: false, message: 'basic_salary cannot be negative' })
  }

  const empId = employee_id || ('EMP-' + Date.now().toString(36).toUpperCase())

  const { rows } = await query(
    `INSERT INTO staff
       (branch_id, department_id, employee_id, first_name, last_name,
        email, phone, role, employment_type, basic_salary, joined_at, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, employee_id, first_name, last_name, role`,
    [branchId, department_id ?? null, empId, first_name, last_name,
     email ?? null, phone ?? null, role, employment_type, basic_salary,
     joined_at ?? new Date().toISOString().slice(0,10), notes ?? null, userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateStaff(req: Request, res: Response) {
  const { id } = req.params
  const {
    department_id, first_name, last_name, email, phone,
    role, employment_type, basic_salary, notes,
  } = req.body
  if (basic_salary !== undefined && basic_salary !== null && (!Number.isFinite(Number(basic_salary)) || Number(basic_salary) < 0)) {
    return res.status(400).json({ success: false, message: 'basic_salary cannot be negative' })
  }

  const { rows } = await query(
    `UPDATE staff SET
       department_id   = COALESCE($1, department_id),
       first_name      = COALESCE($2, first_name),
       last_name       = COALESCE($3, last_name),
       email           = COALESCE($4, email),
       phone           = COALESCE($5, phone),
       role            = COALESCE($6, role),
       employment_type = COALESCE($7, employment_type),
       basic_salary    = COALESCE($8, basic_salary),
       notes           = COALESCE($9, notes),
       updated_at      = NOW()
     WHERE id = $10 AND branch_id = $11 AND deleted_at IS NULL
     RETURNING id, employee_id, first_name, last_name, role, basic_salary`,
    [department_id ?? null, first_name ?? null, last_name ?? null,
     email ?? null, phone ?? null, role ?? null, employment_type ?? null,
     basic_salary ?? null, notes ?? null, id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Staff not found' })
  return res.json({ success: true, data: rows[0] })
}

async function setStaffState(req: Request, res: Response, sql: string) {
  const { rows } = await query(sql, [req.params.id, req.auth!.branchId])
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Staff not found' })
  return res.json({ success: true })
}

export const deactivateStaff = (req: Request, res: Response) => setStaffState(req, res,
  `UPDATE staff SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL RETURNING id`)

export const activateStaff = (req: Request, res: Response) => setStaffState(req, res,
  `UPDATE staff SET is_active = TRUE, left_at = NULL, updated_at = NOW() WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL RETURNING id`)

export const deleteStaff = (req: Request, res: Response) => setStaffState(req, res,
  `UPDATE staff SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL RETURNING id`)

// ── Create a system login for a staff member ─────────────────────────────────
// HR staff (POS name + PIN) and system users (email + password) are separate lists. This makes the user account
// for an existing staff member in one step, with the right role, and writes the same email on the staff profile so the
// POS recognises them ("is_me") and opens straight on their PIN pad.
const STAFF_TO_USER_ROLE: Record<string, string> = {
  waiter: 'waiter', cashier: 'cashier', chef: 'chef', bar_staff: 'bar_staff', receptionist: 'receptionist', housekeeper: 'housekeeper',
  hotel_cashier: 'hotel_cashier', accountant: 'accountant', inventory_manager: 'inventory_manager',
  manager: 'branch_manager', branch_manager: 'branch_manager',
}

export async function createStaffLogin(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { rows: [s] } = await query(
    `SELECT id, first_name, last_name, email, phone, role FROM staff WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`, [req.params.id, branchId])
  if (!s) return res.status(404).json({ success: false, message: 'Staff not found' })

  const email = String(req.body?.email ?? s.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address — it is the username for signing in.' })
  const password = req.body?.password ? String(req.body.password) : ''
  if (password && password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })

  const { rows: taken } = await query(`SELECT 1 FROM users WHERE lower(email) = $1 AND deleted_at IS NULL`, [email])
  if (taken[0]) return res.status(409).json({ success: false, message: 'That email already has a login. Use a different email, or edit the existing user in Settings → Users.' })

  const role = STAFF_TO_USER_ROLE[s.role] ?? 'report_viewer'
  const generated = !password
  const plain = password || Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)]).join('') + 'A1!'
  const { rows: [user] } = await query(
    `INSERT INTO users (organization_id, full_name, email, phone, password_hash, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, full_name`,
    [orgId, `${s.first_name} ${s.last_name}`.trim(), email, s.phone ?? null, await bcrypt.hash(plain, 12), userId])
  await query(`INSERT INTO user_branch (user_id, branch_id, role, is_primary, invited_by) VALUES ($1,$2,$3,TRUE,$4)`, [user.id, branchId, role, userId])
  if (!s.email || s.email.toLowerCase() !== email) await query(`UPDATE staff SET email = $2, updated_at = NOW() WHERE id = $1`, [s.id, email])

  logAudit({ userId, branchId, action: 'USER_CREATED', tableName: 'users', recordId: user.id, req, newValues: { from_staff: s.id, email, role } })
  return res.status(201).json({ success: true, data: { ...user, role, temp_password: generated ? plain : undefined, role_note: STAFF_TO_USER_ROLE[s.role] ? undefined : `"${s.role}" has no matching login role, so the account is read-only (report viewer). Change it in Settings → Users.` } })
}
