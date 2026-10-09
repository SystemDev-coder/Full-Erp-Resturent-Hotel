import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { col, DETAIL_LIMIT, type DetailPayload } from '../../utils/detail'
import { periodFrom } from '../accounting/financeReportController'

// System report — who uses the system and how safe it is: accounts, sign-ins, failed
// attempts and lockouts, what people did, what was printed. Built from `users`,
// `user_branch` and the audit log. Administrators and branch managers only.

const num = (v: unknown) => Number(v ?? 0)

// An audit row belongs to this organization if its user or its branch does
const ORG_AUDIT = `(al.user_id IN (SELECT id FROM users WHERE organization_id = $1)
                    OR al.branch_id IN (SELECT id FROM branch WHERE organization_id = $1))`

export async function getSystemReport(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { from, to } = periodFrom(req)
  const inPeriod = `al.created_at::date BETWEEN $2 AND $3`

  const [users, roles, logins, failedReasons, topActions, topUsers, prints, usage, security, modules, series] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE is_active)                                                      AS active,
              COUNT(*) FILTER (WHERE NOT is_active)                                                  AS inactive,
              COUNT(*) FILTER (WHERE is_locked OR (locked_until IS NOT NULL AND locked_until > NOW())) AS locked,
              COUNT(*) FILTER (WHERE last_login_at IS NULL)                                          AS never_signed_in
       FROM users WHERE organization_id = $1 AND deleted_at IS NULL`, [orgId]),

    query(
      `SELECT ub.role, COUNT(DISTINCT ub.user_id) AS count
       FROM user_branch ub JOIN users u ON u.id = ub.user_id
       WHERE u.organization_id = $1 AND u.deleted_at IS NULL AND ub.deleted_at IS NULL AND ub.is_active
       GROUP BY ub.role ORDER BY count DESC`, [orgId]),

    query(
      `SELECT COUNT(*) FILTER (WHERE al.action = 'LOGIN_SUCCESS') AS success,
              COUNT(*) FILTER (WHERE al.action = 'LOGIN_FAILED')  AS failed,
              COUNT(DISTINCT al.user_id) FILTER (WHERE al.action = 'LOGIN_SUCCESS') AS distinct_users
       FROM audit_log al WHERE ${ORG_AUDIT} AND ${inPeriod}`, [orgId, from, to]),

    query(
      `SELECT COALESCE(al.new_values->>'reason', 'unknown') AS reason, COUNT(*) AS count
       FROM audit_log al WHERE ${ORG_AUDIT} AND ${inPeriod} AND al.action = 'LOGIN_FAILED'
       GROUP BY 1 ORDER BY count DESC`, [orgId, from, to]),

    query(
      `SELECT al.action, COUNT(*) AS count FROM audit_log al
       WHERE ${ORG_AUDIT} AND ${inPeriod} AND al.action NOT IN ('LOGIN_SUCCESS')
       GROUP BY 1 ORDER BY count DESC LIMIT 10`, [orgId, from, to]),

    query(
      `SELECT u.full_name, u.email, COUNT(*) AS count FROM audit_log al JOIN users u ON u.id = al.user_id
       WHERE ${ORG_AUDIT} AND ${inPeriod} AND al.action NOT IN ('LOGIN_SUCCESS', 'LOGIN_FAILED')
       GROUP BY u.id ORDER BY count DESC LIMIT 5`, [orgId, from, to]),

    query(
      `SELECT al.action, COUNT(*) AS count FROM audit_log al
       WHERE ${ORG_AUDIT} AND ${inPeriod} AND al.action LIKE 'PRINT_%' GROUP BY 1 ORDER BY count DESC`, [orgId, from, to]),

    // how much real work the system recorded in the period (this branch)
    query(
      `SELECT
         (SELECT COUNT(*) FROM booking      WHERE branch_id = $1 AND deleted_at IS NULL AND created_at::date BETWEEN $2 AND $3) AS bookings,
         (SELECT COUNT(*) FROM order_header WHERE branch_id = $1 AND deleted_at IS NULL AND opened_at::date  BETWEEN $2 AND $3) AS orders,
         (SELECT COUNT(*) FROM invoice      WHERE branch_id = $1 AND deleted_at IS NULL AND created_at::date BETWEEN $2 AND $3) AS invoices,
         (SELECT COUNT(*) FROM transaction  WHERE branch_id = $1 AND deleted_at IS NULL AND created_at::date BETWEEN $2 AND $3) AS transactions,
         (SELECT COUNT(*) FROM guest        WHERE organization_id = (SELECT organization_id FROM branch WHERE id = $1) AND deleted_at IS NULL AND created_at::date BETWEEN $2 AND $3) AS guests`,
      [branchId, from, to]),

    query(
      `SELECT al.action, al.created_at, u.full_name AS user_name, al.ip_address::text AS ip,
              COALESCE(al.new_values->>'reason', al.new_values->>'full_name', '') AS detail
       FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
       WHERE ${ORG_AUDIT} AND ${inPeriod}
         AND al.action IN ('LOGIN_FAILED','USER_LOCKED','USER_UNLOCKED','USER_DELETED','USER_DEACTIVATED','USER_PASSWORD_RESET','USER_PERMISSIONS_UPDATED','UNLOCK_FAILED','USER_CREATED')
       ORDER BY al.created_at DESC LIMIT 12`, [orgId, from, to]),

    query(
      `SELECT DISTINCT ON (module_key) module_key, is_enabled FROM module_config
       WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND deleted_at IS NULL
       ORDER BY module_key, branch_id NULLS LAST`, [orgId, branchId]),

    query(
      `SELECT d::date::text AS date,
              COUNT(al.id) FILTER (WHERE al.action = 'LOGIN_SUCCESS') AS success,
              COUNT(al.id) FILTER (WHERE al.action = 'LOGIN_FAILED')  AS failed
       FROM generate_series($2::date, $3::date, '1 day') d
       LEFT JOIN audit_log al ON al.created_at::date = d::date AND ${ORG_AUDIT}
       GROUP BY d ORDER BY d`, [orgId, from, to]),
  ])

  return res.json({
    success: true,
    data: {
      period: { from, to },
      users: Object.fromEntries(Object.entries(users.rows[0]).map(([k, v]) => [k, num(v)])),
      roles: roles.rows.map((r: any) => ({ role: r.role, count: num(r.count) })),
      logins: { success: num(logins.rows[0].success), failed: num(logins.rows[0].failed), distinct_users: num(logins.rows[0].distinct_users) },
      failed_reasons: failedReasons.rows.map((r: any) => ({ reason: r.reason, count: num(r.count) })),
      top_actions: topActions.rows.map((r: any) => ({ action: r.action, count: num(r.count) })),
      top_users: topUsers.rows.map((r: any) => ({ name: r.full_name, email: r.email, count: num(r.count) })),
      prints: prints.rows.map((r: any) => ({ action: r.action, count: num(r.count) })),
      usage: Object.fromEntries(Object.entries(usage.rows[0]).map(([k, v]) => [k, num(v)])),
      security_events: security.rows,
      modules: modules.rows.map((m: any) => ({ key: m.module_key, enabled: m.is_enabled })),
      series: series.rows.map((r: any) => ({ date: r.date, success: num(r.success), failed: num(r.failed) })),
    },
  })
}

// ─── Click-through details ─────────────────────────────────────────────────────

interface Ctx { orgId: string; branchId: string; from: string; to: string }
type Builder = (c: Ctx) => Promise<DetailPayload>

const auditRows = (c: Ctx, where: string) => query(
  `SELECT al.created_at, al.action, COALESCE(u.full_name, '—') AS user_name, COALESCE(u.email, '') AS email,
          al.ip_address::text AS ip, COALESCE(al.new_values->>'reason', al.new_values->>'staff_name', al.new_values->>'full_name', '') AS detail
   FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
   WHERE ${ORG_AUDIT} AND al.created_at::date BETWEEN $2 AND $3 ${where}
   ORDER BY al.created_at DESC LIMIT ${DETAIL_LIMIT}`, [c.orgId, c.from, c.to])

const auditCols = [col('created_at', 'When', 'datetime'), col('user_name', 'User'), col('action', 'Action', 'status'), col('detail', 'Detail'), col('ip', 'IP address')]
const per = (c: Ctx) => `${c.from} → ${c.to}`

const BUILDERS: Record<string, Builder> = {
  sys_users: async (c) => {
    const { rows } = await query(
      `SELECT u.full_name, u.email,
              COALESCE(string_agg(DISTINCT ub.role, ', '), '—') AS roles,
              CASE WHEN u.deleted_at IS NOT NULL THEN 'deleted'
                   WHEN NOT u.is_active THEN 'inactive'
                   WHEN u.is_locked THEN 'locked'
                   WHEN u.locked_until IS NOT NULL AND u.locked_until > NOW() THEN 'auto_locked'
                   ELSE 'active' END AS status,
              u.last_login_at, u.failed_attempts
       FROM users u LEFT JOIN user_branch ub ON ub.user_id = u.id AND ub.deleted_at IS NULL
       WHERE u.organization_id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id ORDER BY u.full_name LIMIT ${DETAIL_LIMIT}`, [c.orgId])
    return { title: 'User accounts', subtitle: 'Everyone who can sign in',
      empty: 'No user accounts.',
      summary: [{ label: 'Accounts', value: rows.length, type: 'number' },
                { label: 'Active', value: rows.filter((r: any) => r.status === 'active').length, type: 'number' },
                { label: 'Locked', value: rows.filter((r: any) => /locked/.test(r.status)).length, type: 'number' }],
      columns: [col('full_name', 'Name'), col('email', 'Email'), col('roles', 'Role(s)'), col('status', 'Status', 'status'),
                col('last_login_at', 'Last sign-in', 'datetime'), col('failed_attempts', 'Failed tries', 'number')],
      rows, link: { to: '/system/settings', label: 'Open Users & Permissions' } }
  },
  sys_locked: async (c) => {
    const { rows } = await query(
      `SELECT u.full_name, u.email, CASE WHEN u.is_locked THEN 'locked_by_admin' ELSE 'auto_locked' END AS reason,
              u.locked_until, u.failed_attempts
       FROM users u WHERE u.organization_id = $1 AND u.deleted_at IS NULL
         AND (u.is_locked OR (u.locked_until IS NOT NULL AND u.locked_until > NOW()))
       ORDER BY u.full_name`, [c.orgId])
    return { title: 'Locked accounts', subtitle: 'Cannot sign in right now', empty: 'No account is locked.',
      summary: [{ label: 'Locked', value: rows.length, type: 'number' }],
      columns: [col('full_name', 'Name'), col('email', 'Email'), col('reason', 'Why', 'status'), col('locked_until', 'Auto-unlocks', 'datetime'), col('failed_attempts', 'Failed tries', 'number')],
      rows, link: { to: '/system/settings', label: 'Unlock in Settings' } }
  },
  sys_logins: async (c) => {
    const { rows } = await auditRows(c, `AND al.action = 'LOGIN_SUCCESS'`)
    return { title: 'Successful sign-ins', subtitle: per(c), empty: 'Nobody signed in during this period.',
      summary: [{ label: 'Sign-ins', value: rows.length, type: 'number' }, { label: 'People', value: new Set(rows.map((r: any) => r.email)).size, type: 'number' }],
      columns: [col('created_at', 'When', 'datetime'), col('user_name', 'User'), col('email', 'Email'), col('ip', 'IP address')], rows }
  },
  sys_failed: async (c) => {
    const { rows } = await auditRows(c, `AND al.action IN ('LOGIN_FAILED','UNLOCK_FAILED')`)
    return { title: 'Failed sign-ins', subtitle: per(c), empty: 'No failed sign-in attempts — good.',
      summary: [{ label: 'Failed attempts', value: rows.length, type: 'number' }], columns: auditCols, rows }
  },
  sys_security: async (c) => {
    const { rows } = await auditRows(c, `AND al.action IN ('LOGIN_FAILED','USER_LOCKED','USER_UNLOCKED','USER_DELETED','USER_DEACTIVATED','USER_ACTIVATED','USER_PASSWORD_RESET','USER_PERMISSIONS_UPDATED','UNLOCK_FAILED','USER_CREATED','USER_SESSIONS_REVOKED','POS_PIN_SET')`)
    return { title: 'Security events', subtitle: per(c), empty: 'No security events in this period.',
      summary: [{ label: 'Events', value: rows.length, type: 'number' }], columns: auditCols, rows }
  },
  sys_activity: async (c) => {
    const { rows } = await auditRows(c, `AND al.action NOT IN ('LOGIN_SUCCESS')`)
    return { title: 'System activity', subtitle: per(c), empty: 'No activity was recorded in this period.',
      summary: [{ label: 'Events', value: rows.length, type: 'number' }], columns: auditCols, rows }
  },
  sys_prints: async (c) => {
    const { rows } = await auditRows(c, `AND al.action LIKE 'PRINT_%'`)
    return { title: 'Printed documents', subtitle: per(c), empty: 'Nothing was printed in this period.',
      summary: [{ label: 'Prints', value: rows.length, type: 'number' }], columns: auditCols, rows }
  },
  sys_roles: async (c) => {
    const { rows } = await query(
      `SELECT ub.role, u.full_name, u.email, b.name AS branch
       FROM user_branch ub JOIN users u ON u.id = ub.user_id JOIN branch b ON b.id = ub.branch_id
       WHERE u.organization_id = $1 AND u.deleted_at IS NULL AND ub.deleted_at IS NULL AND ub.is_active
       ORDER BY ub.role, u.full_name LIMIT ${DETAIL_LIMIT}`, [c.orgId])
    return { title: 'Roles & assignments', subtitle: 'Who holds which role, per branch', empty: 'No role assignments.',
      summary: [{ label: 'Assignments', value: rows.length, type: 'number' }],
      columns: [col('role', 'Role', 'status'), col('full_name', 'Name'), col('email', 'Email'), col('branch', 'Branch')],
      rows, link: { to: '/system/settings', label: 'Open Users & Permissions' } }
  },
}

export async function getSystemReportDetail(req: Request, res: Response) {
  const build = BUILDERS[req.params.kind]
  if (!build) return res.status(404).json({ success: false, message: 'Unknown report detail' })
  const { orgId, branchId } = req.auth!
  const { from, to } = periodFrom(req)
  return res.json({ success: true, data: await build({ orgId, branchId, from, to }) })
}
