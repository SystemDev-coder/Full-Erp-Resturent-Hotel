import { Request, Response } from 'express'
import { query } from '../../db/pool'

const round2 = (n: number) => Math.round(n * 100) / 100

// Combined guest statement for one booking: the room stay, hotel extras
// (minibar, laundry…) and every restaurant order charged to that booking —
// with what has been paid and what is still owed. Read-only; the frontend
// renders it as a printable page / PDF.
export async function getBookingStatement(req: Request, res: Response) {
  const { branchId, orgId } = req.auth!
  const { id } = req.params

  const { rows: [b] } = await query(
    `SELECT b.id, b.booking_ref, b.status, b.rate_per_night, b.num_nights,
            b.subtotal, b.discount_amount, b.tax_amount, b.vat_rate, b.service_charge, b.total_amount,
            b.check_in_date, b.check_out_date, b.actual_check_in, b.actual_check_out,
            to_char(b.check_in_date,  'YYYY-MM-DD') AS check_in_day,
            to_char(b.check_out_date, 'YYYY-MM-DD') AS check_out_day,
            r.room_number, rt.name AS room_type_name,
            g.first_name || ' ' || g.last_name AS guest_name, g.phone AS guest_phone,
            g.email AS guest_email, g.gender AS guest_gender
     FROM booking b
     JOIN room r       ON r.id  = b.room_id
     JOIN room_type rt ON rt.id = r.room_type_id
     JOIN guest g      ON g.id  = b.primary_guest_id
     WHERE b.id = $1 AND b.branch_id = $2 AND b.deleted_at IS NULL`,
    [id, branchId]
  )
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' })

  const [org, hotelServices, orders, lines, bookingPaid, payTo] = await Promise.all([
    query(
      `SELECT name, legal_name, tax_id, phone, email, address, vat_rate, logo_url, banner_url
       FROM organization WHERE id = $1`, [orgId]),
    query(
      `SELECT service_name, service_category, quantity, unit_price, line_total, served_at
       FROM booking_service WHERE booking_id = $1 AND deleted_at IS NULL ORDER BY served_at`, [id]),
    query(
      `SELECT id, discount_amount FROM order_header
       WHERE booking_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status <> 'cancelled'`,
      [id, branchId]),
    query(
      `SELECT ol.item_name_snap AS name, ol.quantity, ol.unit_price, ol.line_total, ol.created_at AS ordered_at
       FROM order_line ol
       JOIN order_header o ON o.id = ol.order_id
       WHERE o.booking_id = $1 AND o.branch_id = $2 AND o.deleted_at IS NULL AND o.status <> 'cancelled'
         AND ol.deleted_at IS NULL AND ol.status <> 'cancelled'
       ORDER BY ol.created_at`,
      [id, branchId]),
    // Money actually received against the stay. "room_charge" invoices are not
    // payments — they just move the bill onto the room folio.
    query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS paid FROM invoice
       WHERE booking_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status <> 'voided'
         AND payment_method IS DISTINCT FROM 'room_charge'`,
      [id, branchId]),
    // Where the guest can pay: the active bank / mobile-money accounts that have a number
    // (Finance → Accounts is the single source of truth — nothing is typed into Company Info)
    query(
      `SELECT name, institution, account_number, account_type FROM account
       WHERE organization_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND deleted_at IS NULL AND is_active = TRUE
         AND account_type IN ('bank','mobile_money') AND COALESCE(TRIM(account_number), '') <> ''
       ORDER BY account_type, name LIMIT 4`,
      [orgId, branchId]),
  ])

  const orderIds = orders.rows.map((o: any) => o.id)
  const restaurantPaid = orderIds.length
    ? Number((await query(
        `SELECT COALESCE(SUM(amount_paid), 0) AS paid FROM invoice
         WHERE order_id = ANY($1::uuid[]) AND deleted_at IS NULL AND status <> 'voided'
           AND payment_method IS DISTINCT FROM 'room_charge'`,
        [orderIds])).rows[0].paid)
    : 0

  const o = org.rows[0] ?? {}
  const vatRate = Number(o.vat_rate ?? 0)

  // Room stay
  const stayTotal = Number(b.total_amount)
  const stayPaid  = Number(bookingPaid.rows[0].paid)

  // Hotel extras
  const extrasTotal = round2(hotelServices.rows.reduce((s: number, r: any) => s + Number(r.line_total), 0))

  // Restaurant: lines − order discounts, then VAT at the organization's rate
  const linesSubtotal = round2(lines.rows.reduce((s: number, r: any) => s + Number(r.line_total), 0))
  const discount      = round2(orders.rows.reduce((s: number, r: any) => s + Number(r.discount_amount), 0))
  const taxable       = Math.max(0, round2(linesSubtotal - discount))
  const vatAmount     = round2(taxable * vatRate / 100)
  const restaurantTotal = round2(taxable + vatAmount)

  const bookingBalance  = round2(stayTotal + extrasTotal - stayPaid)
  const servicesBalance = round2(restaurantTotal - restaurantPaid)

  return res.json({
    success: true,
    data: {
      generated_at: new Date().toISOString(),
      organization: {
        name: o.name, legal_name: o.legal_name, tax_id: o.tax_id,
        phone: o.phone, email: o.email, address: o.address, logo_url: o.logo_url, banner_url: o.banner_url,
      },
      payment_accounts: payTo.rows,
      guest: {
        name: b.guest_name, phone: b.guest_phone, email: b.guest_email, gender: b.guest_gender,
      },
      booking: {
        id: b.id, ref: b.booking_ref, status: b.status,
        room_number: b.room_number, room_type: b.room_type_name,
        check_in:  b.actual_check_in  ?? b.check_in_day,
        check_out: b.actual_check_out ?? b.check_out_day,
        nights: Number(b.num_nights), rate_per_night: Number(b.rate_per_night),
        subtotal: Number(b.subtotal), discount: Number(b.discount_amount),
        tax: Number(b.tax_amount), vat_rate: Number(b.vat_rate),
        service_charge: Number(b.service_charge), total: stayTotal,
      },
      hotel_services: hotelServices.rows.map((r: any) => ({
        name: r.service_name, category: r.service_category,
        quantity: Number(r.quantity), unit_price: Number(r.unit_price),
        line_total: Number(r.line_total), date: r.served_at,
      })),
      restaurant: {
        lines: lines.rows.map((r: any) => ({
          name: r.name, quantity: Number(r.quantity), unit_price: Number(r.unit_price),
          line_total: Number(r.line_total), date: r.ordered_at,
        })),
        subtotal: linesSubtotal, discount, vat_rate: vatRate, vat_amount: vatAmount,
        total: restaurantTotal, paid: restaurantPaid, balance: servicesBalance,
      },
      summary: {
        stay_total: stayTotal, extras_total: extrasTotal, stay_paid: stayPaid,
        booking_balance: bookingBalance,
        restaurant_total: restaurantTotal, restaurant_paid: restaurantPaid,
        restaurant_balance: servicesBalance,
        total_due: round2(bookingBalance + servicesBalance),
      },
    },
  })
}
