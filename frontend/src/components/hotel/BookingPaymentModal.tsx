import { useEffect, useState } from 'react'
import { CheckCircle2, Printer, RefreshCw } from 'lucide-react'
import Modal, { CancelBtn, Field, INPUT } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import api, { getApiErrorMessage } from '@/services/api'
import { companyHeader, esc, printHtml, printStamp, type OrgInfo } from '@utils/print'

// Record money received from a guest against their stay (deposit, part-payment or
// final settlement). Shows the live balance, takes the payment, then offers a
// printed receipt carrying the company logo / banner.

interface Props {
  booking: { id: string; booking_ref: string; guest_name?: string; room_number?: string } | null
  onClose: () => void
  onDone: () => void
}

interface Account { id: string; name: string; account_type: string }
interface Done { receipt_number: string; amount: number; balance_due: number }

const money = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const METHODS = [
  { value: 'cash', label: 'Cash' }, { value: 'mobile', label: 'Mobile money' },
  { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank transfer' },
]

export function BookingPaymentModal({ booking, onClose, onDone }: Props) {
  const [balance, setBalance]   = useState<number | null>(null)
  const [paid, setPaid]         = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [org, setOrg]           = useState<OrgInfo | null>(null)
  const [amount, setAmount]     = useState('')
  const [method, setMethod]     = useState('cash')
  const [accountId, setAccountId] = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState<Done | null>(null)

  useEffect(() => {
    if (!booking) return
    let alive = true
    setLoading(true); setError(''); setDone(null); setNotes(''); setMethod('cash')
    Promise.all([
      api.get(`/hotel/bookings/${booking.id}`),
      api.get('/accounting/accounts').catch(() => null),
      api.get('/system/organization').catch(() => null),
    ]).then(([b, a, o]) => {
      if (!alive) return
      const due = Number(b.data.data.balance_due)
      setBalance(due); setPaid(Number(b.data.data.amount_paid))
      setAmount(due > 0 ? due.toFixed(2) : '')
      if (a) {
        const accs: Account[] = a.data.data
        setAccounts(accs)
        setAccountId(accs.find(x => x.account_type === 'cash')?.id ?? accs[0]?.id ?? '')
      } else {
        setError('You do not have access to the accounts list — ask an administrator to give you Finance access.')
      }
      if (o) setOrg(o.data.data)
    }).catch(e => { if (alive) setError(getApiErrorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [booking])

  const amt = Number(amount)
  const valid = amt > 0 && balance != null && amt <= balance + 0.005 && !!accountId

  const save = async () => {
    if (!booking || !valid) return
    setSaving(true); setError('')
    try {
      const r = await api.post(`/hotel/bookings/${booking.id}/payments`, {
        amount: amt, payment_method: method, account_id: accountId, notes: notes || undefined,
      })
      setDone(r.data.data)
      onDone()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const printReceipt = () => {
    if (!booking || !done) return
    const label = METHODS.find(m => m.value === method)?.label ?? method
    printHtml(`
      ${companyHeader(org)}
      <hr/>
      <div class="center bold lg">PAYMENT RECEIPT</div>
      <table class="sm mt">
        <tr><td>Receipt</td><td class="right bold">${esc(done.receipt_number)}</td></tr>
        <tr><td>Date</td><td class="right">${printStamp()}</td></tr>
        <tr><td>Guest</td><td class="right">${esc(booking.guest_name ?? '—')}</td></tr>
        <tr><td>Booking</td><td class="right">${esc(booking.booking_ref)}${booking.room_number ? ` · Room ${esc(booking.room_number)}` : ''}</td></tr>
      </table>
      <hr/>
      <table class="md">
        <tr class="bold lg"><td>PAID</td><td class="right">${money(done.amount)}</td></tr>
        <tr><td>Method</td><td class="right">${esc(label)}</td></tr>
        <tr><td>Balance due</td><td class="right bold">${money(done.balance_due)}</td></tr>
      </table>
      <hr/>
      <div class="center sm bold mt">Thank you for staying with us!</div>
      <div class="center xs mt">${printStamp()}</div>
    `)
  }

  return (
    <Modal open={!!booking} onClose={onClose} title={done ? 'Payment recorded' : 'Record Payment'} size="sm"
      footer={done ? (
        <>
          <button onClick={printReceipt}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.1] dark:text-neutral-200 dark:hover:bg-white/[0.05]">
            <Printer size={14}/> Print receipt
          </button>
          <button onClick={onClose} className="rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700">Done</button>
        </>
      ) : (
        <>
          <CancelBtn onClick={onClose}/>
          <button onClick={save} disabled={!valid || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving && <RefreshCw size={13} className="animate-spin"/>} Record payment
          </button>
        </>
      )}>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><RefreshCw size={18} className="animate-spin text-neutral-300"/></div>
      ) : done ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dcf2e6] text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]"><CheckCircle2 size={28}/></span>
          <p className="text-[22px] font-bold tabular-nums text-neutral-900 dark:text-white">{money(done.amount)}</p>
          <p className="text-[12.5px] text-neutral-500">Receipt {done.receipt_number}</p>
          <p className={`mt-1 rounded-full px-3 py-1 text-[12px] font-semibold ${
            done.balance_due > 0 ? 'bg-[#fcf0c8] text-[#7d5f08] dark:bg-[#3b3417] dark:text-[#f2d479]' : 'bg-[#dcf2e6] text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]'}`}>
            {done.balance_due > 0 ? `Balance still due: ${money(done.balance_due)}` : 'Stay fully paid'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-white/[0.04]">
            <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">{booking?.guest_name ?? 'Guest'}
              <span className="ml-2 font-mono text-[11px] font-normal text-neutral-400">{booking?.booking_ref}</span></p>
            <div className="mt-2 flex gap-6 text-[12px] text-neutral-500">
              <span>Paid so far <b className="ml-1 text-neutral-800 dark:text-white">{money(paid)}</b></span>
              <span>Balance due <b className="ml-1 text-rose-600 dark:text-rose-400">{money(balance ?? 0)}</b></span>
            </div>
          </div>
          {balance != null && balance <= 0 ? (
            <p className="rounded-xl bg-[#dcf2e6] px-4 py-3 text-[13px] font-semibold text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]">This stay is fully paid.</p>
          ) : (
            <>
              <Field label="Amount">
                <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} autoFocus/>
              </Field>
              {amt > (balance ?? 0) + 0.005 && <p className="-mt-2 text-[12px] text-rose-500">That is more than the balance due.</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Method"><Select value={method} onChange={setMethod} options={METHODS}/></Field>
                <Field label="Deposit into">
                  <Select value={accountId} onChange={setAccountId} placeholder="— account —"
                    options={accounts.map(a => ({ value: a.id, label: a.name }))}/>
                </Field>
              </div>
              <Field label="Note (optional)">
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. deposit, final settlement" className={INPUT}/>
              </Field>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
