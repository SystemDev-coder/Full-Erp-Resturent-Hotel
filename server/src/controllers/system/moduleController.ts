import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { invalidateModuleCache } from '../../middleware/auth'

// Modules an organization can switch on/off per branch. A module with no row is ON
// (so a fresh install works); "system" can never be switched off — it holds Settings
// itself, so disabling it would lock the admin out of the screen that re-enables things.
export const MODULE_CATALOGUE: Record<string, { label: string; description: string; required?: boolean }> = {
  hotel:      { label: 'Hotel',               description: 'Rooms, bookings, guests, check-in/out and housekeeping.' },
  restaurant: { label: 'Restaurant',          description: 'POS, orders & tables, kitchen flow, menu and reservations.' },
  inventory:  { label: 'Inventory',           description: 'Items, warehouses, suppliers, purchase orders and stock.' },
  accounting: { label: 'Finance & Accounting', description: 'Accounts, receipts, expenses, salaries and reports.' },
  hr:         { label: 'HR & Staff',          description: 'Staff records, departments, POS PINs and payroll.' },
  system:     { label: 'System',              description: 'Company info, users, permissions and settings.', required: true },
}

// Branch-specific row wins over the organization-wide one
const effective = async (orgId: string, branchId: string) => {
  const { rows } = await query(
    `SELECT DISTINCT ON (module_key) module_key, is_enabled
     FROM module_config
     WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND deleted_at IS NULL
     ORDER BY module_key, branch_id NULLS LAST`,
    [orgId, branchId]
  )
  return new Map<string, boolean>(rows.map((r: any) => [r.module_key, r.is_enabled]))
}

export async function listModules(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const state = await effective(orgId, branchId)
  const data = Object.entries(MODULE_CATALOGUE).map(([key, m]) => ({
    key, label: m.label, description: m.description,
    is_required: !!m.required,
    is_enabled: m.required ? true : (state.get(key) ?? true),
  }))
  return res.json({ success: true, data })
}

export async function toggleModule(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { key } = req.params
  const meta = MODULE_CATALOGUE[key]
  if (!meta) return res.status(404).json({ success: false, message: 'Unknown module' })
  if (meta.required) return res.status(409).json({ success: false, message: 'This module is required and cannot be disabled' })

  // Explicit value if sent, otherwise flip the current state
  const current = (await effective(orgId, branchId)).get(key) ?? true
  const next = typeof req.body?.is_enabled === 'boolean' ? req.body.is_enabled : !current

  const upd = await query(
    `UPDATE module_config SET is_enabled = $1, updated_at = NOW(), updated_by = $2
     WHERE organization_id = $3 AND module_key = $4 AND branch_id = $5 AND deleted_at IS NULL`,
    [next, userId, orgId, key, branchId]
  )
  if (!upd.rowCount) {
    await query(
      `INSERT INTO module_config (organization_id, branch_id, module_key, is_enabled, updated_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [orgId, branchId, key, next, userId]
    )
  }
  invalidateModuleCache()
  return res.json({ success: true, module_key: key, is_enabled: next })
}
