import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { logAudit } from '../../utils/audit'

// Payroll run → Finance → Salary. A run is prepared as a DRAFT; approving it creates one
// "salary charge" per employee, which is what Finance → Salary pays out. Before this, the two
// were separate systems and an approved run never reached the people who pay salaries.

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

  if (!period_start || !period_end) return fail(res, 400, 'period_start and period_end are required')
  if (Number.isNaN(Date.parse(period_start)) || Number.isNaN(Date.parse(period_end))) return fail(res, 400, 'Invalid period dates')
  if (String(period_end) < String(period_start)) return fail(res, 400, 'period_end cannot be before period_start')

  try {
    const out = await withTx(async (c) => {
      // One run per branch and period
      const { rows: dup } = await c.query(
        `SELECT 1 FROM payroll_run WHERE branch_id = $1 AND period_start = $2 AND period_end = $3 AND deleted_at IS NULL`,
        [branchId, period_start, period_end])
      if (dup[0]) throw new HttpError(409, 'A payroll run already exists for this period')

      // Lines the caller sent, otherwise every active employee at their basic salary
      let payLines: { staff_id: string; basic_salary: number; allowances?: number; deductions?: number }[]
      if (Array.isArray(lines) && lines.length > 0) {
        payLines = lines
      } else {
        const { rows } = await c.query(
          `SELECT id AS staff_id, basic_salary FROM staff WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL AND basic_salary > 0`, [branchId])
        payLines = rows as typeof payLines
      }
      if (payLines.length === 0) throw new HttpError(400, 'There are no employees with a salary to pay')

      const { rows: staffOk } = await c.query(
        `SELECT id FROM staff WHERE branch_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
        [branchId, payLines.map(l => l.staff_id)])
      const known = new Set(staffOk.map((r: any) => r.id))

      const { rows: [run] } = await c.query(
        `INSERT INTO payroll_run (branch_id, period_start, period_end, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
        [branchId, period_start, period_end, userId])

      let totalGross = 0, totalDeductions = 0, totalNet = 0
      for (const pl of payLines) {
        if (!known.has(pl.staff_id)) throw new HttpError(404, 'An employee on the payroll was not found in this branch')
        const basic = Number(pl.basic_salary), allow = Number(pl.allowances ?? 0), ded = Number(pl.deductions ?? 0)
        if (![basic, allow, ded].every(Number.isFinite) || basic < 0 || allow < 0 || ded < 0) {
          throw new HttpError(400, 'Salary, allowances and deductions must be zero or more')
        }
        const net = round2(basic + allow - ded)
        if (net < 0) throw new HttpError(400, 'Deductions cannot be larger than pay')
        await c.query(
          `INSERT INTO payroll_line (payroll_run_id, staff_id, basic_salary, allowances, deductions, net_pay) VALUES ($1,$2,$3,$4,$5,$6)`,
          [run.id, pl.staff_id, basic, allow, ded, net])
        totalGross += basic + allow; totalDeductions += ded; totalNet += net
      }
      await c.query(`UPDATE payroll_run SET total_gross = $1, total_deductions = $2, total_net = $3 WHERE id = $4`,
        [round2(totalGross), round2(totalDeductions), round2(totalNet), run.id])
      return { id: run.id, total_gross: round2(totalGross), total_deductions: round2(totalDeductions), total_net: round2(totalNet), lines_count: payLines.length }
    })
    return res.status(201).json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

export async function approvePayroll(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  try {
    const out = await withTx(async (c) => {
      const { rows: [run] } = await c.query(
        `SELECT id, status, period_start::text AS period_start, period_end::text AS period_end FROM payroll_run
         WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL FOR UPDATE`, [req.params.id, branchId])
      if (!run) throw new HttpError(404, 'Payroll run not found')
      if (run.status !== 'draft') throw new HttpError(409, `This payroll run is already ${run.status}`)

      await c.query(`UPDATE payroll_run SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1`, [run.id, userId])

      // One salary charge per employee → shows up in Finance → Salary, ready to pay
      const { rows: lines } = await c.query(
        `SELECT staff_id, basic_salary + allowances AS gross, deductions, net_pay FROM payroll_line WHERE payroll_run_id = $1`, [run.id])
      let created = 0
      for (const l of lines) {
        if (Number(l.gross) <= 0) continue
        const { rows: exists } = await c.query(
          `SELECT 1 FROM salary_charge WHERE staff_id = $1 AND period_start = $2 AND period_end = $3 AND deleted_at IS NULL`,
          [l.staff_id, run.period_start, run.period_end])
        if (exists[0]) continue
        await c.query(
          `INSERT INTO salary_charge (organization_id, branch_id, staff_id, period_start, period_end, gross_amount, deductions, net_amount, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9)`,
          [orgId, branchId, l.staff_id, run.period_start, run.period_end, l.gross, l.deductions, l.net_pay, userId])
        created++
      }
      return { salary_charges_created: created, lines: lines.length }
    })
    logAudit({ userId, branchId, action: 'PAYROLL_APPROVED', tableName: 'payroll_run', recordId: req.params.id, req, newValues: out })
    return res.json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}
