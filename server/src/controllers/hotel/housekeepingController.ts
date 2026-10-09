import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'

const TASK_TYPES    = ['checkout_clean', 'stayover_clean', 'turndown', 'inspection', 'deep_clean']
const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'inspected', 'skipped']
// Finishing one of these returns a "cleaning" room to service
const RELEASES_ROOM = ['checkout_clean', 'deep_clean']

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message })

const roomInBranch = async (roomId: string, branchId: string) => {
  const { rows } = await query(
    `SELECT 1 FROM room r JOIN hotel h ON h.id = r.hotel_id
     WHERE r.id = $1 AND h.branch_id = $2 AND r.deleted_at IS NULL`,
    [roomId, branchId]
  )
  return !!rows[0]
}

const staffInBranch = async (staffId: string, branchId: string) => {
  const { rows } = await query(
    `SELECT 1 FROM staff WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL`,
    [staffId, branchId]
  )
  return !!rows[0]
}

const findTask = async (id: string, branchId: string) => {
  const { rows } = await query(
    `SELECT hk.id, hk.room_id, hk.task_type, hk.status
     FROM housekeeping_task hk
     JOIN room r ON r.id = hk.room_id
     JOIN hotel h ON h.id = r.hotel_id
     WHERE hk.id = $1 AND h.branch_id = $2 AND hk.deleted_at IS NULL`,
    [id, branchId]
  )
  return rows[0] as { id: string; room_id: string; task_type: string; status: string } | undefined
}

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
  const { branchId } = req.auth!
  const { room_id, task_type, scheduled_for, notes, assigned_to } = req.body
  if (!room_id || !task_type || !scheduled_for) {
    return fail(res, 400, 'room_id, task_type, and scheduled_for are required')
  }
  if (!TASK_TYPES.includes(task_type)) return fail(res, 400, `task_type must be one of: ${TASK_TYPES.join(', ')}`)
  if (!(await roomInBranch(room_id, branchId))) return fail(res, 404, 'Room not found in this branch')
  if (assigned_to && !(await staffInBranch(assigned_to, branchId))) return fail(res, 404, 'Staff member not found in this branch')

  const { rows } = await query(
    `INSERT INTO housekeeping_task (room_id, task_type, scheduled_for, notes, assigned_to)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [room_id, task_type, scheduled_for, notes ?? null, assigned_to ?? null]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateHKTask(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { id } = req.params
  const { room_id, task_type, scheduled_for, notes, assigned_to } = req.body

  if (!(await findTask(id, branchId))) return fail(res, 404, 'Task not found')
  if (task_type && !TASK_TYPES.includes(task_type)) return fail(res, 400, `task_type must be one of: ${TASK_TYPES.join(', ')}`)
  if (room_id && !(await roomInBranch(room_id, branchId))) return fail(res, 404, 'Room not found in this branch')
  if (assigned_to && !(await staffInBranch(assigned_to, branchId))) return fail(res, 404, 'Staff member not found in this branch')

  await query(
    `UPDATE housekeeping_task SET
       room_id       = COALESCE($1::uuid,        room_id),
       task_type     = COALESCE($2::varchar,      task_type),
       scheduled_for = COALESCE($3::date,         scheduled_for),
       notes         = COALESCE($4::text,         notes),
       assigned_to   = COALESCE($5::uuid,         assigned_to),
       updated_at    = NOW()
     WHERE id = $6 AND deleted_at IS NULL`,
    [room_id ?? null, task_type ?? null, scheduled_for ?? null, notes ?? null, assigned_to ?? null, id]
  )
  return res.json({ success: true })
}

export async function deleteHKTask(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  if (!(await findTask(req.params.id, branchId))) return fail(res, 404, 'Task not found')
  await query(
    `UPDATE housekeeping_task SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
    [req.params.id, userId]
  )
  return res.json({ success: true })
}

export async function assignHKTask(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { staff_id } = req.body
  if (!staff_id) return fail(res, 400, 'staff_id is required')
  if (!(await findTask(req.params.id, branchId))) return fail(res, 404, 'Task not found')
  if (!(await staffInBranch(staff_id, branchId))) return fail(res, 404, 'Staff member not found in this branch')

  await query(`UPDATE housekeeping_task SET assigned_to = $1, updated_at = NOW() WHERE id = $2`, [staff_id, req.params.id])
  return res.json({ success: true })
}

export async function updateHKStatus(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { status } = req.body
  if (!TASK_STATUSES.includes(status)) return fail(res, 400, `status must be one of: ${TASK_STATUSES.join(', ')}`)

  const task = await findTask(req.params.id, branchId)
  if (!task) return fail(res, 404, 'Task not found')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE housekeeping_task SET
         status       = $1::varchar,
         started_at   = CASE WHEN $1::varchar = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN $1::varchar IN ('completed','inspected') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
         inspected_by = CASE WHEN $1::varchar = 'inspected' THEN $3::uuid ELSE inspected_by END,
         updated_at   = NOW()
       WHERE id = $2`,
      [status, task.id, userId]
    )

    // A finished checkout/deep clean puts the room back in service — but only
    // if it is still waiting on cleaning and nobody is staying in it.
    if (['completed', 'inspected'].includes(status) && RELEASES_ROOM.includes(task.task_type)) {
      await client.query(
        `UPDATE room SET status = 'available', updated_at = NOW()
         WHERE id = $1 AND status = 'cleaning'
           AND NOT EXISTS (SELECT 1 FROM booking WHERE room_id = $1 AND status = 'checked_in' AND deleted_at IS NULL)`,
        [task.room_id]
      )
    }
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}
