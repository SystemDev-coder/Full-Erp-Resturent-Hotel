import { useState, useEffect, useCallback } from 'react'
import { ArrowUpRight, ArrowDownRight, Plus, RefreshCw } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface Transaction {
  id: string; transaction_date: string; description: string
  transaction_type: string; debit_amount: number; credit_amount: number
  account_name: string; reference?: string
}
interface Account { id: string; name: string; type: string }
interface TxnForm { description: string; account_id: string; debit_amount: string; credit_amount: string; transaction_date: string; reference: string }

const TYPE_LABEL: Record<string,string> = {
  payment_received:'Payment Received', payment_made:'Payment Made',
  room_charge:'Room Charge', restaurant_charge:'Restaurant Charge',
  salary:'Salary', expense:'Expense', income:'Income', refund:'Refund',
  transfer:'Transfer', journal:'Journal Entry',
}

export default function Transactions() {
  const [txns,     setTxns]     = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [mode,     setMode]     = useState<null | 'create'>(null)
  const [form,     setForm]     = useState<TxnForm>({
    description: '', account_id: '', debit_amount: '', credit_amount: '', transaction_date: new Date().toISOString().slice(0,10), reference: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, aRes] = await Promise.all([
        api.get('/accounting/transactions'),
        api.get('/accounting/accounts'),
      ])
      setTxns(tRes.data.data)
      setAccounts(aRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const totalIn  = txns.reduce((s,t) => s + Number(t.credit_amount || 0), 0)
  const totalOut = txns.reduce((s,t) => s + Number(t.debit_amount  || 0), 0)

  const close = () => { setMode(null); setError('') }
  const openCreate = () => {
    setForm({ description:'', account_id: accounts[0]?.id??'', debit_amount:'', credit_amount:'', transaction_date: new Date().toISOString().slice(0,10), reference:'' })
    setMode('create'); setError('')
  }

  const doCreate = async () => {
    if (!form.description || !form.account_id) { setError('Description and account are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/accounting/transactions', {
        description:      form.description,
        account_id:       form.account_id,
        debit_amount:     parseFloat(form.debit_amount)  || 0,
        credit_amount:    parseFloat(form.credit_amount) || 0,
        transaction_date: form.transaction_date,
        reference:        form.reference || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const COLS: DTColumn<Transaction>[] = [
    { key:'id',               label:'TXN #',      render:r=><span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">{r.id.slice(0,8).toUpperCase()}</span> },
    { key:'transaction_date', label:'Date',       render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.transaction_date?.slice(0,10)}</span> },
    { key:'description',      label:'Description',render:r=><span className="font-medium text-neutral-800 dark:text-neutral-200">{r.description}</span> },
    { key:'transaction_type', label:'Type',       render:r=><span className="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{TYPE_LABEL[r.transaction_type] ?? r.transaction_type}</span> },
    { key:'account_name',     label:'Account',    render:r=><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 whitespace-nowrap">{r.account_name ?? '—'}</span> },
    { key:'credit_amount',    label:'In (+)',     render:r=>(
      Number(r.credit_amount)>0
        ? <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400"><ArrowUpRight size={12}/>+${Number(r.credit_amount).toFixed(2)}</span>
        : <span className="text-neutral-300 dark:text-neutral-600">—</span>
    ), exportValue:r=>r.credit_amount },
    { key:'debit_amount',     label:'Out (−)',    render:r=>(
      Number(r.debit_amount)>0
        ? <span className="flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400"><ArrowDownRight size={12}/>−${Number(r.debit_amount).toFixed(2)}</span>
        : <span className="text-neutral-300 dark:text-neutral-600">—</span>
    ), exportValue:r=>r.debit_amount },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Transactions</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{txns.length} entries</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-violet-300 hover:text-violet-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-700 transition-colors">
            <Plus size={15}/> Add Entry
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Total In</p>
          <p className="mt-1 text-[22px] font-extrabold text-emerald-700 dark:text-emerald-300">+${totalIn.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200/60 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">Total Out</p>
          <p className="mt-1 text-[22px] font-extrabold text-rose-700 dark:text-rose-300">−${totalOut.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c2333]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Net</p>
          <p className={`mt-1 text-[22px] font-extrabold ${totalIn-totalOut>=0?'text-emerald-700 dark:text-emerald-300':'text-rose-700 dark:text-rose-300'}`}>
            ${(totalIn-totalOut).toFixed(2)}
          </p>
        </div>
      </div>

      <DataTable columns={COLS} data={txns} title="Transactions" filename="transactions"
        rowKey={r=>r.id} searchPlaceholder="Search transactions…" loading={loading}/>

      <Modal open={mode === 'create'} onClose={close} title="Add Journal Entry" size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doCreate} disabled={saving || !form.description || !form.account_id}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Save Entry
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Description">
            <input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}
              placeholder="Transaction description" className={INPUT} autoFocus/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account">
              <select value={form.account_id} onChange={e=>setForm(p=>({...p,account_id:e.target.value}))} className={INPUT}>
                <option value="">— Select account —</option>
                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={form.transaction_date}
                onChange={e=>setForm(p=>({...p,transaction_date:e.target.value}))} className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Debit (Out) $">
              <input type="number" min="0" step="0.01" value={form.debit_amount}
                onChange={e=>setForm(p=>({...p,debit_amount:e.target.value}))} placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Credit (In) $">
              <input type="number" min="0" step="0.01" value={form.credit_amount}
                onChange={e=>setForm(p=>({...p,credit_amount:e.target.value}))} placeholder="0.00" className={INPUT}/>
            </Field>
          </div>
          <Field label="Reference (optional)">
            <input value={form.reference} onChange={e=>setForm(p=>({...p,reference:e.target.value}))}
              placeholder="e.g. INV-0042, ORD-0091…" className={INPUT}/>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
