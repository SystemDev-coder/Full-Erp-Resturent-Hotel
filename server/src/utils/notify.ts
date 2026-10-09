import { query } from '../db/pool'

// Guest notifications (WhatsApp / SMS): booking confirmation, check-out reminder, table reservation, payment receipt.
//
// Providers (chosen in Systems → Notifications; secrets live in server/.env, never in the database):
//   manual           — nothing is sent automatically; each message waits in the log with an "Open WhatsApp" button
//   twilio_whatsapp  — Twilio WhatsApp API      (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)
//   twilio_sms       — Twilio SMS               (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM)
//   webhook          — any gateway you POST to  (NOTIFY_WEBHOOK_URL, optional NOTIFY_WEBHOOK_TOKEN)
// Sending never blocks or breaks the booking/payment that triggered it.

export type NotifyEvent = 'booking_received' | 'booking_confirmed' | 'checkout_reminder' | 'reservation_confirmed' | 'payment_received'
export type Provider = 'manual' | 'twilio_whatsapp' | 'twilio_sms' | 'webhook'

export const EVENT_META: Record<NotifyEvent, { label: string; description: string; vars: string[]; template: string }> = {
  booking_received: {
    label: 'Online request received', description: 'Sent right after a guest asks for a room on your online booking page (before you confirm it).',
    vars: ['guest', 'hotel', 'ref', 'checkin', 'checkout', 'nights', 'total'],
    template: 'Hello {guest}, we received your booking request {ref} at {hotel} for {checkin} → {checkout} ({nights} nights, ${total}). We will confirm it shortly. Thank you!',
  },
  booking_confirmed: {
    label: 'Booking confirmed', description: 'Sent when a room booking is created.',
    vars: ['guest', 'hotel', 'ref', 'room', 'checkin', 'checkout', 'nights', 'total'],
    template: 'Hello {guest}, your booking {ref} at {hotel} is confirmed: room {room}, {checkin} → {checkout} ({nights} nights), total ${total}. We look forward to welcoming you!',
  },
  checkout_reminder: {
    label: 'Check-out reminder', description: 'Sent in the morning of the check-out day to guests who are still in-house.',
    vars: ['guest', 'hotel', 'ref', 'room', 'balance'],
    template: 'Good morning {guest}. A friendly reminder that check-out from room {room} at {hotel} is today. Outstanding balance: ${balance}. Thank you for staying with us!',
  },
  reservation_confirmed: {
    label: 'Table reserved', description: 'Sent when a restaurant table is reserved.',
    vars: ['guest', 'restaurant', 'date', 'time', 'party', 'table'],
    template: 'Hello {guest}, your table for {party} at {restaurant} is reserved for {date} at {time} (table {table}). See you soon!',
  },
  payment_received: {
    label: 'Payment received', description: 'Sent when a payment is recorded on a booking.',
    vars: ['guest', 'hotel', 'ref', 'amount', 'balance'],
    template: 'Thank you {guest}! We received ${amount} for booking {ref} at {hotel}. Remaining balance: ${balance}.',
  },
}
export const EVENTS = Object.keys(EVENT_META) as NotifyEvent[]

export interface NotifySettings {
  enabled: boolean
  provider: Provider
  country_code: string                         // prepended to local numbers that start with 0 (Somalia = 252)
  events: Record<NotifyEvent, boolean>
  templates: Record<NotifyEvent, string>
}

export function defaultSettings(): NotifySettings {
  return {
    enabled: false, provider: 'manual', country_code: '252',
    events: { booking_received: true, booking_confirmed: true, checkout_reminder: true, reservation_confirmed: true, payment_received: true },
    templates: Object.fromEntries(EVENTS.map(e => [e, EVENT_META[e].template])) as Record<NotifyEvent, string>,
  }
}

export async function getNotifySettings(orgId: string): Promise<NotifySettings> {
  const { rows } = await query(`SELECT settings->'notifications' AS n FROM organization WHERE id = $1`, [orgId])
  const saved = rows[0]?.n ?? {}
  const d = defaultSettings()
  return {
    enabled: saved.enabled === true,
    provider: ['manual', 'twilio_whatsapp', 'twilio_sms', 'webhook'].includes(saved.provider) ? saved.provider : d.provider,
    country_code: /^\d{1,4}$/.test(String(saved.country_code ?? '')) ? String(saved.country_code) : d.country_code,
    events: { ...d.events, ...(saved.events ?? {}) },
    templates: Object.fromEntries(EVENTS.map(e => [e, typeof saved.templates?.[e] === 'string' && saved.templates[e].trim() ? saved.templates[e] : d.templates[e]])) as Record<NotifyEvent, string>,
  }
}

export function providerConfigured(p: Provider): { ready: boolean; missing: string[] } {
  const need: Record<Provider, string[]> = {
    manual: [], twilio_whatsapp: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
    twilio_sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM'], webhook: ['NOTIFY_WEBHOOK_URL'],
  }
  const missing = need[p].filter(k => !process.env[k])
  return { ready: missing.length === 0, missing }
}

// "0615 123 456" / "+252 61 5123456" / "252615123456" → "252615123456"; null when it cannot be a phone number
export function normalizePhone(raw: string | null | undefined, countryCode = '252'): string | null {
  if (!raw) return null
  let d = String(raw).replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = countryCode + d.replace(/^0+/, '')
  d = d.replace(/\D/g, '')
  return d.length >= 8 && d.length <= 15 ? d : null
}

export const render = (tpl: string, vars: Record<string, string | number | null | undefined>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])))

async function deliver(provider: Provider, to: string, message: string, event: string): Promise<void> {
  const signal = AbortSignal.timeout(8000)
  if (provider === 'webhook') {
    const r = await fetch(process.env.NOTIFY_WEBHOOK_URL!, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(process.env.NOTIFY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` } : {}) },
      body: JSON.stringify({ to: `+${to}`, message, event, channel: 'whatsapp' }),
    })
    if (!r.ok) throw new Error(`Gateway answered ${r.status}`)
    return
  }
  const wa = provider === 'twilio_whatsapp'
  const from = wa ? process.env.TWILIO_WHATSAPP_FROM! : process.env.TWILIO_SMS_FROM!
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', signal,
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: `${wa ? 'whatsapp:' : ''}+${to}`, From: from, Body: message }).toString(),
  })
  if (!r.ok) throw new Error(`Twilio answered ${r.status}: ${(await r.text()).slice(0, 160)}`)
}

export interface QueueOpts {
  orgId: string; branchId?: string | null
  event: NotifyEvent
  phone: string | null | undefined
  vars: Record<string, string | number | null | undefined>
  referenceType?: string; referenceId?: string
  /** skip when this event was already logged for the same reference (reminders must not repeat) */
  once?: boolean
  /** send even if the master switch / event switch is off (used by "send test") */
  force?: boolean
}

// Log the message and (unless the provider is "manual") send it. Never throws.
export async function queueNotification(o: QueueOpts) {
  try {
    const s = await getNotifySettings(o.orgId)
    if (!o.force && (!s.enabled || !s.events[o.event])) return null
    if (o.once && o.referenceId) {
      const { rows } = await query(`SELECT 1 FROM notification_log WHERE event = $1 AND reference_id = $2 LIMIT 1`, [o.event, o.referenceId])
      if (rows[0]) return null
    }
    const to = normalizePhone(o.phone, s.country_code)
    const message = render(s.templates[o.event], o.vars).trim()
    const channel = s.provider === 'twilio_sms' ? 'sms' : 'whatsapp'
    const status0 = !to ? 'failed' : s.provider === 'manual' ? 'manual' : 'queued'
    const { rows: [row] } = await query(
      `INSERT INTO notification_log (organization_id, branch_id, event, channel, to_phone, message, status, error, reference_type, reference_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, status`,
      [o.orgId, o.branchId ?? null, o.event, channel, to ?? (o.phone ? String(o.phone).slice(0, 30) : null), message, status0,
       to ? null : 'No valid phone number on file', o.referenceType ?? null, o.referenceId ?? null])
    if (status0 === 'queued') await sendLogged(row.id, s.provider, to!, message, o.event)
    return row
  } catch (e) { console.error('[notify] failed to queue:', (e as Error).message); return null }
}

export async function sendLogged(logId: string, provider: Provider, to: string, message: string, event: string) {
  const cfg = providerConfigured(provider)
  if (!cfg.ready) {
    await query(`UPDATE notification_log SET status = 'failed', error = $2 WHERE id = $1`, [logId, `Provider not configured — add ${cfg.missing.join(', ')} to the server .env`])
    return
  }
  try {
    await deliver(provider, to, message, event)
    await query(`UPDATE notification_log SET status = 'sent', sent_at = NOW(), error = NULL WHERE id = $1`, [logId])
  } catch (e) {
    await query(`UPDATE notification_log SET status = 'failed', error = $2 WHERE id = $1`, [logId, (e as Error).message.slice(0, 300)])
  }
}

// ── Check-out reminders ───────────────────────────────────────────────────────
export async function sendCheckoutReminders() {
  const hour = new Date().getHours()
  if (hour < 8 || hour >= 20) return 0            // morning of the check-out day only
  const { rows } = await query(
    `SELECT b.id, b.booking_ref, b.branch_id, br.organization_id AS org_id, org.name AS hotel,
            g.first_name || ' ' || g.last_name AS guest, g.phone, r.room_number,
            GREATEST(b.total_amount + COALESCE((SELECT SUM(bs.line_total) FROM booking_service bs WHERE bs.booking_id = b.id AND bs.deleted_at IS NULL), 0)
                     - COALESCE((SELECT SUM(i.amount_paid) FROM invoice i WHERE i.booking_id = b.id AND i.status <> 'voided' AND i.deleted_at IS NULL), 0), 0) AS balance
     FROM booking b JOIN branch br ON br.id = b.branch_id JOIN organization org ON org.id = br.organization_id
     JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id
     WHERE b.status = 'checked_in' AND b.deleted_at IS NULL AND b.check_out_date = CURRENT_DATE AND g.phone IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.event = 'checkout_reminder' AND n.reference_id = b.id)`)
  let n = 0
  for (const b of rows) {
    const r = await queueNotification({ orgId: b.org_id, branchId: b.branch_id, event: 'checkout_reminder', phone: b.phone, once: true,
      referenceType: 'booking', referenceId: b.id,
      vars: { guest: b.guest, hotel: b.hotel, ref: b.booking_ref, room: b.room_number, balance: Number(b.balance).toFixed(2) } })
    if (r) n++
  }
  return n
}

export function startNotificationScheduler() {
  const tick = () => sendCheckoutReminders().catch(e => console.error('[notify] reminder run failed:', (e as Error).message))
  setTimeout(tick, 120_000).unref()
  setInterval(tick, 30 * 60_000).unref()
}
