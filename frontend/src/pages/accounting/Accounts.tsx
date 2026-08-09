import { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, Landmark, ArrowLeftRight, Coins, Wallet,
  Banknote, Smartphone, TrendingUp, Pencil, Trash2,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { Tabs } from '@/components/ui/Tabs'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useToast } from '@/contexts/ToastContext'

// ─── Types (mirror account / account_transfer / other_income tables) ─────────

interface Account {
  id: string; account_type: string; name: string
  institution?: string; account_number?: string
  is_active: boolean; opened_date: string
  balance?: number
}
interface Transfer {
  id: string; amount: string; transfer_date: string
  description?: string; reference?: string
  from_account: string; to_account: string
  from_account_id?: string; to_account_id?: string
}
interface OtherIncome {
  id: string; name: string; amount: string; income_date: string
  description?: string; reference?: string; account_name?: string; account_id?: string
}

const ACCOUNT_TYPES = [
  { value: 'cash',         label: 'Cash' },
  { value: 'bank',         label: 'Bank' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'supplier',     label: 'Supplier' },
  { value: 'customer',     label: 'Customer' },
  { value: 'expense',      label: 'Expense' },
  { value: 'income',       label: 'Income' },
  { value: 'equity',       label: 'Equity (Capital)' },
  { value: 'asset',        label: 'Asset' },
]

const TYPE_ICON: Record<string, React.ReactNode> = {
  cash: <Banknote size={14}/>, bank: <Landmark size={14}/>, mobile_money: <Smartphone size={14}/>,
  equity: <TrendingUp size={14}/>,
}

const TYPE_BADGE: Record<string, string> = {
  cash:         'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  bank:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  mobile_money: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  supplier:     'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  customer:     'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  expense:      'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  income:       'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  equity:       'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300',
  asset:        'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function todayISO() {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`
}

interface AccountForm {
  account_type: string; name: string; institution: string; account_number: string
  opened_date: string; notes: string
  opening_balance: string; balance_type: 'debit' | 'credit'
}
const EMPTY_ACCOUNT = (): AccountForm => ({
  account_type: 'cash', name: '', institution: '', account_number: '',
  opened_date: todayISO(), notes: '', opening_balance: '', balance_type: 'debit',
})

interface TransferForm { from_account_id: string; to_account_id: string; amount: string; transfer_date: string; description: string; reference: string }
const EMPTY_TRANSFER = (): TransferForm => ({ from_account_id: '', to_account_id: '', amount: '', transfer_date: todayISO(), description: '', reference: '' })

interface IncomeForm { name: string; amount: string; account_id: string; income_date: string; description: string; reference: string }
const EMPTY_INCOME = (): IncomeForm => ({ name: '', amount: '', account_id: '', income_date: todayISO(), description: '', reference: '' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'accounts' | 'transfers' | 'income'>('accounts')

  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [income,    setIncome]    = useState<OtherIncome[]>([])

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode, setMode] = useState<null | 'addAccount' | 'editAccount' | 'deleteAccount' | 'addTransfer' | 'editTransfer' | 'deleteTransfer' | 'addIncome' | 'editIncome' | 'deleteIncome'>(null)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null)
  const [selectedIncome, setSelectedIncome] = useState<OtherIncome | null>(null)
  const [accountForm,  setAccountForm]  = useState<AccountForm>(EMPTY_ACCOUNT)
  const [transferForm, setTransferForm] = useState<TransferForm>(EMPTY_TRANSFER)
  const [incomeForm,   setIncomeForm]   = useState<IncomeForm>(EMPTY_INCOME)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [aRes, bRes, tRes, iRes] = await Promise.all([
        api.get('/accounting/accounts'),
        api.get('/accounting/accounts/balances'),
        api.get('/accounting/transfers'),
        api.get('/accounting/other-income'),
      ])
      // Merge balances into the account rows
      const balMap = new Map<string, number>(
        (bRes.data.data as { id: string; balance: string }[]).map(b => [b.id, Number(b.balance)])
      )
      setAccounts((aRes.data.data as Account[]).map(a => ({ ...a, balance: balMap.get(a.id) ?? 0 })))
      setTransfers(tRes.data.data)
      setIncome(iRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const close = () => { setMode(null); setSelectedAccount(null); setSelectedTransfer(null); setSelectedIncome(null); setError('') }

  // ── Saves ───────────────────────────────────────────────────────────────────

  const openEditAccount = (a: Account) => {
    setSelectedAccount(a)
    setAccountForm({
      account_type: a.account_type,
      name: a.name,
      institution: a.institution ?? '',
      account_number: a.account_number ?? '',
      opened_date: a.opened_date?.slice(0,10) ?? todayISO(),
      notes: '',
      opening_balance: '', balance_type: 'debit',
    })
    setMode('editAccount'); setError('')
  }
  const openDeleteAccount = (a: Account) => { setSelectedAccount(a); setMode('deleteAccount'); setError('') }

  const openEditTransfer = (t: Transfer) => {
    setSelectedTransfer(t)
    setTransferForm({
      from_account_id: t.from_account_id ?? '',
      to_account_id: t.to_account_id ?? '',
      amount: String(t.amount),
      transfer_date: t.transfer_date?.slice(0,10) ?? todayISO(),
      description: t.description ?? '',
      reference: t.reference ?? '',
    })
    setMode('editTransfer'); setError('')
  }
  const openDeleteTransfer = (t: Transfer) => { setSelectedTransfer(t); setMode('deleteTransfer'); setError('') }

  const openEditIncome = (i: OtherIncome) => {
    setSelectedIncome(i)
    setIncomeForm({
      name: i.name,
      amount: String(i.amount),
      account_id: i.account_id ?? '',
      income_date: i.income_date?.slice(0,10) ?? todayISO(),
      description: i.description ?? '',
      reference: i.reference ?? '',
    })
    setMode('editIncome'); setError('')
  }
  const openDeleteIncome = (i: OtherIncome) => { setSelectedIncome(i); setMode('deleteIncome'); setError('') }

  const saveAccount = async () => {
    if (!accountForm.name.trim()) { setError('Account name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        account_type:   accountForm.account_type,
        name:           accountForm.name.trim(),
        institution:    accountForm.institution || undefined,
        account_number: accountForm.account_number || undefined,
        opened_date:    accountForm.opened_date,
        notes:          accountForm.notes || undefined,
        opening_balance: Number(accountForm.opening_balance) || 0,
        balance_type:    accountForm.balance_type,
      }
      if (mode === 'editAccount' && selectedAccount) await api.put(`/accounting/accounts/${selectedAccount.id}`, payload)
      else await api.post('/accounting/accounts', payload)
      close(); showToast(mode === 'editAccount' ? 'Account updated' : 'Account created', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const doDeleteAccount = async () => {
    if (!selectedAccount) return
    setSaving(true); setError('')
    try { await api.delete(`/accounting/accounts/${selectedAccount.id}`); close(); showToast('Account deleted', 'success'); load() }
    catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }
  const doDeleteTransfer = async () => {
    if (!selectedTransfer) return
    setSaving(true); setError('')
    try { await api.delete(`/accounting/transfers/${selectedTransfer.id}`); close(); showToast('Transfer undone', 'success'); load() }
    catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }
  const doDeleteIncome = async () => {
    if (!selectedIncome) return
    setSaving(true); setError('')
    try { await api.delete(`/accounting/other-income/${selectedIncome.id}`); close(); showToast('Income entry undone', 'success'); load() }
    catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const saveTransfer = async () => {
    if (!transferForm.from_account_id || !transferForm.to_account_id || !transferForm.amount) {
      setError('From, to, and amount are required'); return
    }
    if (transferForm.from_account_id === transferForm.to_account_id) {
      setError('Cannot transfer to the same account'); return
    }
    // Client-side heads-up before hitting the server — which still enforces
    // this authoritatively, accounting for the edited transfer's own reversal.
    if (Number(transferForm.amount) > transferAvailable) {
      setError(`Insufficient balance in source account — available: $${transferAvailable.toFixed(2)}`); return
    }
    setSaving(true); setError('')
    try {
      const payload = {
        from_account_id: transferForm.from_account_id,
        to_account_id:   transferForm.to_account_id,
        amount:          Number(transferForm.amount),
        transfer_date:   transferForm.transfer_date,
        description:     transferForm.description || undefined,
        reference:       transferForm.reference || undefined,
      }
      if (mode === 'editTransfer' && selectedTransfer) await api.put(`/accounting/transfers/${selectedTransfer.id}`, payload)
      else await api.post('/accounting/transfers', payload)
      close(); showToast(mode === 'editTransfer' ? 'Transfer updated' : 'Transfer completed', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const saveIncome = async () => {
    if (!incomeForm.name.trim() || !incomeForm.amount) { setError('Name and amount are required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name:        incomeForm.name.trim(),
        amount:      Number(incomeForm.amount),
        account_id:  incomeForm.account_id || undefined,
        income_date: incomeForm.income_date,
        description: incomeForm.description || undefined,
        reference:   incomeForm.reference || undefined,
      }
      if (mode === 'editIncome' && selectedIncome) await api.put(`/accounting/other-income/${selectedIncome.id}`, payload)
      else await api.post('/accounting/other-income', payload)
      close(); showToast(mode === 'editIncome' ? 'Income entry updated' : 'Income recorded', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // ── Columns ─────────────────────────────────────────────────────────────────

  const ACC_COLS: DTColumn<Account>[] = [
    { key:'name', label:'Account', render:a=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400">
          {TYPE_ICON[a.account_type] ?? <Wallet size={14}/>}
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{a.name}</p>
          <p className="text-[11px] text-neutral-400">{a.institution ?? '—'}</p>
        </div>
      </div>
    )},
    { key:'account_type', label:'Type', render:a=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${TYPE_BADGE[a.account_type] ?? ''}`}>
        {a.account_type.replace(/_/g,' ')}
      </span>
    )},
    { key:'account_number', label:'Account #', render:a=><span className="font-mono text-[12px] text-neutral-500">{a.account_number ?? '—'}</span> },
    { key:'balance', label:'Balance', render:a=>(
      <span className={`font-extrabold ${Number(a.balance) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-800 dark:text-white'}`}>
        ${Number(a.balance ?? 0).toFixed(2)}
      </span>
    ), exportValue:a=>a.balance ?? 0 },
    { key:'opened_date', label:'Opened', render:a=><span className="text-neutral-500 dark:text-neutral-400">{a.opened_date?.slice(0,10)}</span> },
    { key:'is_active', label:'Status', render:a=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        a.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}>{a.is_active ? 'Active' : 'Inactive'}</span>
    )},
    { key:'_act', label:'', sortable:false, render:a=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEditAccount(a)} className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"><Pencil size={12}/></button>
        <button onClick={()=>openDeleteAccount(a)} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
      </div>
    )},
  ]

  const TRANSFER_COLS: DTColumn<Transfer>[] = [
    { key:'transfer_date', label:'Date', render:t=><span className="text-neutral-500 dark:text-neutral-400">{t.transfer_date?.slice(0,10)}</span> },
    { key:'from_account', label:'From', render:t=><span className="font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">{t.from_account}</span> },
    { key:'_arrow', label:'', sortable:false, render:()=> <ArrowLeftRight size={13} className="text-neutral-300 dark:text-neutral-600"/> },
    { key:'to_account', label:'To', render:t=><span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{t.to_account}</span> },
    { key:'amount', label:'Amount', render:t=><span className="font-extrabold text-neutral-800 dark:text-white">${Number(t.amount).toFixed(2)}</span>, exportValue:t=>t.amount },
    { key:'reference', label:'Reference', render:t=><span className="font-mono text-[12px] text-neutral-500">{t.reference ?? '—'}</span> },
    { key:'description', label:'Description', render:t=><span className="text-[12px] text-neutral-400">{t.description ?? '—'}</span> },
    { key:'_act', label:'', sortable:false, render:t=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEditTransfer(t)} title="Edit transfer"
          className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={()=>openDeleteTransfer(t)} title="Undo transfer"
          className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  const INCOME_COLS: DTColumn<OtherIncome>[] = [
    { key:'income_date', label:'Date', render:i=><span className="text-neutral-500 dark:text-neutral-400">{i.income_date?.slice(0,10)}</span> },
    { key:'name', label:'Income Source', render:i=>(
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400">
          <Coins size={13}/>
        </div>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{i.name}</span>
      </div>
    )},
    { key:'amount', label:'Amount', render:i=><span className="font-extrabold text-emerald-600 dark:text-emerald-400">+${Number(i.amount).toFixed(2)}</span>, exportValue:i=>i.amount },
    { key:'account_name', label:'Deposited To', render:i=><span className="text-neutral-500 dark:text-neutral-400">{i.account_name ?? '—'}</span> },
    { key:'reference', label:'Reference', render:i=><span className="font-mono text-[12px] text-neutral-500">{i.reference ?? '—'}</span> },
    { key:'description', label:'Description', render:i=><span className="text-[12px] text-neutral-400">{i.description ?? '—'}</span> },
    { key:'_act', label:'', sortable:false, render:i=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEditIncome(i)} title="Edit income entry"
          className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={()=>openDeleteIncome(i)} title="Undo income entry"
          className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  // Cash-like accounts are the useful ones for transfers / deposits
  const moneyAccounts = accounts.filter(a => a.is_active)
  const accountOptions = moneyAccounts.map(a => ({
    value: a.id,
    label: `${a.name} (${a.account_type.replace(/_/g,' ')} · $${Number(a.balance ?? 0).toFixed(2)})`,
  }))

  const totalBalance = accounts
    .filter(a => ['cash','bank','mobile_money'].includes(a.account_type))
    .reduce((s, a) => s + Number(a.balance ?? 0), 0)

  // Available balance for the currently-picked "From Account" — when editing
  // a transfer without changing its source account, add its own old amount
  // back in first, since the server backs that out before re-checking too.
  const transferAvailable = (() => {
    const acc = accounts.find(a => a.id === transferForm.from_account_id)
    if (!acc) return 0
    const bal = Number(acc.balance ?? 0)
    if (mode === 'editTransfer' && selectedTransfer?.from_account_id === transferForm.from_account_id) {
      return bal + Number(selectedTransfer.amount)
    }
    return bal
  })()

  const headerAction = tab === 'accounts' ? (
    <button onClick={() => { setAccountForm(EMPTY_ACCOUNT()); setMode('addAccount'); setError('') }}
      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-700 transition-colors">
      <Plus size={15}/> New Account
    </button>
  ) : tab === 'transfers' ? (
    <button onClick={() => { setTransferForm(EMPTY_TRANSFER()); setMode('addTransfer'); setError('') }}
      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-700 transition-colors">
      <Plus size={15}/> New Transfer
    </button>
  ) : (
    <button onClick={() => { setIncomeForm(EMPTY_INCOME()); setMode('addIncome'); setError('') }}
      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-700 transition-colors">
      <Plus size={15}/> Record Income
    </button>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Accounts</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {accounts.length} accounts · liquid balance
            <span className="ml-1 font-bold text-emerald-600 dark:text-emerald-400">${totalBalance.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-violet-300 hover:text-violet-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
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
          { key: 'accounts',  label: 'Accounts',          icon: <Wallet size={14}/>,         count: accounts.length },
          { key: 'transfers', label: 'Account Transfers', icon: <ArrowLeftRight size={14}/>, count: transfers.length },
          { key: 'income',    label: 'Other Income',      icon: <Coins size={14}/>,          count: income.length },
        ]}
      />

      {tab === 'accounts' && (
        <DataTable columns={ACC_COLS} data={accounts} title="Accounts" filename="accounts"
          rowKey={a=>a.id} searchPlaceholder="Search account, type…" loading={loading}/>
      )}
      {tab === 'transfers' && (
        <DataTable columns={TRANSFER_COLS} data={transfers} title="Account Transfers" filename="account_transfers"
          rowKey={t=>t.id} searchPlaceholder="Search account, reference…" loading={loading}/>
      )}
      {tab === 'income' && (
        <DataTable columns={INCOME_COLS} data={income} title="Other Income" filename="other_income"
          rowKey={i=>i.id} searchPlaceholder="Search income source…" loading={loading}/>
      )}

      {/* ── New Account ─────────────────────────────────────────────────── */}
      <Modal open={mode === 'addAccount' || mode === 'editAccount'} onClose={close} title={mode === 'editAccount' ? `Edit: ${selectedAccount?.name ?? ''}` : 'New Account'} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveAccount} disabled={!accountForm.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editAccount' ? 'Save Changes' : 'Create Account'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account Type">
              <Select value={accountForm.account_type} onChange={v=>setAccountForm(p=>({...p, account_type: v}))} options={ACCOUNT_TYPES}/>
            </Field>
            <Field label="Account Name">
              <input value={accountForm.name} onChange={e=>setAccountForm(p=>({...p, name: e.target.value}))}
                placeholder="e.g. Main Cash, Salaam Bank" className={INPUT} autoFocus/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Institution (optional)">
              <input value={accountForm.institution} onChange={e=>setAccountForm(p=>({...p, institution: e.target.value}))}
                placeholder="e.g. Salaam Bank, EVC Plus" className={INPUT}/>
            </Field>
            <Field label="Account Number (optional)">
              <input value={accountForm.account_number} onChange={e=>setAccountForm(p=>({...p, account_number: e.target.value}))}
                placeholder="e.g. 0012345678" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opened Date">
              <DatePicker value={accountForm.opened_date} onChange={v=>setAccountForm(p=>({...p, opened_date: v}))}/>
            </Field>
            <Field label="Notes (optional)">
              <input value={accountForm.notes} onChange={e=>setAccountForm(p=>({...p, notes: e.target.value}))}
                placeholder="Notes…" className={INPUT}/>
            </Field>
          </div>

          {/* Opening balance — only when creating; recorded as a real ledger entry */}
          {mode === 'addAccount' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Opening Balance ($)">
                  <input type="number" step="0.01" min="0" value={accountForm.opening_balance}
                    onChange={e=>setAccountForm(p=>({...p, opening_balance: e.target.value}))}
                    placeholder="0.00 — money already in this account" className={INPUT}/>
                </Field>
                <Field label="Balance Type">
                  <Select value={accountForm.balance_type}
                    onChange={v=>setAccountForm(p=>({...p, balance_type: v as 'debit'|'credit'}))}
                    options={[
                      { value: 'debit',  label: 'Debit — positive (money in hand)' },
                      { value: 'credit', label: 'Credit — negative (owed out)' },
                    ]}/>
                </Field>
              </div>
              {Number(accountForm.opening_balance) > 0 && (
                <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
                  <p className="text-[12px] text-sky-700 dark:text-sky-300">
                    An opening entry of <b>${Number(accountForm.opening_balance).toFixed(2)}</b> ({accountForm.balance_type}) will be
                    written to the ledger — all future transactions calculate from this starting balance.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* ── New / Edit Transfer ─────────────────────────────────────────── */}
      <Modal open={mode === 'addTransfer' || mode === 'editTransfer'} onClose={close}
        title={mode === 'editTransfer' ? 'Edit Account Transfer' : 'New Account Transfer'} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveTransfer}
            disabled={!transferForm.from_account_id || !transferForm.to_account_id || !transferForm.amount || saving || Number(transferForm.amount) > transferAvailable}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <ArrowLeftRight size={13}/>} {mode === 'editTransfer' ? 'Save Changes' : 'Transfer'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="From Account">
            <Select value={transferForm.from_account_id} onChange={v=>setTransferForm(p=>({...p, from_account_id: v}))}
              placeholder="— Source account —" options={accountOptions}/>
            {transferForm.from_account_id && (
              <p className={`mt-1.5 text-[11.5px] ${Number(transferForm.amount) > transferAvailable ? 'text-rose-500' : 'text-neutral-400'}`}>
                Available: <span className="font-semibold">${transferAvailable.toFixed(2)}</span>
              </p>
            )}
          </Field>
          <Field label="To Account">
            <Select value={transferForm.to_account_id} onChange={v=>setTransferForm(p=>({...p, to_account_id: v}))}
              placeholder="— Destination account —"
              options={accountOptions.filter(o => o.value !== transferForm.from_account_id)}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ($)">
              <input type="number" step="0.01" min="0" value={transferForm.amount}
                onChange={e=>setTransferForm(p=>({...p, amount: e.target.value}))}
                placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Transfer Date">
              <DatePicker value={transferForm.transfer_date} onChange={v=>setTransferForm(p=>({...p, transfer_date: v}))}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reference (optional)">
              <input value={transferForm.reference} onChange={e=>setTransferForm(p=>({...p, reference: e.target.value}))}
                placeholder="e.g. TRF-001" className={INPUT}/>
            </Field>
            <Field label="Description (optional)">
              <input value={transferForm.description} onChange={e=>setTransferForm(p=>({...p, description: e.target.value}))}
                placeholder="Reason for transfer…" className={INPUT}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── Record / Edit Other Income ──────────────────────────────────── */}
      <Modal open={mode === 'addIncome' || mode === 'editIncome'} onClose={close}
        title={mode === 'editIncome' ? 'Edit Income Entry' : 'Record Other Income'} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveIncome} disabled={!incomeForm.name.trim() || !incomeForm.amount || saving}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editIncome' ? 'Save Changes' : 'Record Income'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Income Source">
              <input value={incomeForm.name} onChange={e=>setIncomeForm(p=>({...p, name: e.target.value}))}
                placeholder="e.g. Hall rental, Parking fees" className={INPUT} autoFocus/>
            </Field>
            <Field label="Amount ($)">
              <input type="number" step="0.01" min="0" value={incomeForm.amount}
                onChange={e=>setIncomeForm(p=>({...p, amount: e.target.value}))}
                placeholder="0.00" className={INPUT}/>
            </Field>
          </div>
          <Field label="Deposit To (account)">
            <Select value={incomeForm.account_id} onChange={v=>setIncomeForm(p=>({...p, account_id: v}))}
              placeholder="— Optional: pick account —" options={accountOptions}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Income Date">
              <DatePicker value={incomeForm.income_date} onChange={v=>setIncomeForm(p=>({...p, income_date: v}))}/>
            </Field>
            <Field label="Reference (optional)">
              <input value={incomeForm.reference} onChange={e=>setIncomeForm(p=>({...p, reference: e.target.value}))}
                placeholder="e.g. RCPT-104" className={INPUT}/>
            </Field>
          </div>
          <Field label="Description (optional)">
            <input value={incomeForm.description} onChange={e=>setIncomeForm(p=>({...p, description: e.target.value}))}
              placeholder="Details…" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'deleteAccount' || mode === 'deleteTransfer' || mode === 'deleteIncome'} onClose={close} title="Delete Record" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={mode === 'deleteAccount' ? doDeleteAccount : mode === 'deleteTransfer' ? doDeleteTransfer : doDeleteIncome} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selectedAccount?.name ?? selectedTransfer?.reference ?? selectedIncome?.name ?? 'this record'}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">This will remove it from the active ledger view.</p>
        </div>
      </Modal>

    </div>
  )
}
