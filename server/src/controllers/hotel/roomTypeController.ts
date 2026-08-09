import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function listRoomTypes(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT rt.id, rt.name, rt.description, rt.max_adults, rt.max_children,
            rt.bed_configuration, rt.area_sqm, rt.features, rt.is_active,
            COUNT(r.id) AS room_count
     FROM room_type rt
     JOIN hotel h ON h.id = rt.hotel_id
     LEFT JOIN room r ON r.room_type_id = rt.id AND r.deleted_at IS NULL
     WHERE h.branch_id = $1 AND rt.deleted_at IS NULL
     GROUP BY rt.id ORDER BY rt.name`,
    [req.auth!.branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createRoomType(req: Request, res: Response) {
  const { name, description, max_adults = 2, max_children = 1,
          bed_configuration, area_sqm, features = [] } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })

  const { rows: [hotel] } = await query(
    `SELECT id FROM hotel WHERE branch_id = $1`, [req.auth!.branchId]
  )
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found for this branch' })

  const { rows } = await query(
    `INSERT INTO room_type (hotel_id, name, description, max_adults, max_children,
                            bed_configuration, area_sqm, features)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name`,
    [hotel.id, name, description ?? null, max_adults, max_children,
     bed_configuration ?? null, area_sqm ?? null, JSON.stringify(features)]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateRoomType(req: Request, res: Response) {
  const { id } = req.params
  const { name, description, max_adults, max_children,
          bed_configuration, area_sqm, features, is_active } = req.body

  const { rows } = await query(
    `UPDATE room_type SET
       name              = COALESCE($1, name),
       description       = COALESCE($2, description),
       max_adults        = COALESCE($3, max_adults),
       max_children      = COALESCE($4, max_children),
       bed_configuration = COALESCE($5, bed_configuration),
       area_sqm          = COALESCE($6, area_sqm),
       features          = COALESCE($7::jsonb, features),
       is_active         = COALESCE($8, is_active),
       updated_at        = NOW()
     WHERE id = $9 AND deleted_at IS NULL
     RETURNING id, name, is_active`,
    [name ?? null, description ?? null, max_adults ?? null, max_children ?? null,
     bed_configuration ?? null, area_sqm ?? null,
     features ? JSON.stringify(features) : null, is_active ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Room type not found' })
  return res.json({ success: true, data: rows[0] })
}

// ── Rate Plans ────────────────────────────────────────────────────────────────

export async function listRatePlans(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT rp.id, rp.name, rp.price_per_night, rp.min_stay_nights,
            rp.is_breakfast_included, rp.valid_from, rp.valid_to, rp.is_active,
            rt.name AS room_type_name
     FROM rate_plan rp
     JOIN room_type rt ON rt.id = rp.room_type_id
     JOIN hotel h ON h.id = rp.hotel_id
     WHERE h.branch_id = $1 AND rp.deleted_at IS NULL
     ORDER BY rt.name, rp.name`,
    [req.auth!.branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createRatePlan(req: Request, res: Response) {
  const { room_type_id, name, price_per_night, min_stay_nights = 1,
          is_breakfast_included = false, valid_from, valid_to } = req.body
  if (!room_type_id || !name || !price_per_night || !valid_from) {
    return res.status(400).json({ success: false, message: 'room_type_id, name, price_per_night, valid_from are required' })
  }

  const { rows: [hotel] } = await query(
    `SELECT id FROM hotel WHERE branch_id = $1`, [req.auth!.branchId]
  )
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' })

  const { rows } = await query(
    `INSERT INTO rate_plan (hotel_id, room_type_id, name, price_per_night,
                            min_stay_nights, is_breakfast_included, valid_from, valid_to, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, price_per_night`,
    [hotel.id, room_type_id, name, price_per_night, min_stay_nights,
     is_breakfast_included, valid_from, valid_to ?? null, req.auth!.userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateRatePlan(req: Request, res: Response) {
  const { id } = req.params
  const { name, price_per_night, min_stay_nights,
          is_breakfast_included, valid_from, valid_to, is_active } = req.body

  const { rows } = await query(
    `UPDATE rate_plan SET
       name                  = COALESCE($1, name),
       price_per_night       = COALESCE($2, price_per_night),
       min_stay_nights       = COALESCE($3, min_stay_nights),
       is_breakfast_included = COALESCE($4, is_breakfast_included),
       valid_from            = COALESCE($5, valid_from),
       valid_to              = COALESCE($6, valid_to),
       is_active             = COALESCE($7, is_active),
       updated_at            = NOW()
     WHERE id = $8 AND deleted_at IS NULL
     RETURNING id, name, price_per_night, is_active`,
    [name ?? null, price_per_night ?? null, min_stay_nights ?? null,
     is_breakfast_included ?? null, valid_from ?? null, valid_to ?? null,
     is_active ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Rate plan not found' })
  return res.json({ success: true, data: rows[0] })
}

// ── Booking Services ──────────────────────────────────────────────────────────

export async function listBookingServices(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, service_name, service_category, quantity, unit_price, line_total, notes, served_at
     FROM booking_service WHERE booking_id = $1 AND deleted_at IS NULL ORDER BY served_at`,
    [req.params.id]
  )
  return res.json({ success: true, data: rows })
}

export async function addBookingService(req: Request, res: Response) {
  const { service_name, service_category = 'other', quantity = 1, unit_price, notes } = req.body
  if (!service_name || !unit_price) {
    return res.status(400).json({ success: false, message: 'service_name and unit_price are required' })
  }
  const { rows } = await query(
    `INSERT INTO booking_service (booking_id, service_name, service_category, quantity, unit_price, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, service_name, line_total`,
    [req.params.id, service_name, service_category, quantity, unit_price,
     notes ?? null, req.auth!.userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

// ── Guest Loyalty ─────────────────────────────────────────────────────────────

export async function listLoyaltyTransactions(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, points_change, balance_after, reason, reference_type, created_at
     FROM loyalty_transaction WHERE guest_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.guestId]
  )
  return res.json({ success: true, data: rows })
}

export async function addLoyaltyPoints(req: Request, res: Response) {
  const { guestId } = req.params
  const { points_change, reason, reference_type, reference_id } = req.body
  if (!points_change || !reason) {
    return res.status(400).json({ success: false, message: 'points_change and reason are required' })
  }

  const { rows: [g] } = await query(
    `SELECT loyalty_points FROM guest WHERE id = $1`, [guestId]
  )
  if (!g) return res.status(404).json({ success: false, message: 'Guest not found' })

  const newBalance = Number(g.loyalty_points) + Number(points_change)
  await query(`UPDATE guest SET loyalty_points = $1 WHERE id = $2`, [newBalance, guestId])

  const { rows } = await query(
    `INSERT INTO loyalty_transaction (guest_id, points_change, balance_after, reason, reference_type, reference_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, balance_after`,
    [guestId, points_change, newBalance, reason,
     reference_type ?? null, reference_id ?? null, req.auth!.userId]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

// ── Available Rooms ───────────────────────────────────────────────────────────

export async function listAvailableRooms(req: Request, res: Response) {
  const { check_in, check_out, room_type_id } = req.query
  if (!check_in || !check_out) {
    return res.status(400).json({ success: false, message: 'check_in and check_out query params are required' })
  }

  let sql = `
    SELECT r.id, r.room_number, r.floor, r.is_smoking,
           rt.name AS room_type_name, rt.max_adults, rt.max_children,
           rp.price_per_night, rp.is_breakfast_included
    FROM room r
    JOIN room_type rt ON rt.id = r.room_type_id
    JOIN hotel h ON h.id = r.hotel_id
    LEFT JOIN rate_plan rp ON rp.room_type_id = rt.id AND rp.is_active = TRUE
      AND rp.valid_from <= $3::date AND (rp.valid_to IS NULL OR rp.valid_to >= $2::date)
    WHERE h.branch_id = $1
      AND r.deleted_at IS NULL
      AND r.status = 'available'
      AND r.id NOT IN (
        SELECT room_id FROM booking
        WHERE status NOT IN ('cancelled','no_show') AND deleted_at IS NULL
          AND daterange(check_in_date, check_out_date, '[)') &&
              daterange($2::date, $3::date, '[)')
      )`

  const params: any[] = [req.auth!.branchId, check_in, check_out]
  if (room_type_id) {
    params.push(room_type_id)
    sql += ` AND r.room_type_id = $${params.length}`
  }
  sql += ` ORDER BY rt.name, r.room_number`

  const { rows } = await query(sql, params)
  return res.json({ success: true, data: rows })
}
