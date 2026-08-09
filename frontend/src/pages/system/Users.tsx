import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, UserX } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface User {
  id: string; email: string; full_name: string; role: string
  branch_name?: string; is_active: boolean; last_login_at?: string
}
interface Branch { id: string; name: string }

const ROLE_BADGE: Record<string,string> = {
  org_admin:         'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  branch_manager:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  receptionist:      'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  cashier:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  chef:              'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  accountant:        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  inventory_manager: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  report_viewer:     'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
}

const ROLES = Object.keys(ROLE_BADGE)

interface InviteForm { email: string; full_name: string; role: string; branch_id: string; password: string }
const EMPTY: InviteForm = { email:'', full_name:'', role:'receptionist', branch_id:'', password:'' }

export default function Users() {
  const [users,    setUsers]   = useState<User[]>([])
  const [branches, setBranches]= useState<Branch[]>([])
  const [loading,  setLoading] = useState(true)
  const [saving,   setSaving]  = useState(false)
  const [error,    setError]   = useState('')
  const [mode,     setMode]    = useState<null | 'invite' | 'deactivate'>(null)
  const [selected, setSelected]= useState<User | null>(null)
  const [form,     setForm]    = useState<InviteForm>(EMPTY)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, bRes] = await Promise.all([
        api.get('/users'),
        api.get('/branches'),
      ])
      setUsers(uRes.data.data)
      setBranches(bRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openInvite = () => { setForm({ ...EMPTY, branch_id: branches[0]?.id??'' }); setMode('invite'); setError('') }
  const openDeact  = (u: User) => { setSelected(u); setMode('deactivate'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError('') }

  const doInvite = async () => {
    if (!form.email.trim() || !form.full_name.trim() || !form.branch_id) { setError('Email, name, and branch are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/users/invite', {
        email:      form.email.trim(),
        full_name:  form.full_name.trim(),
        role:       form.role,
        branch_id:  form.branch_id,
        password:   form.password || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDeactivate = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.patch(`/users/${selected.id}/deactivate`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
  }

  const COLS: DTColumn<User>[] = [
    { key:'full_name',     label:'Name',        render:r=>(
      <div>
        <p className={`font-semibold ${r.is_active?'text-neutral-800 dark:text-neutral-200':'text-neutral-400 dark:text-neutral-500'}`}>{r.full_name}</p>
        <p className="text-[11px] text-neutral-400">{r.email}</p>
      </div>
    )},
    { key:'role',          label:'Role',        render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${ROLE_BADGE[r.role]??''}`}>{r.role?.replace(/_/g,' ')}</span> },
    { key:'branch_name',   label:'Branch',      render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.branch_name ?? '—'}</span> },
    { key:'last_login_at', label:'Last Login',  render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.last_login_at ? new Date(r.last_login_at).toLocaleDateString() : 'Never'}</span> },
    { key:'is_active',     label:'Status',      render:r=>(
      r.is_active
        ? <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</span>
        : <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">Inactive</span>
    )},
    { key:'_act', label:'', sortable:false, render:r=>(
      r.is_active
        ? <button onClick={()=>openDeact(r)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
            <UserX size={11}/> Deactivate
          </button>
        : null
    )},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Users</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {users.filter(u=>u.is_active).length} active · {users.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openInvite}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Plus size={15}/> Invite User
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <DataTable columns={COLS} data={users} title="Users" filename="users"
        rowKey={r=>r.id} searchPlaceholder="Search name, email, role…" loading={loading}/>

      {/* Invite Modal */}
      <Modal open={mode==='invite'} onClose={close} title="Invite User" size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doInvite} disabled={saving || !form.email || !form.full_name || !form.branch_id}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Send Invite
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Full Name">
            <input value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))}
              placeholder="Full name" className={INPUT} autoFocus/>
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
              placeholder="user@example.com" className={INPUT}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} className={INPUT}>
                {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select value={form.branch_id} onChange={e=>setForm(p=>({...p,branch_id:e.target.value}))} className={INPUT}>
                <option value="">— Select branch —</option>
                {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Initial Password">
            <input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}
              placeholder="Min 8 characters" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* Deactivate Modal */}
      <Modal open={mode==='deactivate'} onClose={close} title="Deactivate User" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDeactivate} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Deactivate
          </button>
        </>}>
        <div className="text-center py-2">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Deactivate {selected?.full_name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">{selected?.email} will lose access immediately.</p>
        </div>
      </Modal>
    </div>
  )
}
