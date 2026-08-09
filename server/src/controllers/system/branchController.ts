import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function listBranches(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { rows } = await query(
    `SELECT id, name, code, branch_type, city, is_active FROM branch
     WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [orgId]
  )
  return res.json({ success: true, data: rows })
}

export async function getBranch(req: Request, res: Response) {
  const { rows } = await query(`SELECT * FROM branch WHERE id = $1`, [req.params.id])
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Branch not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createBranch(req: Request, res: Response) {
  const { orgId, userId } = req.auth!
  const { name, code, branch_type, address, city, country, phone, email, timezone } = req.body

  if (!name || !code || !branch_type) {
    return res.status(400).json({ success: false, message: 'name, code, and branch_type are required' })
  }

  const { rows } = await query(
    `INSERT INTO branch (organization_id, name, code, branch_type, address, city, country, phone, email, timezone, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, name, code, branch_type`,
    [orgId, name, code, branch_type, address ?? null, city ?? null,
     country ?? 'Somalia', phone ?? null, email ?? null,
     timezone ?? 'Africa/Mogadishu', userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateBranch(req: Request, res: Response) {
  const { id } = req.params
  const { name, address, city, phone, email, is_active } = req.body

  const { rows } = await query(
    `UPDATE branch SET
       name      = COALESCE($1, name),
       address   = COALESCE($2, address),
       city      = COALESCE($3, city),
       phone     = COALESCE($4, phone),
       email     = COALESCE($5, email),
       is_active = COALESCE($6, is_active),
       updated_at = NOW()
     WHERE id = $7 AND deleted_at IS NULL
     RETURNING id, name, code, is_active`,
    [name ?? null, address ?? null, city ?? null,
     phone ?? null, email ?? null, is_active ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Branch not found' })
  return res.json({ success: true, data: rows[0] })
}