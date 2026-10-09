import { query } from '../db/pool'
import { queueNotification } from './notify'

// Fire-and-forget triggers called by the booking / payment / reservation controllers.
// They gather the facts for the message text and hand it to queueNotification (which checks the settings).

const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function notifyBookingCreated(bookingId: string) {
  void (async () => {
    const { rows: [b] } = await query(
      `SELECT b.id, b.booking_ref, b.branch_id, br.organization_id AS org_id, org.name AS hotel, b.num_nights, b.total_amount,
              to_char(b.check_in_date, 'YYYY-MM-DD') AS ci, to_char(b.check_out_date, 'YYYY-MM-DD') AS co,
              g.first_name || ' ' || g.last_name AS guest, g.phone, r.room_number
       FROM booking b JOIN branch br ON br.id = b.branch_id JOIN organization org ON org.id = br.organization_id
       JOIN guest g ON g.id = b.primary_guest_id JOIN room r ON r.id = b.room_id WHERE b.id = $1`, [bookingId])
    if (!b) return
    await queueNotification({ orgId: b.org_id, branchId: b.branch_id, event: 'booking_confirmed', phone: b.phone, referenceType: 'booking', referenceId: b.id,
      vars: { guest: b.guest, hotel: b.hotel, ref: b.booking_ref, room: b.room_number, checkin: fmtDay(b.ci), checkout: fmtDay(b.co), nights: b.num_nights, total: Number(b.total_amount).toFixed(2) } })
  })().catch(e => console.error('[notify] booking hook:', e.message))
}

export function notifyBookingPayment(bookingId: string, amount: number, balanceAfter: number) {
  void (async () => {
    const { rows: [b] } = await query(
      `SELECT b.id, b.booking_ref, b.branch_id, br.organization_id AS org_id, org.name AS hotel,
              g.first_name || ' ' || g.last_name AS guest, g.phone
       FROM booking b JOIN branch br ON br.id = b.branch_id JOIN organization org ON org.id = br.organization_id
       JOIN guest g ON g.id = b.primary_guest_id WHERE b.id = $1`, [bookingId])
    if (!b) return
    await queueNotification({ orgId: b.org_id, branchId: b.branch_id, event: 'payment_received', phone: b.phone, referenceType: 'booking', referenceId: b.id,
      vars: { guest: b.guest, hotel: b.hotel, ref: b.booking_ref, amount: amount.toFixed(2), balance: balanceAfter.toFixed(2) } })
  })().catch(e => console.error('[notify] payment hook:', e.message))
}

export function notifyReservation(reservationId: string) {
  void (async () => {
    const { rows: [r] } = await query(
      `SELECT tr.id, tr.reserved_at, tr.party_size, tr.walk_in_name, tr.walk_in_phone, rest.name AS restaurant, dt.table_number,
              br.id AS branch_id, br.organization_id AS org_id, g.first_name || ' ' || g.last_name AS guest, g.phone AS guest_phone
       FROM table_reservation tr
       JOIN dining_table dt ON dt.id = tr.dining_table_id JOIN table_area ta ON ta.id = dt.area_id
       JOIN restaurant rest ON rest.id = ta.restaurant_id JOIN branch br ON br.id = rest.branch_id
       LEFT JOIN guest g ON g.id = tr.guest_id WHERE tr.id = $1`, [reservationId])
    if (!r) return
    const when = new Date(r.reserved_at)
    await queueNotification({ orgId: r.org_id, branchId: r.branch_id, event: 'reservation_confirmed', phone: r.walk_in_phone || r.guest_phone, referenceType: 'reservation', referenceId: r.id,
      vars: { guest: r.guest || r.walk_in_name, restaurant: r.restaurant, party: r.party_size, table: r.table_number,
              date: when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), time: when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) } })
  })().catch(e => console.error('[notify] reservation hook:', e.message))
}

// An online booking request just arrived (status "pending")
export function notifyBookingReceived(bookingId: string) {
  void (async () => {
    const { rows: [b] } = await query(
      `SELECT b.id, b.booking_ref, b.branch_id, br.organization_id AS org_id, org.name AS hotel, b.num_nights, b.total_amount,
              to_char(b.check_in_date, 'YYYY-MM-DD') AS ci, to_char(b.check_out_date, 'YYYY-MM-DD') AS co,
              g.first_name || ' ' || g.last_name AS guest, g.phone
       FROM booking b JOIN branch br ON br.id = b.branch_id JOIN organization org ON org.id = br.organization_id
       JOIN guest g ON g.id = b.primary_guest_id WHERE b.id = $1`, [bookingId])
    if (!b) return
    await queueNotification({ orgId: b.org_id, branchId: b.branch_id, event: 'booking_received', phone: b.phone, referenceType: 'booking', referenceId: b.id,
      vars: { guest: b.guest, hotel: b.hotel, ref: b.booking_ref, checkin: fmtDay(b.ci), checkout: fmtDay(b.co), nights: b.num_nights, total: Number(b.total_amount).toFixed(2) } })
  })().catch(e => console.error('[notify] received hook:', e.message))
}
