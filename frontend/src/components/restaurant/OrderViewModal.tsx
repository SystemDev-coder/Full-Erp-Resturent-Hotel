import { useEffect, useState } from 'react'
import { Printer, Receipt, UtensilsCrossed } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import api, { getApiErrorMessage } from '@/services/api'
import { printBill, type BillOrder } from '@utils/billSlip'
import { printReadySlip } from '@utils/readySlip'
import { fmtDateTime } from '@utils/detailFormat'
import { TONES } from '@utils/tones'

// Orders → "View": everything about one order — items with their kitchen status, the money, who served it,
// and its bill — with buttons to (re)print the bill or the ready slip.

interface Detail extends BillOrder { id: string; status: string; notes?: string | null; discount_note?: string | null }

const LINE_TONE: Record<string, string> = { pending: TONES.sky.soft, preparing: TONES.butter.soft, ready: TONES.mint.soft, served: TONES.lilac.soft, cancelled: TONES.rose.soft }
const ORDER_TONE: Record<string, string> = { open: TONES.sky.soft, preparing: TONES.butter.soft, ready: TONES.mint.soft, served: TONES.lilac.soft, billed: TONES.peach.soft, paid: TONES.mint.soft, cancelled: TONES.rose.soft }
const m = (v: unknown) => '$' + Number(v).toFixed(2)

export function OrderViewModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [o, setO] = useState<Detail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { api.get(`/restaurant/orders/${orderId}`).then(r => setO(r.data.data)).catch(e => setError(getApiErrorMessage(e))) }, [orderId])

  const live = o?.lines.filter(l => l.status !== 'cancelled') ?? []
  const t = o?.invoice ?? o

  return (
    <Modal open onClose={onClose} title={o ? `Order ${o.call_no ? `#${o.call_no} · ` : ''}${o.order_ref}` : 'Order'} size="lg"
      footer={<>
        <button onClick={onClose} className="rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04]">Close</button>
        {o && o.status === 'ready' && <button onClick={() => printReadySlip({ call_no: o.call_no, order_ref: o.order_ref, order_type: o.order_type, table_number: o.table_number, waiter_name: o.waiter_name, lines: live.map(l => ({ name: l.item_name_snap, quantity: l.quantity })) })}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold ${TONES.mint.soft}`}><Printer size={14} /> Ready slip</button>}
        {o && live.length > 0 && <button onClick={() => printBill(o).catch(e => setError(getApiErrorMessage(e)))}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700"><Receipt size={14} /> {o.invoice ? 'Print bill' : 'Print summary'}</button>}
      </>}>
      {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      {!o ? <p className="py-10 text-center text-[13px] text-neutral-400">{error ? '' : 'Loading…'}</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-neutral-50 px-4 py-3 text-[12.5px] dark:bg-white/[0.04]">
            <span className={`rounded-full px-3 py-1 text-[12px] font-bold capitalize ${ORDER_TONE[o.status] ?? ''}`}>{o.status}</span>
            <span className="flex items-center gap-1.5 font-semibold text-neutral-700 dark:text-neutral-200"><UtensilsCrossed size={13} /> {o.table_number ? `Table ${o.table_number}` : o.order_type.replace('_', ' ')}</span>
            <span className="text-neutral-500">Waiter: <b className="text-neutral-700 dark:text-neutral-200">{o.waiter_name ?? '—'}</b></span>
            {o.opened_at && <span className="text-neutral-500">Opened {fmtDateTime(o.opened_at)}</span>}
            {o.invoice && <span className="text-neutral-500">Invoice <b className="font-mono text-neutral-700 dark:text-neutral-200">{o.invoice.invoice_number}</b> · {o.invoice.status.replace('_', ' ')}</span>}
          </div>

          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400"><th className="pb-2">Item</th><th className="pb-2">Kitchen</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Price</th><th className="pb-2 text-right">Total</th></tr></thead>
            <tbody>
              {o.lines.map((l, i) => (
                <tr key={i} className={`border-t border-neutral-100 dark:border-white/[0.05] ${l.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}>
                  <td className="py-2 pr-3 font-semibold text-neutral-800 dark:text-white">{l.item_name_snap}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold capitalize ${LINE_TONE[l.status] ?? ''}`}>{l.status}</span></td>
                  <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">{m(l.unit_price)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{m(l.line_total)}</td>
                </tr>))}
              {o.lines.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">No items on this order yet.</td></tr>}
            </tbody>
          </table>

          {t && (
            <div className="ml-auto w-full max-w-xs space-y-1 text-[13px]">
              <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span className="tabular-nums">{m(t.subtotal)}</span></div>
              {Number(t.discount_amount) > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span className="tabular-nums">-{m(t.discount_amount)}</span></div>}
              {Number(t.tax_amount) > 0 && <div className="flex justify-between text-neutral-500"><span>VAT ({Number(t.vat_rate)}%)</span><span className="tabular-nums">{m(t.tax_amount)}</span></div>}
              <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-[16px] font-extrabold dark:border-white/[0.1]"><span>Total</span><span className="tabular-nums">{m(t.total_amount)}</span></div>
              {o.invoice && <div className="flex justify-between text-neutral-500"><span>Paid</span><span className="tabular-nums">{m(o.invoice.amount_paid)}</span></div>}
            </div>
          )}
          {o.notes && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{o.notes}</p>}
        </div>
      )}
    </Modal>
  )
}
