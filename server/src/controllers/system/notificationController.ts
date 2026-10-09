import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { logAudit } from '../../utils/audit'
import {
  EVENTS, EVENT_META, getNotifySettings, providerConfigured, normalizePhone, queueNotification, sendLogged,
  sendCheckoutReminders, type NotifyEvent, type Provider,
} from '../../utils/notify'

// Systems → Notifications: settings, message log, test message.

const PROVIDERS: Provider[] = ['manual', 'twilio_whatsapp', 'twilio_sms', 'webhook']

export async function getNotificationSettings(req: Request, res: Response) {
  const s = await getNotifySettings(req.auth!.orgId)
  return res.json({
    success: true,
    data: {
      settings: s,
      providers: PROVIDERS.map(p => ({ key: p, ...providerConfigured(p) })),
      events: EVENTS.map(e => ({ key: e, ...EVENT_META[e] })),
    },
  })
}

export async function updateNotificationSettings(req: Request, res: Response) {
  const { orgId, userId, branchId } = req.auth!
  const b = req.body ?? {}
  const cur = await getNotifySettings(orgId)
  if (b.provider !== undefined && !PROVIDERS.includes(b.provider)) return res.status(400).json({ success: false, message: 'Unknown provider' })
  if (b.country_code !== undefined && !/^\d{1,4}$/.test(String(b.country_code))) return res.status(400).json({ success: false, message: 'Country code must be digits only, e.g. 252' })
  const templates = { ...cur.templates }
  for (const e of EVENTS) {
    if (b.templates?.[e] !== undefined) {
      const t = String(b.templates[e]).trim()
      if (t.length < 5 || t.length > 600) return res.status(400).json({ success: false, message: `The "${EVENT_META[e].label}" message must be 5–600 characters` })
      templates[e] = t
    }
  }
  const next = {
    enabled: b.enabled !== undefined ? !!b.enabled : cur.enabled,
    provider: (b.provider ?? cur.provider) as Provider,
    country_code: String(b.country_code ?? cur.country_code),
    events: { ...cur.events, ...Object.fromEntries(EVENTS.filter(e => b.events?.[e] !== undefined).map(e => [e, !!b.events[e]])) },
    templates,
  }
  await query(
    `UPDATE organization SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{notifications}', $2::jsonb, true), updated_at = NOW() WHERE id = $1`,
    [orgId, JSON.stringify(next)])
  logAudit({ userId, branchId, action: 'NOTIFICATION_SETTINGS_UPDATED', req, newValues: { enabled: next.enabled, provider: next.provider } })
  return res.json({ success: true, data: next })
}

export async function listNotifications(req: Request, res: Response) {
  const { orgId } = req.auth!
  const status = req.query.status ? String(req.query.status) : null
  const { rows } = await query(
    `SELECT id, event, channel, to_phone, message, status, error, reference_type, reference_id, created_at, sent_at
     FROM notification_log WHERE organization_id = $1 AND ($2::text IS NULL OR status = $2)
     ORDER BY created_at DESC LIMIT 200`, [orgId, status])
  const { rows: [c] } = await query(
    `SELECT COUNT(*) FILTER (WHERE status = 'manual') AS to_send, COUNT(*) FILTER (WHERE status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE status = 'sent') AS sent FROM notification_log WHERE organization_id = $1`, [orgId])
  return res.json({ success: true, data: { rows, counts: { to_send: Number(c.to_send), failed: Number(c.failed), sent: Number(c.sent) } } })
}

// "I sent it myself via WhatsApp" — manual mode
export async function markNotificationSent(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE notification_log SET status = 'sent', sent_at = NOW(), error = NULL
     WHERE id = $1 AND organization_id = $2 AND status IN ('manual','failed') RETURNING id`, [req.params.id, req.auth!.orgId])
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Message not found or already sent' })
  return res.json({ success: true })
}

export async function retryNotification(req: Request, res: Response) {
  const { orgId } = req.auth!
  const s = await getNotifySettings(orgId)
  const { rows: [n] } = await query(`SELECT id, event, to_phone, message, status FROM notification_log WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId])
  if (!n || n.status !== 'failed') return res.status(404).json({ success: false, message: 'Only a failed message can be retried' })
  const to = normalizePhone(n.to_phone, s.country_code)
  if (!to) return res.status(400).json({ success: false, message: 'That message has no valid phone number' })
  if (s.provider === 'manual') {
    await query(`UPDATE notification_log SET status = 'manual', error = NULL, to_phone = $2 WHERE id = $1`, [n.id, to])
  } else await sendLogged(n.id, s.provider, to, n.message, n.event)
  const { rows: [after] } = await query(`SELECT status, error FROM notification_log WHERE id = $1`, [n.id])
  return res.json({ success: true, data: after })
}

export async function sendTestNotification(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const event = (req.body?.event ?? 'booking_confirmed') as NotifyEvent
  if (!EVENTS.includes(event)) return res.status(400).json({ success: false, message: 'Unknown event' })
  const s = await getNotifySettings(orgId)
  if (!normalizePhone(req.body?.phone, s.country_code)) return res.status(400).json({ success: false, message: 'Enter a valid phone number (e.g. 0615 123 456 or +252 61 5123456)' })
  const { rows: [org] } = await query(`SELECT name FROM organization WHERE id = $1`, [orgId])
  const sample = { guest: 'Test Guest', hotel: org?.name ?? 'Our Hotel', restaurant: org?.name ?? 'Our Restaurant', ref: 'BK-TEST1234', room: '101', checkin: '1 Jan 2027', checkout: '3 Jan 2027',
                   nights: 2, total: '120.00', balance: '40.00', amount: '80.00', date: 'Fri 1 Jan', time: '19:30', party: 4, table: 'T-05' }
  const row = await queueNotification({ orgId, branchId, event, phone: req.body.phone, vars: sample, referenceType: 'test', force: true })
  const { rows: [out] } = row ? await query(`SELECT id, status, error, to_phone, message FROM notification_log WHERE id = $1`, [row.id]) : { rows: [null] }
  return res.json({ success: true, data: out })
}

// Run the morning check-out reminder pass now (also runs by itself every 30 minutes)
export async function runReminders(_req: Request, res: Response) {
  return res.json({ success: true, data: { queued: await sendCheckoutReminders() } })
}
