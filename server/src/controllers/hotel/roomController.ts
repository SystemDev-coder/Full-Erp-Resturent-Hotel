import { Request, Response } from 'express'
import { query } from '../../db/pool'

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
  const { rows } = await query(`SELECT * FROM room WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Room not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createRoom(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { room_number, floor = 1, room_type_id, is_smoking = false, status = 'available' } = req.body

  if (!room_number || !room_type_id) {
    return res.status(400).json({ success: false, message: 'room_number and room_type_id are required' })
  }

  const { rows: [hotel] } = await query(
    `SELECT id FROM hotel WHERE branch_id = $1 AND deleted_at IS NULL`, [branchId]
  )
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found for this branch' })

  const { rows } = await query(
    `INSERT INTO room (hotel_id, room_type_id, room_number, floor, is_smoking, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, room_number`,
    [hotel.id, room_type_id, room_number, floor, is_smoking, status]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateRoom(req: Request, res: Response) {
  const { id } = req.params
  const { room_number, floor, room_type_id, is_smoking, status } = req.body

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
    [room_number ?? null, floor ?? null, room_type_id ?? null,
     is_smoking ?? null, status ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Room not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteRoom(req: Request, res: Response) {
  await query(
    `UPDATE room SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  return res.json({ success: true })
}

export async function updateRoomStatus(req: Request, res: Response) {
  const validStatuses = ['available', 'occupied', 'maintenance', 'out_of_order', 'cleaning']
  const { status } = req.body
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' })
  }
  await query(
    `UPDATE room SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, req.params.id]
  )
  return res.json({ success: true, message: `Room status updated to ${status}` })
}
