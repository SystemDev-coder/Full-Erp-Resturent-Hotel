import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { query, pool } from '../../db/pool'
import { logAudit } from '../../utils/audit'
import { notifyBookingReceived, notifyBookingCreated } from '../../utils/notifyHooks'

// ── Online booking ────────────────────────────────────────────────────────────
// A public page (/book/<branchId>) where a guest picks dates and a room type and leaves their details.
// The request becomes a PENDING booking (source "online") that holds the room; the front desk confirms it.
// An unconfirmed request is released automatically after `hold_hours` so strangers cannot block rooms forever.
// Switched OFF until an administrator turns it on (Systems → Online booking).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULTS = { enabled: false, hold_hours: 24, max_nights: 30, terms: '' }
const todayStr = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const r2 = (n: number) => Math.round(n * 100) / 100
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message })

export type OnlineSettings = typeof DEFAULTS
export async function getOnlineSettings(orgId: string): Promise<OnlineSettings> {
  const { rows } = await query(`SELECT settings->'online_booking' AS s FROM organization WHERE id = $1`, [orgId])
  const s = rows[0]?.s ?? {}
  const hold = Number(s.hold_hours), nights = Number(s.max_nights)
  return {
    enabled: s.enabled === true,
    hold_hours: Number.isInteger(hold) && hold >= 1 && hold <= 168 ? hold : DEFAULTS.hold_hours,
    max_nights: Number.isInteger(nights) && nights >= 1 && nights <= 90 ? nights : DEFAULTS.max_nights,
    terms: typeof s.terms === 'string' ? s.terms.slice(0, 1000) : '',
  }
}

// Branch → hotel + org, only when online booking is on
async function openHotel(branchId: string): Promise<any | null> {
  if (!UUID_RE.test(branchId)) return null
  const { rows: [h] } = await query(
    `SELECT h.id AS hotel_id, h.check_in_time, h.check_out_time, h.amenities, h.policies, b.id AS branch_id, b.name AS branch_name,
            o.id AS org_id, o.name AS org_name, o.logo_url, o.phone, o.email, o.address
     FROM hotel h JOIN branch b ON b.id = h.branch_id AND b.deleted_at IS NULL JOIN organization o ON o.id = b.organization_id
     WHERE h.branch_id = $1 AND h.deleted_at IS NULL`, [branchId])
  if (!h) return null
  const settings = await getOnlineSettings(h.org_id)
  return settings.enabled ? { ...h, settings } : null
}

const RATE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT id, price_per_night, is_breakfast_included FROM rate_plan
    WHERE room_type_id = rt.id AND is_active = TRUE AND deleted_at IS NULL
      AND valid_from <= $3::date AND (valid_to IS NULL OR valid_to >= $2::date) AND min_stay_nights <= $4
    ORDER BY price_per_night ASC LIMIT 1
  ) rp ON TRUE`

// Types with at least one room free for the whole stay
const AVAILABILITY_SQL = `
  SELECT rt.id, rt.name, rt.description, rt.max_adults, rt.max_children, rt.bed_configuration, rt.area_sqm, rt.features,
         rp.id AS rate_plan_id, rp.price_per_night, rp.is_breakfast_included,
         (SELECT COUNT(*) FROM room r WHERE r.room_type_id = rt.id AND r.deleted_at IS NULL AND r.status NOT IN ('maintenance','out_of_order')
            AND NOT EXISTS (SELECT 1 FROM booking b WHERE b.room_id = r.id AND b.deleted_at IS NULL AND b.status NOT IN ('cancelled','no_show')
                            AND daterange(b.check_in_date, b.check_out_date, '[)') && daterange($2::date, $3::date, '[)'))) AS available
  FROM room_type rt ${RATE_LATERAL}
  WHERE rt.hotel_id = $1 AND rt.deleted_at IS NULL AND rt.is_active = TRUE`

function parseStay(q: Record<string, unknown>, maxNights: number) {
  const check_in = q.check_in, check_out = q.check_out
  if (!isDay(check_in) || !isDay(check_out)) return { error: 'Choose your arrival and departure dates.' }
  if (check_in < todayStr()) return { error: 'The arrival date cannot be in the past.' }
  if (check_out <= check_in) return { error: 'The departure date must be after the arrival date.' }
  const nights = nightsBetween(check_in, check_out)
  if (nights > maxNights) return { error: `Online bookings are limited to ${maxNights} nights — please contact the hotel for longer stays.` }
  if (nightsBetween(todayStr(), check_in) > 540) return { error: 'We cannot take bookings that far ahead online.' }
  const adults = Math.floor(Number(q.adults ?? 2)), children = Math.floor(Number(q.children ?? 0))
  if (!(adults >= 1 && adults <= 10) || !(children >= 0 && children <= 10)) return { error: 'Check the number of guests.' }
  return { check_in, check_out, nights, adults, children }
}

export async function getPublicHotel(req: Request, res: Response) {
  const h = await openHotel(req.params.branchId)
  if (!h) return fail(res, 404, 'Online booking is not available for this hotel.')
  return res.json({
    success: true,
    data: {
      name: h.org_name, branch: h.branch_name, logo_url: h.logo_url, phone: h.phone, email: h.email, address: h.address,
      check_in_time: String(h.check_in_time).slice(0, 5), check_out_time: String(h.check_out_time).slice(0, 5),
      amenities: h.amenities, terms: h.settings.terms, hold_hours: h.settings.hold_hours, max_nights: h.settings.max_nights,
    },
  })
}

export async function getPublicAvailability(req: Request, res: Response) {
  const h = await openHotel(req.params.branchId)
  if (!h) return fail(res, 404, 'Online booking is not available for this hotel.')
  const stay = parseStay(req.query, h.settings.max_nights)
  if ('error' in stay) return fail(res, 400, stay.error!)
  const { rows } = await query(AVAILABILITY_SQL, [h.hotel_id, stay.check_in, stay.check_out, stay.nights])
  const types = rows
    .filter((r: any) => r.price_per_night !== null && Number(r.available) > 0 && stay.adults <= r.max_adults && stay.children <= r.max_children)
    .map((r: any) => ({
      id: r.id, name: r.name, description: r.description, bed_configuration: r.bed_configuration, area_sqm: r.area_sqm, features: r.features,
      max_adults: r.max_adults, max_children: r.max_children, breakfast: r.is_breakfast_included,
      price_per_night: Number(r.price_per_night), total: r2(Number(r.price_per_night) * stay.nights),
      left: Math.min(Number(r.available), 9),
    }))
  return res.json({ success: true, data: { check_in: stay.check_in, check_out: stay.check_out, nights: stay.nights, adults: stay.adults, children: stay.children, room_types: types } })
}

export async function createPublicBooking(req: Request, res: Response) {
  const b = req.body ?? {}
  // Honeypot: real people never see/fill this field. Pretend it worked so bots learn nothing.
  if (clean(b.website, 50) !== '') return res.status(201).json({ success: true, data: { booking_ref: 'BK-' + randomBytes(4).toString('hex').toUpperCase(), status: 'pending' } })

  const h = await openHotel(req.params.branchId)
  if (!h) return fail(res, 404, 'Online booking is not available for this hotel.')
  const stay = parseStay({ check_in: b.check_in, check_out: b.check_out, adults: b.adults, children: b.children }, h.settings.max_nights)
  if ('error' in stay) return fail(res, 400, stay.error!)

  const first = clean(b.first_name, 100), last = clean(b.last_name, 100) || '-', phone = clean(b.phone, 30), email = clean(b.email, 255).toLowerCase()
  if (!first) return fail(res, 400, 'Please enter your name.')
  if (phone.replace(/\D/g, '').length < 7) return fail(res, 400, 'Please enter a phone number we can reach you on (with country code).')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'That email address does not look right.')
  if (!UUID_RE.test(String(b.room_type_id ?? ''))) return fail(res, 400, 'Choose a room type.')
  const requests = clean(b.special_requests, 500)

  const tail = phone.replace(/\D/g, '').slice(-9)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // price + capacity are checked again on the server — nothing from the page is trusted
    const { rows: types } = await client.query(AVAILABILITY_SQL + ' AND rt.id = $5', [h.hotel_id, stay.check_in, stay.check_out, stay.nights, b.room_type_id])
    const rt = types[0]
    if (!rt || rt.price_per_night === null) { await client.query('ROLLBACK'); return fail(res, 404, 'That room type is not available for those dates.') }
    if (stay.adults > rt.max_adults || stay.children > rt.max_children) { await client.query('ROLLBACK'); return fail(res, 400, `That room sleeps at most ${rt.max_adults} adults and ${rt.max_children} children.`) }

    // guest: reuse the one already on file (same phone or email), never one that is blacklisted
    const { rows: [g0] } = await client.query(
      `SELECT id, is_blacklisted FROM guest WHERE organization_id = $1 AND deleted_at IS NULL
         AND (right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = $2 OR ($3 <> '' AND lower(email) = $3)) ORDER BY created_at LIMIT 1`, [h.org_id, tail, email])
    if (g0?.is_blacklisted) { await client.query('ROLLBACK'); return fail(res, 409, 'Sorry, we cannot take this booking online. Please call the hotel.') }

    // a person cannot hold many rooms without the hotel confirming any
    const { rows: [open] } = await client.query(
      `SELECT COUNT(*) AS n FROM booking b JOIN guest g ON g.id = b.primary_guest_id
       WHERE b.branch_id = $1 AND b.source = 'online' AND b.status = 'pending' AND b.deleted_at IS NULL
         AND (right(regexp_replace(COALESCE(g.phone, ''), '\\D', '', 'g'), 9) = $2 OR ($3 <> '' AND lower(g.email) = $3))`, [h.branch_id, tail, email])
    if (Number(open.n) >= 3) { await client.query('ROLLBACK'); return fail(res, 429, 'You already have several booking requests waiting for confirmation. Please wait for the hotel to confirm them, or call us.') }

    let guestId = g0?.id as string | undefined
    if (!guestId) {
      const { rows: [g] } = await client.query(
        `INSERT INTO guest (organization_id, first_name, last_name, phone, email, notes) VALUES ($1,$2,$3,$4,$5,'Created from an online booking request') RETURNING id`,
        [h.org_id, first, last, phone, email || null])
      guestId = g.id
    }

    // pick a free room of that type; if another request grabs it first (exclusion constraint), try the next one
    const { rows: rooms } = await client.query(
      `SELECT r.id FROM room r WHERE r.room_type_id = $1 AND r.deleted_at IS NULL AND r.status NOT IN ('maintenance','out_of_order')
         AND NOT EXISTS (SELECT 1 FROM booking x WHERE x.room_id = r.id AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show')
                         AND daterange(x.check_in_date, x.check_out_date, '[)') && daterange($2::date, $3::date, '[)'))
       ORDER BY r.room_number LIMIT 6`, [rt.id, stay.check_in, stay.check_out])
    const rate = Number(rt.price_per_night), subtotal = r2(rate * stay.nights)
    let booked: { id: string; booking_ref: string } | null = null
    for (const room of rooms) {
      await client.query('SAVEPOINT try_room')
      try {
        const ref = 'BK-' + randomBytes(4).toString('hex').toUpperCase()
        const { rows: [bk] } = await client.query(
          `INSERT INTO booking (branch_id, room_id, rate_plan_id, primary_guest_id, booking_ref, check_in_date, check_out_date, num_adults, num_children,
                                rate_per_night, subtotal, tax_amount, vat_rate, service_charge, total_amount, breakfast_included, source, status, special_requests)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0,0,$11,$12,'online','pending',$13) RETURNING id, booking_ref`,
          [h.branch_id, room.id, rt.rate_plan_id, guestId, ref, stay.check_in, stay.check_out, stay.adults, stay.children, rate, subtotal, !!rt.is_breakfast_included, requests || null])
        booked = bk; break
      } catch (e: any) {
        await client.query('ROLLBACK TO SAVEPOINT try_room')
        if (e?.code !== '23P01') throw e                 // only "someone just took this room" is retried
      }
    }
    if (!booked) { await client.query('ROLLBACK'); return fail(res, 409, 'Sorry — the last room of that type was just taken. Please choose another room type or other dates.') }
    await client.query('COMMIT')

    logAudit({ branchId: h.branch_id, action: 'ONLINE_BOOKING_REQUEST', tableName: 'booking', recordId: booked.id, req, newValues: { ref: booked.booking_ref, check_in: stay.check_in, check_out: stay.check_out } })
    notifyBookingReceived(booked.id)
    return res.status(201).json({
      success: true,
      data: {
        booking_ref: booked.booking_ref, status: 'pending', hotel: h.org_name, room_type: rt.name,
        check_in: stay.check_in, check_out: stay.check_out, nights: stay.nights, adults: stay.adults, children: stay.children,
        total: subtotal, hold_hours: h.settings.hold_hours, contact_phone: h.phone,
      },
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally { client.release() }
}

// ── Staff side ────────────────────────────────────────────────────────────────

export async function getOnlineBookingSettings(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const [settings, { rows: [c] }] = await Promise.all([
    getOnlineSettings(orgId),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) AS total FROM booking WHERE branch_id = $1 AND source = 'online' AND deleted_at IS NULL`, [branchId]),
  ])
  const { rows: [h] } = await query(`SELECT 1 AS ok FROM hotel WHERE branch_id = $1 AND deleted_at IS NULL`, [branchId])
  return res.json({ success: true, data: { settings, branch_id: branchId, has_hotel: !!h, pending: Number(c.pending), total: Number(c.total) } })
}

export async function updateOnlineBookingSettings(req: Request, res: Response) {
  const { orgId, userId, branchId } = req.auth!
  const cur = await getOnlineSettings(orgId)
  const hold = req.body.hold_hours !== undefined ? Number(req.body.hold_hours) : cur.hold_hours
  const nights = req.body.max_nights !== undefined ? Number(req.body.max_nights) : cur.max_nights
  if (!Number.isInteger(hold) || hold < 1 || hold > 168) return fail(res, 400, 'Hold time must be a whole number of hours between 1 and 168.')
  if (!Number.isInteger(nights) || nights < 1 || nights > 90) return fail(res, 400, 'Longest stay must be between 1 and 90 nights.')
  const next = { enabled: req.body.enabled !== undefined ? !!req.body.enabled : cur.enabled, hold_hours: hold, max_nights: nights, terms: req.body.terms !== undefined ? clean(req.body.terms, 1000) : cur.terms }
  await query(`UPDATE organization SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{online_booking}', $2::jsonb, true), updated_at = NOW() WHERE id = $1`, [orgId, JSON.stringify(next)])
  logAudit({ userId, branchId, action: 'ONLINE_BOOKING_SETTINGS', req, oldValues: cur, newValues: next })
  return res.json({ success: true, data: next })
}

// Release online requests nobody confirmed in time (run by the scheduler)
export async function expireOnlineBookings() {
  const { rows } = await query(
    `UPDATE booking b SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Online request was not confirmed in time', updated_at = NOW()
     FROM branch br JOIN organization o ON o.id = br.organization_id
     WHERE br.id = b.branch_id AND b.source = 'online' AND b.status = 'pending' AND b.deleted_at IS NULL
       AND b.created_at < NOW() - make_interval(hours => COALESCE((o.settings->'online_booking'->>'hold_hours')::int, 24))
     RETURNING b.id`)
  return rows.length
}

export function startOnlineBookingScheduler() {
  const tick = () => expireOnlineBookings().then(n => { if (n) console.log(`[online-booking] released ${n} unconfirmed request(s)`) }).catch(e => console.error('[online-booking] expiry failed:', (e as Error).message))
  setTimeout(tick, 150_000).unref()
  setInterval(tick, 30 * 60_000).unref()
}

// Front desk accepts a request: pending → confirmed (and the guest is told)
export async function confirmBooking(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { rows } = await query(
    `UPDATE booking SET status = 'confirmed', updated_by = $3, updated_at = NOW()
     WHERE id = $1 AND branch_id = $2 AND status = 'pending' AND deleted_at IS NULL RETURNING id, source`, [req.params.id, branchId, userId])
  if (!rows[0]) return fail(res, 409, 'Only a pending booking can be confirmed.')
  logAudit({ userId, branchId, action: 'BOOKING_CONFIRMED', tableName: 'booking', recordId: rows[0].id, req })
  notifyBookingCreated(rows[0].id)
  return res.json({ success: true, message: 'Booking confirmed' })
}
