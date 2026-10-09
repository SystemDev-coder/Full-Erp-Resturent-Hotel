import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { getPolicy, selfApproves, APPROVER_STAFF_ROLES, DEFAULT_POLICY } from '../../utils/approval'
import { logAudit } from '../../utils/audit'

// What needs a manager's approval, and who can give it (shown in the approval dialog and in Settings).

export async function getApprovalPolicy(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const [policy, { rows: approvers }] = await Promise.all([
    getPolicy(orgId),
    query(
      `SELECT id, first_name || ' ' || last_name AS name, role, (pos_pin IS NOT NULL) AS has_pin
       FROM staff WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL AND role = ANY($2)
       ORDER BY first_name`,
      [branchId, APPROVER_STAFF_ROLES]),
  ])
  return res.json({ success: true, data: { policy, approvers, self_approves: selfApproves(req) } })
}

export async function updateApprovalPolicy(req: Request, res: Response) {
  const { orgId, userId, branchId } = req.auth!
  const pct = Number(req.body?.discount_over_pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ success: false, message: 'Discount limit must be between 0 and 100 (%)' })
  }
  const policy = { discount_over_pct: Math.round(pct * 100) / 100, require_for_void: req.body?.require_for_void !== false }
  const before = await getPolicy(orgId)
  await query(
    `UPDATE organization SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{approvals}', $2::jsonb, true), updated_at = NOW() WHERE id = $1`,
    [orgId, JSON.stringify(policy)])
  logAudit({ userId, branchId, action: 'APPROVAL_POLICY_UPDATED', req, oldValues: before, newValues: policy })
  return res.json({ success: true, data: { policy, defaults: DEFAULT_POLICY } })
}
