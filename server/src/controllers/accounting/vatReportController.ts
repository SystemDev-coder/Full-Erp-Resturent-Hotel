import { Request, Response } from 'express'
import { query } from '../../db/pool'
import { periodFrom } from './financeReportController'

// VAT return — the VAT you CHARGED (output VAT) in a period, by source:
//   • Restaurant: every non-voided order invoice dated in the period (VAT is due when the bill is issued).
//   • Hotel: stays CHECKED OUT in the period. A stay's VAT sits on the booking itself; guest payments are separate
//     PAID invoices with no VAT of their own, so nothing is counted twice.
//   • Other invoices: any other non-voided invoice that carries VAT.
// VAT paid to suppliers (input VAT) is not stored per supplier bill, so the page lets the accountant type it in.

const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100

export async function getVatReport(req: Request, res: Response) {
  const { orgId, branchId } = req.auth!
  const { from, to } = periodFrom(req)

  const [inv, hotel, { rows: [org] }, { rows: [pending] }] = await Promise.all([
    query(
      `SELECT CASE WHEN i.order_id IS NOT NULL THEN 'restaurant' ELSE 'other' END AS source, i.vat_rate::float AS rate,
              COALESCE(SUM(i.subtotal - i.discount_amount), 0) AS base, COALESCE(SUM(i.tax_amount), 0) AS vat, COUNT(*) AS count
       FROM invoice i
       WHERE i.branch_id = $1 AND i.deleted_at IS NULL AND i.status <> 'voided' AND i.booking_id IS NULL
         AND (i.order_id IS NOT NULL OR i.tax_amount > 0) AND i.invoice_date BETWEEN $2 AND $3
       GROUP BY 1, 2`, [branchId, from, to]),
    query(
      `SELECT 'hotel' AS source, b.vat_rate::float AS rate, COALESCE(SUM(b.subtotal), 0) AS base, COALESCE(SUM(b.tax_amount), 0) AS vat, COUNT(*) AS count
       FROM booking b
       WHERE b.branch_id = $1 AND b.deleted_at IS NULL AND b.status = 'checked_out'
         AND COALESCE(b.actual_check_out::date, b.check_out_date) BETWEEN $2 AND $3
       GROUP BY 2`, [branchId, from, to]),
    query(`SELECT name, legal_name, tax_id, vat_rate FROM organization WHERE id = $1`, [orgId]),
    query(`SELECT COALESCE(SUM(tax_amount), 0) AS vat, COUNT(*) AS count FROM booking WHERE branch_id = $1 AND deleted_at IS NULL AND status = 'checked_in'`, [branchId]),
  ])

  const rows = [...inv.rows, ...hotel.rows].map((r: any) => ({ source: r.source as string, rate: Number(r.rate), base: num(r.base), vat: num(r.vat), count: num(r.count) }))
  const bySource = (s: string) => {
    const x = rows.filter(r => r.source === s)
    return { base: r2(x.reduce((a, r) => a + r.base, 0)), vat: r2(x.reduce((a, r) => a + r.vat, 0)), count: x.reduce((a, r) => a + r.count, 0) }
  }
  const byRate = new Map<number, { rate: number; base: number; vat: number }>()
  for (const r of rows) { const e = byRate.get(r.rate) ?? { rate: r.rate, base: 0, vat: 0 }; e.base += r.base; e.vat += r.vat; byRate.set(r.rate, e) }

  const out = { restaurant: bySource('restaurant'), hotel: bySource('hotel'), other: bySource('other') }
  return res.json({
    success: true,
    data: {
      period: { from, to },
      company: { name: org?.legal_name || org?.name, tax_id: org?.tax_id ?? null, vat_rate: num(org?.vat_rate) },
      output: { ...out, total: { base: r2(out.restaurant.base + out.hotel.base + out.other.base), vat: r2(out.restaurant.vat + out.hotel.vat + out.other.vat) } },
      by_rate: [...byRate.values()].sort((a, b) => b.rate - a.rate).map(x => ({ rate: x.rate, base: r2(x.base), vat: r2(x.vat) })),
      // stays still in-house: their VAT falls due when they check out
      in_house_pending: { vat: r2(num(pending.vat)), count: num(pending.count) },
    },
  })
}
