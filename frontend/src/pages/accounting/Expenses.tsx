import { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, Flame, FileStack, Banknote, Repeat, CircleDot, Pencil, Trash2,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { Tabs } from '@/components/ui/Tabs'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types (mirror expense / expense_charge / expense_payment tables) ─────────

interface Expense {
  id: string; name: string; category: string; description?: string
  is_recurring: boolean; charge_count: string; total_charged: string
}
interface ExpenseCharge {
  id: string; amount: string; charge_date: string; due_date?: string
  status: string; description?: string; expense_name: string; category: string
}
interface ExpensePayment {
  id: string; amount: string; payment_date: string; reference_number?: string
  notes?: string; expense_name: string; category: string; is_recurring: boolean
  account_name: string; paid_by_name?: string
}
interface Account { id: string; account_type: string; name: string; is_active: boolean }

const CHARGE_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  approved: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  paid:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  voided:   'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
}

const EXPENSE_CATEGORIES = [
  'rent','utilities','electricity','water','internet','fuel','maintenance',
  'marketing','cleaning','security','transport','licenses','insurance','other',
].map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))

function todayISO() {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`
}

// ─── Forms ────────────────────────────────────────────────────────────────────

interface ExpenseForm { name: string; category: string; expense_kind: 'fixed' | 'normal'; description: string }
const EMPTY_EXPENSE: ExpenseForm = { name: '', category: 'utilities', expense_kind: 'normal', description: '' }

interface ChargeForm { expense_id: string; amount: string; charge_date: string; due_date: string; description: string }
const EMPTY_CHARGE = (): ChargeForm => ({ expense_id: '', amount: '', charge_date: todayISO(), due_date: '', description: '' })

interface PayForm { account_id: string; amount: string; payment_date: string; reference_number: string; notes: string }
const EMPTY_PAY = (): PayForm => ({ account_id: '', amount: '', payment_date: todayISO(), reference_number: '', notes: '' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Expenses() {
  const [tab, setTab] = useState<'expenses' | 'charges' | 'payments'>('expenses')

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [charges,  setCharges]  = useState<ExpenseCharge[]>([])
  const [payments, setPayments] = useState<ExpensePayment[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode, setMode] = useState<null | 'addExpense' | 'editExpense' | 'deleteExpense' | 'addCharge' | 'editCharge' | 'deleteCharge' | 'pay' | 'deletePayment'>(null)
  const [payCharge, setPayCharge] = useState<ExpenseCharge | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [selectedCharge, setSelectedCharge] = useState<ExpenseCharge | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<ExpensePayment | null>(null)

  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(EMPTY_EXPENSE)
  const [chargeForm,  setChargeForm]  = useState<ChargeForm>(EMPTY_CHARGE)
  const [payForm,     setPayForm]     = useState<PayForm>(EMPTY_PAY)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eRes, cRes, pRes, aRes] = await Promise.all([
        api.get('/accounting/expenses'),
        api.get('/accounting/expense-charges'),
        api.get('/accounting/expense-payments'),
        api.get('/accounting/accounts'),
      ])
      setExpenses(eRes.data.data)
      setCharges(cRes.data.data)
      setPayments(pRes.data.data)
      setAccounts((aRes.data.data as Account[]).filter(a =>
        a.is_active && ['cash','bank','mobile_money'].includes(a.account_type)))
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const close = () => { setMode(null); setPayCharge(null); setSelectedExpense(null); setSelectedCharge(null); setSelectedPayment(null); setError('') }

  // ── Saves ───────────────────────────────────────────────────────────────────

  const openEditExpense = (e: Expense) => {
    setSelectedExpense(e)
    setExpenseForm({ name: e.name, category: e.category, expense_kind: e.is_recurring ? 'fixed' : 'normal', description: e.description ?? '' })
    setMode('editExpense'); setError('')
  }
  const openDeleteExpense = (e: Expense) => { setSelectedExpense(e); setMode('deleteExpense'); setError('') }
  const openEditCharge = (c: ExpenseCharge) => {
    setSelectedCharge(c)
    setChargeForm({
      expense_id: '', amount: String(c.amount),
      charge_date: c.charge_date?.slice(0,10) ?? todayISO(),
      due_date: c.due_date?.slice(0,10) ?? '', description: c.description ?? '',
    })
    setMode('editCharge'); setError('')
  }
  const openDeleteCharge = (c: ExpenseCharge) => { setSelectedCharge(c); setMode('deleteCharge'); setError('') }
  const openDeletePayment = (p: ExpensePayment) => { setSelectedPayment(p); setMode('deletePayment'); setError('') }

  const saveExpense = async () => {
    if (!expenseForm.name.trim()) { setError('Expense name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name:         expenseForm.name.trim(),
        category:     expenseForm.category,
        description:  expenseForm.description || undefined,
        // Fixed = recurring monthly expense, Normal = one-time
        is_recurring: expenseForm.expense_kind === 'fixed',
      }
      if (mode === 'editExpense' && selectedExpense) await api.put('/accounting/expenses/' + selectedExpense.id, payload)
      else await api.post('/accounting/expenses', payload)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDeleteExpense = async () => {
    if (!selectedExpense) return
    setSaving(true); setError('')
    try { await api.delete('/accounting/expenses/' + selectedExpense.id); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }
  const doDeleteCharge = async () => {
    if (!selectedCharge) return
    setSaving(true); setError('')
    try { await api.delete('/accounting/expense-charges/' + selectedCharge.id); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // Undo a payment — reverses its ledger entry and re-opens the charge so it
  // can be paid again. Payments themselves aren't edited in place; correcting
  // one means undoing it and recording it again with the right details.
  const doDeletePayment = async () => {
    if (!selectedPayment) return
    setSaving(true); setError('')
    try { await api.delete('/accounting/expense-payments/' + selectedPayment.id); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const saveCharge = async () => {
    if (!chargeForm.amount) { setError('Amount is required'); return }
    setSaving(true); setError('')
    try {
      if (mode === 'editCharge' && selectedCharge) {
        await api.put(`/accounting/expense-charges/${selectedCharge.id}`, {
          amount:      Number(chargeForm.amount),
          charge_date: chargeForm.charge_date,
          due_date:    chargeForm.due_date || undefined,
          description: chargeForm.description || undefined,
        })
      } else {
        if (!chargeForm.expense_id) { setError('Expense is required'); setSaving(false); return }
        await api.post('/accounting/expense-charges', {
          expense_id:  chargeForm.expense_id,
          amount:      Number(chargeForm.amount),
          charge_date: chargeForm.charge_date,
          due_date:    chargeForm.due_date || undefined,
          description: chargeForm.description || undefined,
        })
      }
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const openPay = (c: ExpenseCharge) => {
    setPayCharge(c)
    setPayForm({ ...EMPTY_PAY(), amount: String(c.amount), account_id: accounts[0]?.id ?? '' })
    setMode('pay'); setError('')
  }

  const savePay = async () => {
    if (!payCharge || !payForm.account_id || !payForm.amount) { setError('Account and amount are required'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/accounting/expense-charges/${payCharge.id}/pay`, {
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

  // ── Columns ─────────────────────────────────────────────────────────────────

  const EXPENSE_COLS: DTColumn<Expense>[] = [
    { key:'name', label:'Expense', render:e=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400">
          <Flame size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{e.name}</p>
          <p className="text-[11px] text-neutral-400">{e.description ?? '—'}</p>
        </div>
      </div>
    )},
    { key:'category', label:'Category', render:e=><span className="capitalize text-neutral-500 dark:text-neutral-400">{e.category}</span> },
    { key:'is_recurring', label:'Type', render:e=>(
      <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        e.is_recurring
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}>
        {e.is_recurring ? <><Repeat size={11}/> Fixed</> : <><CircleDot size={11}/> Normal</>}
      </span>
    ), exportValue:e=>e.is_recurring ? 'fixed' : 'normal' },
    { key:'charge_count', label:'Charges', render:e=><span className="font-bold text-neutral-700 dark:text-neutral-300">{e.charge_count}</span>, exportValue:e=>e.charge_count },
    { key:'total_charged', label:'Total Charged', render:e=><span className="font-extrabold text-neutral-800 dark:text-white">${Number(e.total_charged).toFixed(2)}</span>, exportValue:e=>e.total_charged },
    { key:'_act', label:'', sortable:false, render:e=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEditExpense(e)} className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"><Pencil size={12}/></button>
        <button onClick={()=>openDeleteExpense(e)} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
      </div>
    )},
  ]

  const CHARGE_COLS: DTColumn<ExpenseCharge>[] = [
    { key:'charge_date', label:'Date', render:c=><span className="text-neutral-500 dark:text-neutral-400">{c.charge_date?.slice(0,10)}</span> },
    { key:'expense_name', label:'Expense', render:c=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{c.expense_name}</p>
        <p className="text-[11px] capitalize text-neutral-400">{c.category}</p>
      </div>
    )},
    { key:'amount', label:'Amount', render:c=><span className="font-extrabold text-neutral-800 dark:text-white">${Number(c.amount).toFixed(2)}</span>, exportValue:c=>c.amount },
    { key:'due_date', label:'Due', render:c=><span className="text-neutral-500 dark:text-neutral-400">{c.due_date?.slice(0,10) ?? '—'}</span> },
    { key:'status', label:'Status', render:c=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${CHARGE_BADGE[c.status] ?? ''}`}>{c.status}</span>
    )},
    { key:'_act', label:'', sortable:false, render:c=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        {c.status !== 'paid' && c.status !== 'voided' ? <>
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

  const PAYMENT_COLS: DTColumn<ExpensePayment>[] = [
    { key:'payment_date', label:'Date', render:p=><span className="text-neutral-500 dark:text-neutral-400">{p.payment_date?.slice(0,10)}</span> },
    { key:'expense_name', label:'Expense', render:p=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{p.expense_name}</p>
        <p className="text-[11px] capitalize text-neutral-400">
          {p.category} · {p.is_recurring ? 'Fixed' : 'Normal'}
        </p>
      </div>
    )},
    { key:'amount', label:'Paid', render:p=><span className="font-extrabold text-rose-600 dark:text-rose-400">−${Number(p.amount).toFixed(2)}</span>, exportValue:p=>p.amount },
    { key:'account_name', label:'Paid From', render:p=><span className="text-neutral-500 dark:text-neutral-400">{p.account_name}</span> },
    { key:'reference_number', label:'Reference', render:p=><span className="font-mono text-[12px] text-neutral-500">{p.reference_number ?? '—'}</span> },
    { key:'paid_by_name', label:'Paid By', render:p=><span className="text-neutral-500 dark:text-neutral-400">{p.paid_by_name ?? '—'}</span> },
    { key:'notes', label:'Notes', render:p=><span className="text-[12px] text-neutral-400">{p.notes ?? '—'}</span> },
    { key:'_act', label:'', sortable:false, render:p=>(
      <button onClick={()=>openDeletePayment(p)} title="Undo payment"
        className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
    )},
  ]

  const pendingTotal = charges.filter(c=>c.status !== 'paid' && c.status !== 'voided')
    .reduce((s, c) => s + Number(c.amount), 0)
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount), 0)

  const headerAction = tab === 'charges' ? (
    <button onClick={() => { setChargeForm({ ...EMPTY_CHARGE(), expense_id: expenses[0]?.id ?? '' }); setMode('addCharge'); setError('') }}
      className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
      <Plus size={15}/> New Charge
    </button>
  ) : tab === 'expenses' ? (
    <button onClick={() => { setExpenseForm(EMPTY_EXPENSE); setMode('addExpense'); setError('') }}
      className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
      <Plus size={15}/> New Expense
    </button>
  ) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Expenses</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            Unpaid <span className="font-bold text-amber-600 dark:text-amber-400">${pendingTotal.toFixed(2)}</span>
            {' '}· Paid <span className="font-bold text-rose-600 dark:text-rose-400">${paidTotal.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          {headerAction}
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <Tabs
        active={tab}
        onChange={k => setTab(k as typeof tab)}
        tabs={[
          { key: 'expenses', label: 'Expenses',         icon: <Flame size={14}/>,     count: expenses.length },
          { key: 'charges',  label: 'Expense Charges',  icon: <FileStack size={14}/>, count: charges.length },
          { key: 'payments', label: 'Expense Payments', icon: <Banknote size={14}/>,  count: payments.length },
        ]}
      />

      {tab === 'expenses' && (
        <DataTable columns={EXPENSE_COLS} data={expenses} title="Expenses" filename="expenses"
          rowKey={e=>e.id} searchPlaceholder="Search expense, category…" loading={loading}/>
      )}
      {tab === 'charges' && (
        <DataTable columns={CHARGE_COLS} data={charges} title="Expense Charges" filename="expense_charges"
          rowKey={c=>c.id} searchPlaceholder="Search expense…" loading={loading}/>
      )}
      {tab === 'payments' && (
        <DataTable columns={PAYMENT_COLS} data={payments} title="Expense Payments" filename="expense_payments"
          rowKey={p=>p.id} searchPlaceholder="Search expense, account…" loading={loading}/>
      )}

      {/* ── New Expense ─────────────────────────────────────────────────── */}
      <Modal open={mode === 'addExpense' || mode === 'editExpense'} onClose={close} title={mode === 'editExpense' ? `Edit: ${selectedExpense?.name ?? ''}` : 'New Expense'} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveExpense} disabled={!expenseForm.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editExpense' ? 'Save Changes' : 'Create Expense'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expense Name">
              <input value={expenseForm.name} onChange={e=>setExpenseForm(p=>({...p, name: e.target.value}))}
                placeholder="e.g. Office Rent, Electricity" className={INPUT} autoFocus/>
            </Field>
            <Field label="Category">
              <Select value={expenseForm.category} onChange={v=>setExpenseForm(p=>({...p, category: v}))} options={EXPENSE_CATEGORIES}/>
            </Field>
          </div>

          {/* Fixed vs Normal — maps to is_recurring in the expense table */}
          <Field label="Expense Type">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={()=>setExpenseForm(p=>({...p, expense_kind: 'fixed'}))}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                  expenseForm.expense_kind === 'fixed'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-white/[0.08]'}`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
                  <Repeat size={14}/>
                </span>
                <span>
                  <span className={`block text-[13px] font-bold ${expenseForm.expense_kind === 'fixed' ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-200'}`}>Fixed</span>
                  <span className="block text-[11px] text-neutral-400">Recurring (rent, salaries…)</span>
                </span>
              </button>
              <button type="button" onClick={()=>setExpenseForm(p=>({...p, expense_kind: 'normal'}))}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                  expenseForm.expense_kind === 'normal'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-white/[0.08]'}`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-300">
                  <CircleDot size={14}/>
                </span>
                <span>
                  <span className={`block text-[13px] font-bold ${expenseForm.expense_kind === 'normal' ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-200'}`}>Normal</span>
                  <span className="block text-[11px] text-neutral-400">One-time expense</span>
                </span>
              </button>
            </div>
          </Field>

          <Field label="Description (optional)">
            <input value={expenseForm.description} onChange={e=>setExpenseForm(p=>({...p, description: e.target.value}))}
              placeholder="Details…" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* ── New / Edit Charge ───────────────────────────────────────────── */}
      <Modal open={mode === 'addCharge' || mode === 'editCharge'} onClose={close}
        title={mode === 'editCharge' ? `Edit Charge — ${selectedCharge?.expense_name ?? ''}` : 'New Expense Charge'} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveCharge} disabled={(mode==='addCharge' && !chargeForm.expense_id) || !chargeForm.amount || saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editCharge' ? 'Save Changes' : 'Create Charge'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {mode === 'editCharge' ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">{selectedCharge?.expense_name}</p>
              <p className="text-[11px] capitalize text-neutral-400">{selectedCharge?.category}</p>
            </div>
          ) : (
            <Field label="Expense">
              <Select value={chargeForm.expense_id} onChange={v=>setChargeForm(p=>({...p, expense_id: v}))}
                placeholder="— Select expense —"
                options={expenses.map(e => ({ value: e.id, label: `${e.name} (${e.category} · ${e.is_recurring ? 'Fixed' : 'Normal'})` }))}/>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ($)">
              <input type="number" step="0.01" min="0" value={chargeForm.amount}
                onChange={e=>setChargeForm(p=>({...p, amount: e.target.value}))}
                placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Charge Date">
              <DatePicker value={chargeForm.charge_date} onChange={v=>setChargeForm(p=>({...p, charge_date: v}))}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due Date (optional)">
              <DatePicker value={chargeForm.due_date} onChange={v=>setChargeForm(p=>({...p, due_date: v}))} placeholder="Select date"/>
            </Field>
            <Field label="Description (optional)">
              <input value={chargeForm.description} onChange={e=>setChargeForm(p=>({...p, description: e.target.value}))}
                placeholder="e.g. July bill" className={INPUT}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── Pay Charge ──────────────────────────────────────────────────── */}
      <Modal open={mode === 'pay'} onClose={close}
        title={`Pay — ${payCharge?.expense_name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={savePay} disabled={!payForm.account_id || !payForm.amount || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Banknote size={13}/>} Pay
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10">
            <p className="text-[13px] font-bold text-rose-800 dark:text-rose-300">
              {payCharge?.expense_name} — ${Number(payCharge?.amount ?? 0).toFixed(2)}
            </p>
            <p className="mt-0.5 text-[12px] text-rose-600 dark:text-rose-400 capitalize">{payCharge?.category} · charged {payCharge?.charge_date?.slice(0,10)}</p>
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
              placeholder="e.g. CHQ-1023" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'deleteExpense' || mode === 'deleteCharge' || mode === 'deletePayment'} onClose={close}
        title={mode === 'deletePayment' ? 'Undo Payment' : 'Delete Record'} size="sm"
        footer={<><CancelBtn onClick={close}/><button
          onClick={mode === 'deleteExpense' ? doDeleteExpense : mode === 'deleteCharge' ? doDeleteCharge : doDeletePayment}
          disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} {mode === 'deletePayment' ? 'Undo Payment' : 'Delete'}
        </button></>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {mode === 'deletePayment' ? (
            <>
              <p className="text-[14px] font-bold text-neutral-800 dark:text-white">
                Undo ${Number(selectedPayment?.amount ?? 0).toFixed(2)} payment for {selectedPayment?.expense_name}?
              </p>
              <p className="mt-1 text-[13px] text-neutral-500">This reverses the ledger entry and re-opens the charge so it can be paid again.</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selectedExpense?.name ?? selectedCharge?.expense_name ?? 'this record'}?</p>
              <p className="mt-1 text-[13px] text-neutral-500">This removes it from active expense records.</p>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
