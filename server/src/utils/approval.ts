import { Request } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db/pool'
import { HttpError } from './tx'
import { logAudit } from './audit'

// Manager approval for risky actions: big discounts and voiding food that already reached the kitchen.
// A signed-in branch manager / admin approves themselves; anyone else (cashier, waiter…) needs a
// manager to type their POS PIN. Approvals are always written to the audit trail.

export interface ApprovalPolicy { discount_over_pct: number; require_for_void: boolean }
export const DEFAULT_POLICY: ApprovalPolicy = { discount_over_pct: 10, require_for_void: true }

const SELF_APPROVE = ['org_admin', 'branch_manager']
export const APPROVER_STAFF_ROLES = ['manager', 'branch_manager']
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 5

export async function getPolicy(orgId: string): Promise<ApprovalPolicy> {
  const { rows } = await query(`SELECT settings->'approvals' AS a FROM organization WHERE id = $1`, [orgId])
  const a = rows[0]?.a ?? {}
  const pct = Number(a.discount_over_pct)
  return {
    discount_over_pct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_POLICY.discount_over_pct,
    require_for_void: a.require_for_void === false ? false : true,
  }
}

export const selfApproves = (req: Request) => SELF_APPROVE.includes(req.auth!.role)

export interface ApprovalInput { staff_id?: string; pin?: string; reason?: string }
export interface Approved { by: string; self: boolean; reason: string | null }

// Check the approval carried in a request body. Throws HttpError(403, { approval_required }) when the
// caller still has to supply one — the frontend turns that into the "Manager approval" dialog.
// NOTE: runs on its own pool connection, so a wrong-PIN counter survives even when the caller's
// transaction rolls back. Never answers 401 (that would sign the whole browser out).
export async function requireApproval(
  req: Request, input: ApprovalInput | undefined,
  opts: { action: string; label: string; needReason?: boolean; recordId?: string; detail?: Record<string, unknown> },
): Promise<Approved> {
  const { userId, branchId } = req.auth!
  const self = selfApproves(req)
  const reason = input?.reason ? String(input.reason).trim().slice(0, 300) : ''
  const ask = (message: string) => new HttpError(403, message, {
    approval_required: true, needs_pin: !self, needs_reason: !!opts.needReason, label: opts.label,
  })

  if (opts.needReason && reason.length < 3) throw ask('A reason is required')

  let by: string
  if (self) {
    const { rows } = await query(`SELECT full_name FROM users WHERE id = $1`, [userId])
    by = rows[0]?.full_name ?? 'Manager'
  } else {
    if (!input?.staff_id || !input?.pin) throw ask('Manager approval required')
    if (!/^\d{4,6}$/.test(String(input.pin))) throw new HttpError(400, 'PIN must be 4–6 digits', { approval_required: true, needs_pin: true, needs_reason: !!opts.needReason, label: opts.label })

    const { rows: [m] } = await query(
      `SELECT id, first_name, last_name, role, pos_pin, pos_pin_failed, pos_pin_locked_until
       FROM staff WHERE id = $1 AND branch_id = $2 AND is_active = TRUE AND deleted_at IS NULL AND role = ANY($3)`,
      [input.staff_id, branchId, APPROVER_STAFF_ROLES])
    if (!m) throw new HttpError(404, 'That manager was not found in this branch')
    if (!m.pos_pin) throw new HttpError(409, 'That manager has no PIN set (HR → Staff)')
    if (m.pos_pin_locked_until && new Date(m.pos_pin_locked_until) > new Date()) {
      const mins = Math.ceil((new Date(m.pos_pin_locked_until).getTime() - Date.now()) / 60_000)
      throw new HttpError(423, `Too many wrong PINs — this manager is locked for ${mins} more minute${mins === 1 ? '' : 's'}.`)
    }
    if (!(await bcrypt.compare(String(input.pin), m.pos_pin))) {
      const failed = Number(m.pos_pin_failed) + 1
      const lock = failed >= MAX_ATTEMPTS
      await query(
        `UPDATE staff SET pos_pin_failed = $2,
                pos_pin_locked_until = CASE WHEN $3::boolean THEN NOW() + ($4 || ' minutes')::INTERVAL ELSE NULL END WHERE id = $1`,
        [m.id, lock ? 0 : failed, lock, LOCK_MINUTES])
      logAudit({ userId, branchId, action: 'APPROVAL_DENIED', tableName: 'staff', recordId: m.id, req,
        newValues: { for: opts.action, manager: `${m.first_name} ${m.last_name}`, attempts: failed } })
      const left = MAX_ATTEMPTS - failed
      throw new HttpError(lock ? 423 : 400,
        lock ? `Too many wrong PINs — this manager is locked for ${LOCK_MINUTES} minutes.`
             : `Incorrect manager PIN. ${left} attempt${left === 1 ? '' : 's'} left.`,
        { approval_required: true, needs_pin: true, needs_reason: !!opts.needReason, label: opts.label })
    }
    await query(`UPDATE staff SET pos_pin_failed = 0, pos_pin_locked_until = NULL WHERE id = $1`, [m.id])
    by = `${m.first_name} ${m.last_name}`
  }

  logAudit({ userId, branchId, action: 'APPROVAL_GRANTED', tableName: opts.recordId ? 'order_header' : null, recordId: opts.recordId ?? null, req,
    newValues: { for: opts.action, approved_by: by, self_approved: self, reason: reason || null, ...opts.detail } })
  return { by, self, reason: reason || null }
}
