import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

export async function listPayrollRuns(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, period_start, period_end, status, total_gross, total_deductions, total_net, created_at
     FROM payroll_run WHERE branch_id = $1 AND deleted_at IS NULL ORDER BY period_start DESC`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createPayrollRun(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { period_start, period_end, lines } = req.body

  if (!period_start || !period_end) {
    return res.status(400).json({ success: false, message: 'period_start and period_end are required' })
  }

  // Auto-generate lines from active staff if not provided
  let payLines: Array<{ staff_id: string; basic_salary: number; allowances?: number; deductions?: number }> = lines

  if (!Array.isArray(payLines) || payLines.length === 0) {
    const { rows: activeStaff } = await query(
      `SELECT id AS staff_id, basic_salary FROM staff
       WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [branchId]
    )
    payLines = activeStaff as typeof payLines
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [run] } = await client.query(
      `INSERT INTO payroll_run (branch_id, period_start, period_end, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [branchId, period_start, period_end, userId]
    )

    let totalGross = 0, totalDeductions = 0, totalNet = 0

    for (const pl of payLines) {
      const gross = Number(pl.basic_salary)
      const ded   = Number(pl.deductions ?? 0)
      const allow = Number(pl.allowances ?? 0)
      const net   = gross + allow - ded

      await client.query(
        `INSERT INTO payroll_line (payroll_run_id, staff_id, basic_salary, allowances, deductions, net_pay)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [run.id, pl.staff_id, gross, allow, ded, net]
      )
      totalGross      += gross + allow
      totalDeductions += ded
      totalNet        += net
    }

    await client.query(
      `UPDATE payroll_run SET total_gross = $1, total_deductions = $2, total_net = $3 WHERE id = $4`,
      [totalGross, totalDeductions, totalNet, run.id]
    )

    await client.query('COMMIT')
    return res.status(201).json({
      success: true,
      data: { id: run.id, total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet, lines_count: payLines.length }
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function approvePayroll(req: Request, res: Response) {
  await query(
    `UPDATE payroll_run SET status = 'approved', approved_by = $2 WHERE id = $1`,
    [req.params.id, req.auth!.userId]
  )
  return res.json({ success: true })
}