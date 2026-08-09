import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function listModules(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { rows } = await query(
    `SELECT id, module_key, is_enabled, branch_id, config
     FROM module_config
     WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
       AND deleted_at IS NULL
     ORDER BY module_key`,
    [orgId, branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function toggleModule(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { key } = req.params
  const { is_enabled, branch_id } = req.body

  await query(
    `INSERT INTO module_config (organization_id, branch_id, module_key, is_enabled, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [orgId, branch_id ?? branchId ?? null, key, is_enabled, req.auth!.userId]
  )

  await query(
    `UPDATE module_config SET is_enabled = $1, updated_at = NOW(), updated_by = $2
     WHERE organization_id = $3 AND module_key = $4
       AND (branch_id = $5 OR (branch_id IS NULL AND $5 IS NULL))`,
    [is_enabled, req.auth!.userId, orgId, key, branch_id ?? branchId ?? null]
  )

  return res.json({ success: true, module_key: key, is_enabled })
}