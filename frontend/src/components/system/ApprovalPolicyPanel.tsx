import { useEffect, useState } from 'react'
import { CheckCircle2, Percent, Save, ShieldCheck, Trash2, UserCheck } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'

// Systems → Approvals: what a cashier/waiter cannot do without a manager's PIN.

interface Approver { id: string; name: string; role: string; has_pin: boolean }

export function ApprovalPolicyPanel() {
  const [limit, setLimit] = useState('10')
  const [voidRule, setVoidRule] = useState(true)
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/restaurant/approvals/policy').then(r => {
      const d = r.data.data
      setLimit(String(d.policy.discount_over_pct)); setVoidRule(!!d.policy.require_for_void); setApprovers(d.approvers)
    }).catch(e => setError(getApiErrorMessage(e)))
  }, [])

  const save = async () => {
    setBusy(true); setError(''); setMsg('')
    try {
      await api.put('/restaurant/approvals/policy', { discount_over_pct: Number(limit), require_for_void: voidRule })
      setMsg('Saved — the new rules apply immediately.')
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}
      {msg && <p className="flex items-center gap-2 rounded-2xl bg-[#dcf2e6] px-4 py-3 text-[13px] font-semibold text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]"><CheckCircle2 size={15} />{msg}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={`rounded-3xl border p-5 ${TONES.butter.card}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TONES.butter.chip}`}><Percent size={20} /></span>
          <h3 className={`mt-3 text-[15px] font-bold ${TONES.butter.ink}`}>Discounts</h3>
          <p className={`mt-1 text-[12.5px] opacity-80 ${TONES.butter.ink}`}>A cashier or waiter can give a discount up to this limit. Anything bigger needs a manager to type their PIN.</p>
          <div className="mt-4 flex items-center gap-2">
            <input type="number" min={0} max={100} step="1" value={limit} onChange={e => setLimit(e.target.value)}
              className="w-28 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[15px] font-bold text-neutral-800 outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-white" />
            <span className={`text-[14px] font-bold ${TONES.butter.ink}`}>% of the bill</span>
          </div>
          <p className={`mt-2 text-[11.5px] opacity-70 ${TONES.butter.ink}`}>0 = every discount needs approval · 100 = no approval needed</p>
        </section>

        <section className={`rounded-3xl border p-5 ${TONES.rose.card}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TONES.rose.chip}`}><Trash2 size={20} /></span>
          <h3 className={`mt-3 text-[15px] font-bold ${TONES.rose.ink}`}>Voids &amp; cancellations</h3>
          <p className={`mt-1 text-[12.5px] opacity-80 ${TONES.rose.ink}`}>Cancelling an order that has items, or removing a dish that already went to the kitchen, needs a reason and a manager’s PIN.</p>
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={voidRule} onChange={e => setVoidRule(e.target.checked)} className="h-5 w-5 accent-rose-500" />
            <span className={`text-[13.5px] font-semibold ${TONES.rose.ink}`}>Require approval for voids</span>
          </label>
        </section>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
          <Save size={14} /> {busy ? 'Saving…' : 'Save rules'}
        </button>
      </div>

      <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-500" />
          <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Who can approve</h3>
        </div>
        <p className="mb-3 text-[12.5px] text-neutral-500">Branch managers and admins approve with their own login. Everyone else needs one of these staff members to type their POS PIN (HR → Staff → role “manager”, then set a PIN). Every approval is written to the audit log with the manager’s name and the reason.</p>
        {approvers.length === 0 ? (
          <p className={`rounded-2xl px-4 py-3 text-[13px] ${TONES.rose.soft}`}>No manager has been set up yet — until then, only a signed-in branch manager or admin can approve.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {approvers.map(a => (
              <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-neutral-100 px-4 py-3 dark:border-white/[0.06]">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.has_pin ? TONES.mint.chip : TONES.butter.chip}`}><UserCheck size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-white">{a.name}</p>
                  <p className="text-[11.5px] capitalize text-neutral-400">{a.role.replace('_', ' ')}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${a.has_pin ? TONES.mint.soft : TONES.butter.soft}`}>{a.has_pin ? 'PIN set' : 'No PIN yet'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
