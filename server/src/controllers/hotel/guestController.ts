import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

export async function listGuests(req: Request, res: Response) {
  const { orgId } = req.auth!
  const search = req.query.q as string
  // Default limit (100) matches the old hardcoded cap, so dropdown pickers
  // that call this without ?limit=/&offset= keep behaving exactly as before.
  // The Guests DataTable's "Load More" explicitly sends limit=50&offset=N.
  const { limit, offset } = getPagination(req, 100)
  let sql = `SELECT id, first_name, last_name, email, phone, nationality,
                    id_type, id_number, id_document_image,
                    loyalty_tier, loyalty_points, date_of_birth, created_at
             FROM guest WHERE organization_id = $1 AND deleted_at IS NULL`
  const params: any[] = [orgId]
  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)`
  }
  params.push(limit + 1, offset)
  sql += ` ORDER BY last_name, first_name LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await query(sql, params)
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function getGuest(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT * FROM guest WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.auth!.orgId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Guest not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createGuest(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const {
    first_name, last_name, email, phone,
    id_type, id_number, id_document_image, nationality, date_of_birth,
    gender, address, notes,
    opening_balance = 0, // what the guest already owed before the system existed
  } = req.body

  if (!first_name || !last_name || (!email && !phone)) {
    return res.status(400).json({ success: false, message: 'first_name, last_name, and email or phone are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [guest] } = await client.query(
      `INSERT INTO guest
         (organization_id, first_name, last_name, email, phone,
          id_type, id_number, id_document_image, nationality, date_of_birth, gender, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, first_name, last_name, email, phone`,
      [orgId, first_name, last_name, email ?? null, phone ?? null,
       id_type ?? null, id_number ?? null, id_document_image ?? null, nationality ?? null,
       date_of_birth ?? null, gender ?? null, address ?? null, notes ?? null]
    )

    // Pre-system debt becomes a real unpaid invoice — future payments settle it
    // through the normal Receipts → Record Payment flow.
    if (Number(opening_balance) > 0 && branchId) {
      const invNo = 'OB-' + Date.now().toString(36).toUpperCase()
      await client.query(
        `INSERT INTO invoice (branch_id, guest_id, invoice_number, invoice_date,
                              subtotal, total_amount, status, notes, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,$4,$4,'issued',$5,$6)`,
        [branchId, guest.id, invNo, Number(opening_balance),
         'Opening balance — owed before system start', userId]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: guest })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateGuest(req: Request, res: Response) {
  const { id } = req.params
  const {
    first_name, last_name, email, phone,
    id_type, id_number, id_document_image, nationality, date_of_birth,
    gender, address, notes,
  } = req.body

  const { rows } = await query(
    `UPDATE guest SET
       first_name        = COALESCE($1,  first_name),
       last_name         = COALESCE($2,  last_name),
       email             = COALESCE($3,  email),
       phone             = COALESCE($4,  phone),
       id_type           = COALESCE($5,  id_type),
       id_number         = COALESCE($6,  id_number),
       id_document_image = COALESCE($7,  id_document_image),
       nationality       = COALESCE($8,  nationality),
       date_of_birth     = COALESCE($9,  date_of_birth),
       gender            = COALESCE($10, gender),
       address           = COALESCE($11, address),
       notes             = COALESCE($12, notes),
       updated_at        = NOW()
     WHERE id = $13 AND organization_id = $14 AND deleted_at IS NULL
     RETURNING id, first_name, last_name, email, phone`,
    [first_name ?? null, last_name ?? null, email ?? null, phone ?? null,
     id_type ?? null, id_number ?? null, id_document_image ?? null, nationality ?? null,
     date_of_birth ?? null, gender ?? null, address ?? null, notes ?? null, id, req.auth!.orgId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Guest not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteGuest(req: Request, res: Response) {
  const { orgId, userId } = req.auth!
  const { id } = req.params

  const { rows: open } = await query(
    `SELECT 1 FROM booking
     WHERE primary_guest_id = $1 AND deleted_at IS NULL AND status IN ('pending','confirmed','checked_in') LIMIT 1`,
    [id]
  )
  if (open[0]) {
    return res.status(409).json({ success: false, message: 'This guest has active or upcoming bookings — cancel or complete them first' })
  }

  const { rows } = await query(
    `UPDATE guest SET deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id`,
    [id, orgId, userId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Guest not found' })
  return res.json({ success: true })
}
