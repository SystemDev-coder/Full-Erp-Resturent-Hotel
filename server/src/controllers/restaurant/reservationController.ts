import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { notifyReservation } from '../../utils/notifyHooks'

const RES_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']
const DEFAULT_SITTING_HOURS = 2

// A reservation belongs to a branch through its table → area → restaurant
const TABLE_IN_BRANCH = `dining_table_id IN (
  SELECT dt.id FROM dining_table dt
  JOIN table_area ta ON ta.id = dt.area_id JOIN restaurant r ON r.id = ta.restaurant_id
  WHERE r.branch_id = $BRANCH)`

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
  const { branchId, orgId } = req.auth!
  const { dining_table_id, guest_id, reserved_at, expected_end_at, walk_in_name, walk_in_phone, notes } = req.body
  const partySize = Number(req.body.party_size ?? 1)

  if (!dining_table_id || !reserved_at) {
    return res.status(400).json({ success: false, message: 'dining_table_id and reserved_at are required' })
  }
  if (!guest_id && !walk_in_name) {
    return res.status(400).json({ success: false, message: 'Either guest_id or walk_in_name is required' })
  }
  const start = new Date(reserved_at)
  if (Number.isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'reserved_at is not a valid date/time' })
  if (start.getTime() < Date.now() - 15 * 60_000) return res.status(400).json({ success: false, message: 'A reservation cannot be in the past' })
  const end = expected_end_at ? new Date(expected_end_at) : new Date(start.getTime() + DEFAULT_SITTING_HOURS * 3_600_000)
  if (Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ success: false, message: 'expected_end_at must be after reserved_at' })
  if (!Number.isInteger(partySize) || partySize < 1) return res.status(400).json({ success: false, message: 'party_size must be at least 1' })

  // Table must belong to this branch and seat the party
  const { rows: tbl } = await query(
    `SELECT dt.capacity, dt.status FROM dining_table dt
     JOIN table_area ta ON ta.id = dt.area_id JOIN restaurant r ON r.id = ta.restaurant_id
     WHERE dt.id = $1 AND r.branch_id = $2 AND dt.deleted_at IS NULL`,
    [dining_table_id, branchId]
  )
  if (!tbl[0]) return res.status(404).json({ success: false, message: 'Table not found in this branch' })
  if (tbl[0].status === 'inactive') return res.status(409).json({ success: false, message: 'This table is inactive' })
  if (partySize > Number(tbl[0].capacity)) {
    return res.status(400).json({ success: false, message: `This table seats ${tbl[0].capacity} — party of ${partySize} does not fit` })
  }
  if (guest_id) {
    const { rows } = await query(`SELECT 1 FROM guest WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [guest_id, orgId])
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Guest not found' })
  }

  // No double-booking the same table in an overlapping time window
  const { rows: clash } = await query(
    `SELECT 1 FROM table_reservation
     WHERE dining_table_id = $1 AND deleted_at IS NULL AND status IN ('pending','confirmed','seated')
       AND tstzrange(reserved_at, COALESCE(expected_end_at, reserved_at + INTERVAL '${DEFAULT_SITTING_HOURS} hours')) &&
           tstzrange($2::timestamptz, $3::timestamptz)
     LIMIT 1`,
    [dining_table_id, start.toISOString(), end.toISOString()]
  )
  if (clash[0]) return res.status(409).json({ success: false, message: 'That table is already reserved at that time' })

  const { rows } = await query(
    `INSERT INTO table_reservation
       (dining_table_id, guest_id, reserved_at, expected_end_at, party_size,
        walk_in_name, walk_in_phone, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, reserved_at, status`,
    [dining_table_id, guest_id ?? null, start.toISOString(), end.toISOString(),
     partySize, walk_in_name ?? null, walk_in_phone ?? null, notes ?? null]
  )
  notifyReservation(rows[0].id)
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateReservationStatus(req: Request, res: Response) {
  const { id } = req.params
  const { status } = req.body
  if (!RES_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${RES_STATUSES.join(', ')}` })
  }

  const { rows } = await query(
    `UPDATE table_reservation SET status = $1
     WHERE id = $2 AND deleted_at IS NULL AND ${TABLE_IN_BRANCH.replace('$BRANCH', '$3')}
       AND status NOT IN ('completed','cancelled','no_show')
     RETURNING id, status`,
    [status, id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Reservation not found or already finished' })
  return res.json({ success: true, data: rows[0] })
}

export async function cancelReservation(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE table_reservation SET status = 'cancelled'
     WHERE id = $1 AND deleted_at IS NULL AND ${TABLE_IN_BRANCH.replace('$BRANCH', '$2')}
       AND status IN ('pending','confirmed')
     RETURNING id`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Reservation not found or can no longer be cancelled' })
  return res.json({ success: true })
}
