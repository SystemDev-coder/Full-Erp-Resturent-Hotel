import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'

// ─── Types (shape of GET /hotel/bookings/:id/statement) ───────────────────────

interface Line { name: string; quantity: number; unit_price: number; line_total: number; date: string; category?: string }

interface Statement {
  generated_at: string
  organization: {
    name: string; legal_name?: string; tax_id?: string; phone?: string; email?: string
    address?: string; logo_url?: string | null; banner_url?: string | null
  }
  guest: { name: string; phone?: string; email?: string; gender?: string }
  booking: {
    ref: string; status: string; room_number: string; room_type: string
    check_in: string; check_out: string; nights: number; rate_per_night: number
    subtotal: number; discount: number; tax: number; vat_rate: number; service_charge: number; total: number
  }
  payment_accounts: { name: string; institution?: string | null; account_number: string; account_type: string }[]
  hotel_services: Line[]
  restaurant: {
    lines: Line[]; subtotal: number; discount: number; vat_rate: number; vat_amount: number
    total: number; paid: number; balance: number
  }
  summary: {
    stay_total: number; extras_total: number; stay_paid: number; booking_balance: number
    restaurant_total: number; restaurant_paid: number; restaurant_balance: number; total_due: number
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const money = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (v: string) => {                      // "2026-09-14" or ISO → "14 Sep 2026"
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v)
  return isNaN(d.getTime()) ? v : `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
}
const dayTime = (v: string) => {                  // date-only stays date-only; timestamps show the time
  if (v.length === 10) return day(v)
  const d = new Date(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return isNaN(d.getTime()) ? v : `${day(v)}, ${p(d.getHours())}:${p(d.getMinutes())}`
}

const GENDER: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' }

// ─── Small building blocks ────────────────────────────────────────────────────

const SectionTitle = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <h2 className="mt-5 rounded bg-[#f1f3f6] px-3 py-1.5 text-[13px] font-bold text-[#2d3748]">{n}. {children}</h2>
)

const Info = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex gap-3 py-0.5 text-[12px]">
    <span className="w-28 shrink-0 font-bold text-[#2d3748]">{label}:</span>
    <span className="text-[#4a5568]">{value || 'N/A'}</span>
  </div>
)

function LineTable({ title, lines, showDate = true }: { title: string; lines: Line[]; showDate?: boolean }) {
  return (
    <table className="mt-3 w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="bg-[#34495e] text-white">
          <th colSpan={showDate ? 5 : 4} className="px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-wide">{title}</th>
        </tr>
        <tr className="border-b border-[#cbd5e0] text-[10.5px] font-bold text-[#718096]">
          <th className="px-3 py-1 text-left">Service / Item</th>
          <th className="px-2 py-1 text-center">Qty</th>
          <th className="px-2 py-1 text-right">Price</th>
          <th className="px-2 py-1 text-right">Subtotal</th>
          {showDate && <th className="px-3 py-1 text-right">Date</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className={`break-inside-avoid ${i % 2 ? 'bg-[#f8f9fb]' : ''}`}>
            <td className="px-3 py-1 text-[#2d3748]">{l.name.trim()}</td>
            <td className="px-2 py-1 text-center text-[#4a5568]">{l.quantity}</td>
            <td className="px-2 py-1 text-right text-[#4a5568]">{money(l.unit_price)}</td>
            <td className="px-2 py-1 text-right font-medium text-[#2d3748]">{money(l.line_total)}</td>
            {showDate && <td className="px-3 py-1 text-right text-[10.5px] text-[#718096]">{l.date ? day(l.date) : ''}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const TotalRow = ({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'red' | 'green' | 'orange' }) => (
  <div className={`flex justify-between py-0.5 text-[12px] ${bold ? 'text-[13px] font-extrabold text-[#1a202c]' : 'text-[#4a5568]'}`}>
    <span>{label}</span>
    <span className={
      tone === 'red' ? 'font-bold text-[#c0392b]' : tone === 'green' ? 'text-[#27ae60]' : tone === 'orange' ? 'text-[#e67e22]' : ''
    }>{value}</span>
  </div>
)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookingStatement() {
  const { id } = useParams<{ id: string }>()
  const [data, setData]       = useState<Statement | null>(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/hotel/bookings/${id}/statement`)
      .then(r => { setData(r.data.data); document.title = `Statement ${r.data.data.booking.ref}` })
      .catch(e => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><RefreshCw className="animate-spin text-neutral-400" /></div>
  }
  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-[14px] text-rose-600">{error || 'Statement not available'}</p>
        <Link to="/hotel/bookings" className="text-[13px] font-semibold text-indigo-600">← Back to bookings</Link>
      </div>
    )
  }

  const { organization: org, guest, booking: b, restaurant: rest, hotel_services: extras, summary: s, payment_accounts: payTo } = data
  const hasRestaurant = rest.lines.length > 0
  const contact = [org.phone && `Phone: ${org.phone}`, org.email && `Email: ${org.email}`].filter(Boolean)

  return (
    <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0 dark:bg-neutral-900">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead { display: table-header-group; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar — never printed */}
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4">
        <Link to="/hotel/bookings"
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50">
          <ArrowLeft size={14} /> Back
        </Link>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-indigo-700">
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      {/* The document — always light, regardless of app theme */}
      <article className="sheet mx-auto max-w-[820px] bg-white p-10 text-[#2d3748] shadow-xl" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>

        <header className="border-b border-[#d5d9e0] pb-4 text-center">
          {org.banner_url ? (
            // Company banner (Systems → Company Info) — it already carries the company's name/artwork
            <img src={org.banner_url} alt="" className="mx-auto mb-3 block max-h-[160px] max-w-full object-contain" />
          ) : (
            <div className="flex items-center justify-center gap-4">
              {org.logo_url && <img src={org.logo_url} alt="" className="h-16 max-w-[160px] object-contain" />}
              <h1 className="text-[26px] font-extrabold uppercase tracking-wide text-[#2d3748]">{org.name}</h1>
            </div>
          )}
          <p className="mt-1 text-[11px] text-[#718096]">Guest Statement — Room &amp; Restaurant</p>
          {org.address && <p className="text-[10.5px] text-[#a0aec0]">{org.address}</p>}
        </header>

        {/* 1 */}
        <div className="mt-4 flex items-start justify-between rounded bg-[#f1f3f6] px-3 py-1.5">
          <h2 className="text-[13px] font-bold">1. Customer Information</h2>
          <span className="text-[11px] font-bold">Reservation ID: #{b.ref}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-6 px-3">
          <div>
            <Info label="Full Name" value={guest.name} />
            <Info label="Sex" value={guest.gender ? GENDER[guest.gender] ?? guest.gender : ''} />
          </div>
          <div>
            <Info label="Phone" value={guest.phone} />
            <Info label="Email" value={guest.email} />
            <p className="text-right text-[11px] text-[#718096]">Date: {day(data.generated_at)}</p>
          </div>
        </div>

        {/* 2 */}
        <SectionTitle n={2}>Booking Details</SectionTitle>
        <div className="mt-2 px-3">
          <Info label="Room / Service" value={`${b.room_type} — Room ${b.room_number}`} />
          <Info label="Check-in Date"  value={dayTime(b.check_in)} />
          <Info label="Check-out Date" value={dayTime(b.check_out)} />
          <Info label="Booking Ref"    value={`#${b.ref}`} />
          <Info label="Status"         value={b.status.replace(/_/g, ' ')} />
        </div>

        {/* 3 */}
        <SectionTitle n={3}>Booking Summary</SectionTitle>
        <table className="mt-2 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-[#34495e] text-white">
              <th className="px-3 py-1.5 text-left">Room / Package</th>
              <th className="px-2 py-1.5 text-center">Nights</th>
              <th className="px-2 py-1.5 text-right">Price/Night</th>
              <th className="px-2 py-1.5 text-right">Discount</th>
              <th className="px-3 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#e2e8f0]">
              <td className="px-3 py-1.5">{b.room_type} {b.room_number}</td>
              <td className="px-2 py-1.5 text-center">{b.nights}</td>
              <td className="px-2 py-1.5 text-right">{money(b.rate_per_night)}</td>
              <td className="px-2 py-1.5 text-right">{money(b.discount)}</td>
              <td className="px-3 py-1.5 text-right">{money(b.subtotal - b.discount)}</td>
            </tr>
          </tbody>
        </table>
        <div className="ml-auto mt-2 w-[300px] px-3">
          <TotalRow label="Room Subtotal:" value={money(b.subtotal - b.discount)} />
          {b.tax > 0 && <TotalRow label={`VAT (${b.vat_rate}%):`} value={money(b.tax)} tone="orange" />}
          {b.service_charge > 0 && <TotalRow label="Service Charge:" value={money(b.service_charge)} />}
          {extras.length > 0 && <TotalRow label="Hotel Services:" value={money(s.extras_total)} />}
          <TotalRow label="Total Paid (Booking):" value={money(s.stay_paid)} tone="green" />
          <div className="mt-1 border-t border-[#2d3748] pt-1">
            <TotalRow label="Booking Balance:" value={money(s.booking_balance)} bold tone="red" />
          </div>
        </div>

        {/* 4 */}
        <SectionTitle n={4}>All Charges &amp; Services</SectionTitle>
        {extras.length > 0 && <LineTable title="Hotel Services" lines={extras} />}
        {hasRestaurant && <LineTable title="Restaurant Department" lines={rest.lines} />}
        {!extras.length && !hasRestaurant && (
          <p className="mt-3 px-3 text-[12px] italic text-[#718096]">No extra charges were posted to this stay.</p>
        )}

        {hasRestaurant && (
          <div className="ml-auto mt-3 w-[300px] px-3">
            <TotalRow label="Subtotal (Services):" value={money(rest.subtotal)} />
            {rest.discount > 0 && <TotalRow label="Discount:" value={`-${money(rest.discount)}`} />}
            <TotalRow label={`VAT (${rest.vat_rate}%):`} value={money(rest.vat_amount)} tone="orange" />
            <div className="border-t border-[#cbd5e0] pt-1">
              <TotalRow label="Grand Total:" value={money(rest.total)} bold />
            </div>
            <TotalRow label="Total Paid (Services):" value={money(rest.paid)} tone="green" />
            <TotalRow label="Remaining Balance:" value={money(rest.balance)} bold tone="red" />
          </div>
        )}

        {/* Total due */}
        <div className="mx-auto mt-6 w-[75%] break-inside-avoid rounded border border-[#d5d9e0] bg-[#f8f9fb] px-4 py-3 text-center">
          <p className="text-[14px] font-bold text-[#2d3748]">Total Due Payment</p>
          <p className="text-[28px] font-extrabold leading-tight text-[#c0392b]">{money(s.total_due)}</p>
          {s.total_due > 0 && payTo.length > 0 && (
            <div className="mt-2 border-t border-[#e2e8f0] pt-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#718096]">Pay to</p>
              {payTo.map(a => (
                <p key={a.name + a.account_number} className="text-[12px] font-bold text-[#2d3748]">
                  {a.account_type === 'mobile_money' ? 'Mobile' : 'Account'} No: {a.account_number}
                  <span className="ml-1.5 font-normal text-[#718096]">({a.institution || a.name})</span>
                </p>
              ))}
            </div>
          )}
          {s.total_due <= 0 && <p className="text-[11px] text-[#27ae60]">Fully settled — thank you.</p>}
        </div>

        {contact.length > 0 && (
          <div className="mt-5 border-y border-[#e2e8f0] py-3 text-center text-[12px]">
            <p className="font-bold">Contact Information</p>
            {contact.map(c => <p key={c as string} className="font-bold">{c}</p>)}
          </div>
        )}

        <footer className="mt-5 text-center text-[10.5px] italic text-[#718096]">
          <p>Thank you for choosing {org.name}. We look forward to hosting you.</p>
          <p className="not-italic text-[#a0aec0]">This is a computer-generated statement and does not require a physical signature.</p>
        </footer>
      </article>
    </div>
  )
}
