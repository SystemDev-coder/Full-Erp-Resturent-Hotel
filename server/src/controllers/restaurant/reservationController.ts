import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function listReservations(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { date, status } = req.query

  let sql = `
    SELECT tr.id, tr.reserved_at, tr.expected_end_at, tr.party_size, tr.status,
           tr.walk_in_name, tr.walk_in_phone, tr.notes,
           dt.table_number, ta.name AS area_name,
           g.first_name || ' ' || g.last_name AS guest_name, g.phone AS guest_phone
    FROM table_reservation tr
    JOIN dining_table dt ON dt.id = tr.dining_table_id
    JOIN table_area ta ON ta.id = dt.area_id
    JOIN restaurant r ON r.id = ta.restaurant_id
    LEFT JOIN guest g ON g.id = tr.guest_id
    WHERE r.branch_id = $1 AND tr.deleted_at IS NULL`

  const params: any[] = [branchId]
  if (date)   { params.push(date);   sql += ` AND DATE(tr.reserved_at) = $${params.length}` }
  if (status) { params.push(status); sql += ` AND tr.status = $${params.length}` }
  sql += ` ORDER BY tr.reserved_at LIMIT 100`

  const { rows } = await query(sql, params)
  return res.json({ success: true, data: rows })
}

export async function createReservation(req: Request, res: Response) {
  const { dining_table_id, guest_id, reserved_at, expected_end_at,
          party_size = 1, walk_in_name, walk_in_phone, notes } = req.body

  if (!dining_table_id || !reserved_at) {
    return res.status(400).json({ success: false, message: 'dining_table_id and reserved_at are required' })
  }
  if (!guest_id && !walk_in_name) {
    return res.status(400).json({ success: false, message: 'Either guest_id or walk_in_name is required' })
  }

  const { rows } = await query(
    `INSERT INTO table_reservation
       (dining_table_id, guest_id, reserved_at, expected_end_at, party_size,
        walk_in_name, walk_in_phone, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, reserved_at, status`,
    [dining_table_id, guest_id ?? null, reserved_at, expected_end_at ?? null,
     party_size, walk_in_name ?? null, walk_in_phone ?? null, notes ?? null]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateReservationStatus(req: Request, res: Response) {
  const { id } = req.params
  const { status } = req.body
  const VALID = ['pending','confirmed','seated','completed','cancelled','no_show']
  if (!VALID.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${VALID.join(', ')}` })
  }

  const { rows } = await query(
    `UPDATE table_reservation SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, status`,
    [status, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Reservation not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function cancelReservation(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE table_reservation SET status = 'cancelled' WHERE id = $1 RETURNING id`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Reservation not found' })
  return res.json({ success: true })
}
