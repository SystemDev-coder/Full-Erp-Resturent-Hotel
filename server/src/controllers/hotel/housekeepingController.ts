import { Request, Response } from 'express'
import { query } from '../../db/pool'

export async function listHKTasks(req: Request, res: Response) {
  const { branchId } = req.auth!
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0]
  const { rows } = await query(
    `SELECT hk.id, hk.task_type, hk.status, hk.scheduled_for,
            hk.room_id, hk.notes, hk.assigned_to AS assigned_to_id,
            r.room_number, rt.name AS room_type,
            s.first_name || ' ' || s.last_name AS assigned_to_name
     FROM housekeeping_task hk
     JOIN room r ON r.id = hk.room_id
     JOIN room_type rt ON rt.id = r.room_type_id
     JOIN hotel h ON h.id = r.hotel_id
     LEFT JOIN staff s ON s.id = hk.assigned_to
     WHERE h.branch_id = $1 AND hk.scheduled_for::date = $2 AND hk.deleted_at IS NULL
     ORDER BY hk.status, r.room_number`,
    [branchId, date]
  )
  return res.json({ success: true, data: rows })
}

export async function createHKTask(req: Request, res: Response) {
  const { room_id, task_type, scheduled_for, notes, assigned_to } = req.body
  if (!room_id || !task_type || !scheduled_for) {
    return res.status(400).json({ success: false, message: 'room_id, task_type, and scheduled_for are required' })
  }
  const { rows } = await query(
    `INSERT INTO housekeeping_task (room_id, task_type, scheduled_for, notes, assigned_to)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [room_id, task_type, scheduled_for, notes ?? null, assigned_to ?? null]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateHKTask(req: Request, res: Response) {
  const { id } = req.params
  const { room_id, task_type, scheduled_for, notes, assigned_to } = req.body
  const { rows } = await query(
    `UPDATE housekeeping_task SET
       room_id       = COALESCE($1::uuid,        room_id),
       task_type     = COALESCE($2::varchar,      task_type),
       scheduled_for = COALESCE($3::timestamptz,  scheduled_for),
       notes         = COALESCE($4::text,         notes),
       assigned_to   = COALESCE($5::uuid,         assigned_to),
       updated_at    = NOW()
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING id`,
    [room_id ?? null, task_type ?? null, scheduled_for ?? null, notes ?? null, assigned_to ?? null, id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Task not found' })
  return res.json({ success: true })
}

export async function deleteHKTask(req: Request, res: Response) {
  await query(
    `UPDATE housekeeping_task SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  return res.json({ success: true })
}

export async function assignHKTask(req: Request, res: Response) {
  const { staff_id } = req.body
  await query(`UPDATE housekeeping_task SET assigned_to = $1 WHERE id = $2`, [staff_id, req.params.id])
  return res.json({ success: true })
}

export async function updateHKStatus(req: Request, res: Response) {
  const { status } = req.body
  await query(
    `UPDATE housekeeping_task SET status = $1,
     completed_at = CASE WHEN $1::varchar = 'completed' THEN NOW() ELSE completed_at END
     WHERE id = $2`,
    [status, req.params.id]
  )
  return res.json({ success: true })
}
