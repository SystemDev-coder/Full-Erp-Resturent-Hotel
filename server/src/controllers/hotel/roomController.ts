import { Request, Response } from 'express'
import { query } from '../../db/pool'

const ROOM_STATUSES = ['available', 'occupied', 'maintenance', 'out_of_order', 'cleaning']

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message })

// A room with a checked-in guest must keep showing as occupied — otherwise it
// could be handed to a second guest. Returns an error message, or null if OK.
async function statusConflict(roomId: string, status: string): Promise<string | null> {
  if (status === 'occupied') return null
  const { rows } = await query(
    `SELECT 1 FROM booking WHERE room_id = $1 AND status = 'checked_in' AND deleted_at IS NULL LIMIT 1`,
    [roomId]
  )
  return rows[0] ? 'A guest is checked in to this room — check them out before changing its status' : null
}

export async function listRooms(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT r.id, r.room_number, r.floor, r.status, r.is_smoking,
            r.room_type_id,
            rt.name AS room_type, rt.max_adults, rt.max_children, rt.bed_configuration
     FROM room r
     JOIN room_type rt ON rt.id = r.room_type_id
     JOIN hotel h ON h.id = r.hotel_id
     WHERE h.branch_id = $1 AND r.deleted_at IS NULL
     ORDER BY r.floor, r.room_number`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function getRoom(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT r.* FROM room r JOIN hotel h ON h.id = r.hotel_id
     WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return fail(res, 404, 'Room not found')
  return res.json({ success: true, data: rows[0] })
}

export async function createRoom(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { room_number, floor = 1, room_type_id, is_smoking = false, status = 'available' } = req.body

  if (!room_number || !room_type_id) return fail(res, 400, 'room_number and room_type_id are required')
  if (!ROOM_STATUSES.includes(status) || status === 'occupied') return fail(res, 400, 'Invalid status')

  const { rows: [hotel] } = await query(
    `SELECT id FROM hotel WHERE branch_id = $1 AND deleted_at IS NULL`, [branchId]
  )
  if (!hotel) return fail(res, 404, 'Hotel not found for this branch')

  // The room type must belong to this branch's hotel
  const { rows: rt } = await query(
    `SELECT 1 FROM room_type WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL`, [room_type_id, hotel.id]
  )
  if (!rt[0]) return fail(res, 404, 'Room type not found in this hotel')

  const { rows: dup } = await query(
    `SELECT 1 FROM room WHERE hotel_id = $1 AND room_number = $2`, [hotel.id, String(room_number).trim()]
  )
  if (dup[0]) return fail(res, 409, `Room ${room_number} already exists`)

  const { rows } = await query(
    `INSERT INTO room (hotel_id, room_type_id, room_number, floor, is_smoking, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, room_number`,
    [hotel.id, room_type_id, String(room_number).trim(), floor, is_smoking, status]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateRoom(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { id } = req.params
  const { room_number, floor, room_type_id, is_smoking, status } = req.body

  const { rows: cur } = await query(
    `SELECT r.hotel_id FROM room r JOIN hotel h ON h.id = r.hotel_id
     WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL`,
    [id, branchId]
  )
  if (!cur[0]) return fail(res, 404, 'Room not found')

  if (status !== undefined && status !== null) {
    if (!ROOM_STATUSES.includes(status)) return fail(res, 400, 'Invalid status')
    const conflict = await statusConflict(id, status)
    if (conflict) return fail(res, 409, conflict)
  }
  if (room_type_id) {
    const { rows: rt } = await query(
      `SELECT 1 FROM room_type WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL`, [room_type_id, cur[0].hotel_id]
    )
    if (!rt[0]) return fail(res, 404, 'Room type not found in this hotel')
  }
  if (room_number) {
    const { rows: dup } = await query(
      `SELECT 1 FROM room WHERE hotel_id = $1 AND room_number = $2 AND id <> $3`,
      [cur[0].hotel_id, String(room_number).trim(), id]
    )
    if (dup[0]) return fail(res, 409, `Room ${room_number} already exists`)
  }

  const { rows } = await query(
    `UPDATE room SET
       room_number  = COALESCE($1, room_number),
       floor        = COALESCE($2, floor),
       room_type_id = COALESCE($3, room_type_id),
       is_smoking   = COALESCE($4, is_smoking),
       status       = COALESCE($5, status),
       updated_at   = NOW()
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING id, room_number`,
    [room_number ? String(room_number).trim() : null, floor ?? null, room_type_id ?? null,
     is_smoking ?? null, status ?? null, id]
  )
  return res.json({ success: true, data: rows[0] })
}

export async function deleteRoom(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { id } = req.params

  const { rows: cur } = await query(
    `SELECT 1 FROM room r JOIN hotel h ON h.id = r.hotel_id
     WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL`,
    [id, branchId]
  )
  if (!cur[0]) return fail(res, 404, 'Room not found')

  // Never delete a room that still has a stay or an upcoming reservation
  const { rows: open } = await query(
    `SELECT 1 FROM booking
     WHERE room_id = $1 AND deleted_at IS NULL AND status IN ('pending','confirmed','checked_in') LIMIT 1`,
    [id]
  )
  if (open[0]) return fail(res, 409, 'This room has active or upcoming bookings — cancel or move them first')

  await query(`UPDATE room SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`, [id, userId])
  return res.json({ success: true })
}

export async function updateRoomStatus(req: Request, res: Response) {
  const { status } = req.body
  if (!ROOM_STATUSES.includes(status)) return fail(res, 400, 'Invalid status')

  const { rows: cur } = await query(
    `SELECT 1 FROM room r JOIN hotel h ON h.id = r.hotel_id
     WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL`,
    [req.params.id, req.auth!.branchId]
  )
  if (!cur[0]) return fail(res, 404, 'Room not found')

  const conflict = await statusConflict(req.params.id, status)
  if (conflict) return fail(res, 409, conflict)

  await query(`UPDATE room SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id])
  return res.json({ success: true, message: `Room status updated to ${status}` })
}
