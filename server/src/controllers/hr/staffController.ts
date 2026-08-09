import { Request, Response } from 'express'
import { query } from '../../db/pool'
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
            d.name AS department_name
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
  const { rows } = await query(`SELECT * FROM staff WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
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
     WHERE id = $10 AND deleted_at IS NULL
     RETURNING id, employee_id, first_name, last_name, role, basic_salary`,
    [department_id ?? null, first_name ?? null, last_name ?? null,
     email ?? null, phone ?? null, role ?? null, employment_type ?? null,
     basic_salary ?? null, notes ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Staff not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deactivateStaff(req: Request, res: Response) {
  await query(`UPDATE staff SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

export async function activateStaff(req: Request, res: Response) {
  await query(`UPDATE staff SET is_active = TRUE, left_at = NULL, updated_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

export async function deleteStaff(req: Request, res: Response) {
  await query(`UPDATE staff SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}