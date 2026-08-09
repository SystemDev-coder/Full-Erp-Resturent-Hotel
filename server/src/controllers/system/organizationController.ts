import { Request, Response } from 'express'
import { query } from '../../db/pool'

// ─── Company Info (organization) ──────────────────────────────────────────────

export async function getOrganization(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { rows } = await query(
    `SELECT o.id, o.name, o.legal_name, o.tax_id, o.default_timezone,
            o.phone, o.email, o.vat_rate, o.logo_url, o.banner_url, o.created_at,
            (SELECT COUNT(*) FROM branch b WHERE b.organization_id = o.id AND b.deleted_at IS NULL)     AS branch_count,
            (SELECT COUNT(*) FROM users u  WHERE u.organization_id = o.id AND u.deleted_at IS NULL)     AS user_count
     FROM organization o WHERE o.id = $1`,
    [orgId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Organization not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function updateOrganization(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { name, legal_name, tax_id, default_timezone, phone, email, vat_rate, logo_url, banner_url } = req.body

  if (vat_rate !== undefined && (Number.isNaN(Number(vat_rate)) || Number(vat_rate) < 0 || Number(vat_rate) > 100)) {
    return res.status(400).json({ success: false, message: 'VAT rate must be between 0 and 100' })
  }

  const { rows } = await query(
    `UPDATE organization SET
       name             = COALESCE($1, name),
       legal_name       = COALESCE($2, legal_name),
       tax_id           = COALESCE($3, tax_id),
       default_timezone = COALESCE($4, default_timezone),
       phone            = COALESCE($5, phone),
       email            = COALESCE($6, email),
       vat_rate         = COALESCE($7, vat_rate),
       logo_url         = COALESCE($8, logo_url),
       banner_url       = COALESCE($9, banner_url),
       updated_at       = NOW()
     WHERE id = $10
     RETURNING id, name, legal_name, tax_id, phone, email, vat_rate, logo_url, banner_url`,
    [name ?? null, legal_name ?? null, tax_id ?? null,
     default_timezone ?? null, phone ?? null, email ?? null,
     vat_rate !== undefined ? Number(vat_rate) : null,
     logo_url ?? null, banner_url ?? null, orgId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Organization not found' })
  return res.json({ success: true, data: rows[0] })
}
