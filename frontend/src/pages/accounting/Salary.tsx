import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, Wallet, Banknote, UserSquare2, Trash2, Pencil } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { Tabs } from '@/components/ui/Tabs'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types (mirror salary_charge / salary_payment tables) ─────────────────────

interface SalaryCharge {
  id: string; period_start: string; period_end: string
  gross_amount: string; deductions: string; net_amount: string
  status: string; staff_name: string; employee_id: string
}
interface SalaryPayment {
  id: string; amount: string; payment_date: string; reference_number?: string
  notes?: string; staff_name: string; employee_id: string
  period_start: string; period_end: string
  account_name: string; paid_by_name?: string
}
interface Staff   { id: string; first_name: string; last_name: string; employee_id: string; basic_salary?: string | number }
interface Account { id: string; account_type: string; name: string; is_active: boolean }

const CHARGE_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  approved: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  paid:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
}

function todayISO() {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`
}
function monthStartISO() {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-01`
}

interface ChargeForm { staff_id: string; period_start: string; period_end: string; gross_amount: string; deductions: string }
const EMPTY_CHARGE = (): ChargeForm => ({ staff_id: '', period_start: monthStartISO(), period_end: todayISO(), gross_amount: '', deductions: '0' })

interface PayForm { account_id: string; amount: string; payment_date: string; reference_number: string; notes: string }
const EMPTY_PAY = (): PayForm => ({ account_id: '', amount: '', payment_date: todayISO(), reference_number: '', notes: '' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Salary() {
  const [tab, setTab] = useState<'charges' | 'payments'>('charges')

  const [charges,  setCharges]  = useState<SalaryCharge[]>([])
  const [payments, setPayments] = useState<SalaryPayment[]>([])
  const [staff,    setStaff]    = useState<Staff[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode, setMode] = useState<null | 'addCharge' | 'editCharge' | 'deleteCharge' | 'pay' | 'deletePayment'>(null)
  const [payCharge,  setPayCharge]  = useState<SalaryCharge | null>(null)
  const [deleteCharge, setDeleteCharge] = useState<SalaryCharge | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<SalaryPayment | null>(null)
  const [chargeForm, setChargeForm] = useState<ChargeForm>(EMPTY_CHARGE)
  const [payForm,    setPayForm]    = useState<PayForm>(EMPTY_PAY)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, pRes, sRes, aRes] = await Promise.all([
        api.get('/accounting/salary-charges'),
        api.get('/accounting/salary-payments'),
        api.get('/hr/staff'),
        api.get('/accounting/accounts'),
      ])
      setCharges(cRes.data.data)
      setPayments(pRes.data.data)
      setStaff(sRes.data.data)
      setAccounts((aRes.data.data as Account[]).filter(a =>
        a.is_active && ['cash','bank','mobile_money'].includes(a.account_type)))
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const close = () => { setMode(null); setPayCharge(null); setDeleteCharge(null); setSelectedPayment(null); setError('') }

  // Picking a staff member reads their registered base salary straight from
  // HR → Staff and pre-fills the gross amount — still a normal editable
  // field afterward, so it can be adjusted (bonus, unpaid days, etc.) before saving.
  const handleStaffChange = (staffId: string) => {
    const s = staff.find(x => x.id === staffId)
    setChargeForm(p => ({
      ...p,
      staff_id: staffId,
      gross_amount: s?.basic_salary ? String(s.basic_salary) : p.gross_amount,
    }))
  }

  const openEditCharge = (c: SalaryCharge) => {
    setDeleteCharge(c)
    setChargeForm({
      staff_id: '', period_start: c.period_start?.slice(0,10) ?? monthStartISO(),
      period_end: c.period_end?.slice(0,10) ?? todayISO(),
      gross_amount: String(c.gross_amount), deductions: String(c.deductions),
    })
    setMode('editCharge'); setError('')
  }

  const saveCharge = async () => {
    if (!chargeForm.gross_amount) { setError('Gross amount is required'); return }
    setSaving(true); setError('')
    try {
      if (mode === 'editCharge' && deleteCharge) {
        await api.put(`/accounting/salary-charges/${deleteCharge.id}`, {
          period_start: chargeForm.period_start,
          period_end:   chargeForm.period_end,
          gross_amount: Number(chargeForm.gross_amount),
          deductions:   Number(chargeForm.deductions) || 0,
        })
      } else {
        if (!chargeForm.staff_id) { setError('Staff is required'); setSaving(false); return }
        await api.post('/accounting/salary-charges', {
          staff_id:     chargeForm.staff_id,
          period_start: chargeForm.period_start,
          period_end:   chargeForm.period_end,
          gross_amount: Number(chargeForm.gross_amount),
          deductions:   Number(chargeForm.deductions) || 0,
        })
      }
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const openDeleteCharge = (c: SalaryCharge) => { setDeleteCharge(c); setMode('deleteCharge'); setError('') }

  const doDeleteCharge = async () => {
    if (!deleteCharge) return
    setSaving(true); setError('')
    try { await api.delete('/accounting/salary-charges/' + deleteCharge.id); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const openDeletePayment = (p: SalaryPayment) => { setSelectedPayment(p); setMode('deletePayment'); setError('') }

  // Undo a payment — reverses its ledger entry and re-opens the charge so it
  // can be paid again, matching the same pattern used for expense payments.
  const doDeletePayment = async () => {
    if (!selectedPayment) return
    setSaving(true); setError('')
    try { await api.delete('/accounting/salary-payments/' + selectedPayment.id); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const openPay = (c: SalaryCharge) => {
    setPayCharge(c)
    setPayForm({ ...EMPTY_PAY(), amount: String(c.net_amount), account_id: accounts[0]?.id ?? '' })
    setMode('pay'); setError('')
  }

  const savePay = async () => {
    if (!payCharge || !payForm.account_id || !payForm.amount) { setError('Account and amount are required'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/accounting/salary-charges/${payCharge.id}/pay`, {
        account_id:       payForm.account_id,
        amount:           Number(payForm.amount),
        payment_date:     payForm.payment_date,
        reference_number: payForm.reference_number || undefined,
        notes:            payForm.notes || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // Registered pay rate on the employee's HR profile — shown for reference
  // next to the actual charge, so a mismatch (bonus, unpaid days, raise not
  // yet reflected) is obvious at a glance.
  const baseSalaryFor = (employeeId: string) => staff.find(s => s.employee_id === employeeId)?.basic_salary

  const CHARGE_COLS: DTColumn<SalaryCharge>[] = [
    { key:'staff_name', label:'Staff', render:c=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400">
          <UserSquare2 size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{c.staff_name}</p>
          <p className="font-mono text-[11px] text-neutral-400">{c.employee_id}</p>
        </div>
      </div>
    )},
    { key:'base_salary', label:'Base Salary', sortable:false, render:c=>{
      const base = baseSalaryFor(c.employee_id)
      return base
        ? <span className="text-neutral-500 dark:text-neutral-400">${Number(base).toFixed(2)}</span>
        : <span className="text-neutral-300 dark:text-neutral-600">—</span>
    }, exportValue:c=>baseSalaryFor(c.employee_id) ?? '' },
    { key:'period_start', label:'Period', render:c=>(
      <span className="text-[12px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {c.period_start?.slice(0,10)} → {c.period_end?.slice(0,10)}
      </span>
    )},
    { key:'gross_amount', label:'Gross', render:c=><span className="text-neutral-600 dark:text-neutral-300">${Number(c.gross_amount).toFixed(2)}</span>, exportValue:c=>c.gross_amount },
    { key:'deductions', label:'Deductions', render:c=>(
      <span className={Number(c.deductions) > 0 ? 'font-semibold text-rose-500' : 'text-neutral-400'}>
        {Number(c.deductions) > 0 ? `−$${Number(c.deductions).toFixed(2)}` : '—'}
      </span>
    ), exportValue:c=>c.deductions },
    { key:'net_amount', label:'Net Pay', render:c=><span className="font-extrabold text-neutral-800 dark:text-white">${Number(c.net_amount).toFixed(2)}</span>, exportValue:c=>c.net_amount },
    { key:'status', label:'Status', render:c=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${CHARGE_BADGE[c.status] ?? ''}`}>{c.status}</span>
    )},
    { key:'_act', label:'', sortable:false, render:c=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        {c.status !== 'paid' ? <>
          <button onClick={()=>openEditCharge(c)} title="Edit"
            className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"><Pencil size={12}/></button>
          <button onClick={()=>openPay(c)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 transition-colors">
            <Banknote size={11}/> Pay
          </button>
        </> : null}
        <button onClick={()=>openDeleteCharge(c)} title="Delete" className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
      </div>
    )},
  ]

  const PAYMENT_COLS: DTColumn<SalaryPayment>[] = [
    { key:'payment_date', label:'Date', render:p=><span className="text-neutral-500 dark:text-neutral-400">{p.payment_date?.slice(0,10)}</span> },
    { key:'staff_name', label:'Staff', render:p=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{p.staff_name}</p>
        <p className="font-mono text-[11px] text-neutral-400">{p.employee_id}</p>
      </div>
    )},
    { key:'period_start', label:'Period', render:p=>(
      <span className="text-[12px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {p.period_start?.slice(0,10)} → {p.period_end?.slice(0,10)}
      </span>
    )},
    { key:'amount', label:'Paid', render:p=><span className="font-extrabold text-rose-600 dark:text-rose-400">−${Number(p.amount).toFixed(2)}</span>, exportValue:p=>p.amount },
    { key:'account_name', label:'Paid From', render:p=><span className="text-neutral-500 dark:text-neutral-400">{p.account_name}</span> },
    { key:'reference_number', label:'Reference', render:p=><span className="font-mono text-[12px] text-neutral-500">{p.reference_number ?? '—'}</span> },
    { key:'paid_by_name', label:'Paid By', render:p=><span className="text-neutral-500 dark:text-neutral-400">{p.paid_by_name ?? '—'}</span> },
    { key:'_act', label:'', sortable:false, render:p=>(
      <button onClick={()=>openDeletePayment(p)} title="Undo payment"
        className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
    )},
  ]

  const pendingTotal = charges.filter(c=>c.status !== 'paid').reduce((s, c) => s + Number(c.net_amount), 0)
  const paidTotal    = payments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Salary</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            Unpaid <span className="font-bold text-amber-600 dark:text-amber-400">${pendingTotal.toFixed(2)}</span>
            {' '}· Paid <span className="font-bold text-rose-600 dark:text-rose-400">${paidTotal.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          {tab === 'charges' && (
            <button onClick={() => { setChargeForm(EMPTY_CHARGE()); setMode('addCharge'); setError('') }}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
              <Plus size={15}/> New Salary Charge
            </button>
          )}
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <Tabs
        active={tab}
        onChange={k => setTab(k as typeof tab)}
        tabs={[
          { key: 'charges',  label: 'Salary Charges',  icon: <Wallet size={14}/>,   count: charges.length },
          { key: 'payments', label: 'Salary Payments', icon: <Banknote size={14}/>, count: payments.length },
        ]}
      />

      {tab === 'charges' ? (
        <DataTable columns={CHARGE_COLS} data={charges} title="Salary Charges" filename="salary_charges"
          rowKey={c=>c.id} searchPlaceholder="Search staff…" loading={loading}/>
      ) : (
        <DataTable columns={PAYMENT_COLS} data={payments} title="Salary Payments" filename="salary_payments"
          rowKey={p=>p.id} searchPlaceholder="Search staff, account…" loading={loading}/>
      )}

      {/* ── New / Edit Salary Charge ────────────────────────────────────── */}
      <Modal open={mode === 'addCharge' || mode === 'editCharge'} onClose={close}
        title={mode === 'editCharge' ? `Edit Charge — ${deleteCharge?.staff_name ?? ''}` : 'New Salary Charge'} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveCharge} disabled={(mode==='addCharge' && !chargeForm.staff_id) || !chargeForm.gross_amount || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editCharge' ? 'Save Changes' : 'Create Charge'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {mode === 'editCharge' ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">{deleteCharge?.staff_name}</p>
              <p className="font-mono text-[11px] text-neutral-400">{deleteCharge?.employee_id}</p>
            </div>
          ) : (
            <Field label="Staff Member">
              <Select value={chargeForm.staff_id} onChange={handleStaffChange}
                placeholder="— Select staff —"
                options={staff.map(s => ({
                  value: s.id,
                  label: `${s.first_name} ${s.last_name} (${s.employee_id})${s.basic_salary ? ` — $${Number(s.basic_salary).toFixed(2)}/mo` : ''}`,
                }))}/>
              {chargeForm.staff_id && staff.find(s=>s.id===chargeForm.staff_id)?.basic_salary && (
                <p className="mt-1.5 text-[11.5px] text-neutral-400">
                  Registered base salary: <span className="font-semibold text-neutral-600 dark:text-neutral-300">${Number(staff.find(s=>s.id===chargeForm.staff_id)?.basic_salary).toFixed(2)}</span> — gross amount below is pre-filled from this and can still be edited.
                </p>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period Start">
              <DatePicker value={chargeForm.period_start} onChange={v=>setChargeForm(p=>({...p, period_start: v}))}/>
            </Field>
            <Field label="Period End">
              <DatePicker value={chargeForm.period_end} onChange={v=>setChargeForm(p=>({...p, period_end: v}))}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gross Amount ($)">
              <input type="number" step="0.01" min="0" value={chargeForm.gross_amount}
                onChange={e=>setChargeForm(p=>({...p, gross_amount: e.target.value}))}
                placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Deductions ($)">
              <input type="number" step="0.01" min="0" value={chargeForm.deductions}
                onChange={e=>setChargeForm(p=>({...p, deductions: e.target.value}))}
                placeholder="0.00" className={INPUT}/>
            </Field>
          </div>
          {chargeForm.gross_amount && (
            <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-3 dark:bg-indigo-500/10">
              <span className="text-[12.5px] font-semibold text-indigo-800 dark:text-indigo-300">Net Pay</span>
              <span className="text-[18px] font-extrabold text-indigo-700 dark:text-indigo-300">
                ${(Number(chargeForm.gross_amount) - (Number(chargeForm.deductions) || 0)).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Pay Salary ──────────────────────────────────────────────────── */}
      <Modal open={mode === 'pay'} onClose={close}
        title={`Pay Salary — ${payCharge?.staff_name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={savePay} disabled={!payForm.account_id || !payForm.amount || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Banknote size={13}/>} Pay
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-500/10">
            <p className="text-[13px] font-bold text-indigo-800 dark:text-indigo-300">
              {payCharge?.staff_name} — net ${Number(payCharge?.net_amount ?? 0).toFixed(2)}
            </p>
            <p className="mt-0.5 text-[12px] text-indigo-600 dark:text-indigo-400">
              {payCharge?.period_start?.slice(0,10)} → {payCharge?.period_end?.slice(0,10)}
            </p>
          </div>
          <Field label="Pay From (account)">
            <Select value={payForm.account_id} onChange={v=>setPayForm(p=>({...p, account_id: v}))}
              placeholder="— Select account —"
              options={accounts.map(a => ({ value: a.id, label: `${a.name} (${a.account_type.replace(/_/g,' ')})` }))}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ($)">
              <input type="number" step="0.01" min="0" value={payForm.amount}
                onChange={e=>setPayForm(p=>({...p, amount: e.target.value}))} className={INPUT}/>
            </Field>
            <Field label="Payment Date">
              <DatePicker value={payForm.payment_date} onChange={v=>setPayForm(p=>({...p, payment_date: v}))}/>
            </Field>
          </div>
          <Field label="Reference (optional)">
            <input value={payForm.reference_number} onChange={e=>setPayForm(p=>({...p, reference_number: e.target.value}))}
              placeholder="e.g. SAL-JUL-01" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'deleteCharge' || mode === 'deletePayment'} onClose={close}
        title={mode === 'deletePayment' ? 'Undo Payment' : 'Delete Salary Charge'} size="sm"
        footer={<><CancelBtn onClick={close}/><button
          onClick={mode === 'deletePayment' ? doDeletePayment : doDeleteCharge}
          disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} {mode === 'deletePayment' ? 'Undo Payment' : 'Delete'}
        </button></>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {mode === 'deletePayment' ? (
            <>
              <p className="text-[14px] font-bold text-neutral-800 dark:text-white">
                Undo ${Number(selectedPayment?.amount ?? 0).toFixed(2)} salary payment for {selectedPayment?.staff_name}?
              </p>
              <p className="mt-1 text-[13px] text-neutral-500">This reverses the ledger entry and re-opens the charge so it can be paid again.</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete salary charge for {deleteCharge?.staff_name}?</p>
              <p className="mt-1 text-[13px] text-neutral-500">Paid charges may be rejected by the server if already settled.</p>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
