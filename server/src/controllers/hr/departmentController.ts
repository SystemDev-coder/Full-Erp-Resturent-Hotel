import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function listDepartments(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT d.id, d.name,
            COUNT(s.id) FILTER (WHERE s.is_active = TRUE AND s.deleted_at IS NULL) AS staff_count
     FROM department d
     LEFT JOIN staff s ON s.department_id = d.id
     WHERE d.branch_id = $1 AND d.deleted_at IS NULL
     GROUP BY d.id ORDER BY d.name`,
    [req.auth!.branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createDepartment(req: Request, res: Response) {
  const { name } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })
  const { rows } = await query(
    `INSERT INTO department (branch_id, name) VALUES ($1,$2) RETURNING id, name`,
    [req.auth!.branchId, name]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateDepartment(req: Request, res: Response) {
  const { name } = req.body
  const { rows } = await query(
    `UPDATE department SET name = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name`,
    [name, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Department not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteDepartment(req: Request, res: Response) {
  // A department with staff still assigned can't be removed — reassign them first
  const { rows } = await query(
    `SELECT COUNT(*) AS n FROM staff
     WHERE department_id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [req.params.id]
  )
  if (Number(rows[0]?.n) > 0) {
    return res.status(409).json({
      success: false,
      message: `This department still has ${rows[0].n} active staff member(s) — move them to another department first`,
    })
  }
  await query(`UPDATE department SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

// ── Payroll Lines (within a run) ──────────────────────────────────────────────

export async function getPayrollLines(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT pl.id, pl.basic_salary, pl.allowances, pl.deductions, pl.net_pay, pl.notes,
            s.first_name || ' ' || s.last_name AS staff_name,
            s.employee_id, d.name AS department_name
     FROM payroll_line pl
     JOIN staff s ON s.id = pl.staff_id
     LEFT JOIN department d ON d.id = s.department_id
     WHERE pl.payroll_run_id = $1
     ORDER BY s.first_name`,
    [req.params.id]
  )
  return res.json({ success: true, data: rows })
}
