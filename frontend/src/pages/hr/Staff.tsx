import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, RefreshCw, Power, KeyRound, Trash2, Users, Building2, Tag } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useToast } from '@/contexts/ToastContext'
import { useLoadMore } from '@hooks/useLoadMore'

interface Staff {
  id: string; first_name: string; last_name: string; email: string
  phone?: string; role: string; employment_type: string
  base_salary?: number; basic_salary?: number; joined_date?: string; joined_at?: string; is_active: boolean
  department_name?: string
}
interface Department { id: string; name: string; staff_count?: string | number }
interface StaffForm {
  first_name: string; last_name: string; email: string; phone: string
  role: string; employment_type: string; base_salary: string
  joined_date: string; department_id: string
}

const TYPE_BADGE: Record<string,string> = {
  full_time: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  part_time: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  contract:  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
}

const ROLES = ['receptionist','housekeeper','waiter','chef','cashier','accountant','security','manager','maintenance','other']
const EMP_TYPES = ['full_time','part_time','contract']

const EMPTY: StaffForm = {
  first_name:'', last_name:'', email:'', phone:'', role:'waiter',
  employment_type:'full_time', base_salary:'', joined_date: new Date().toISOString().slice(0,10), department_id:''
}

export default function Staff() {
  const { showToast } = useToast()
  const [tab,     setTab]     = useState<'staff' | 'states' | 'departments'>('staff')
  // Staff State tab defaults to showing who's inactive — that's the group
  // that needs attention; All/Active are still switchable from the filter.
  const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('inactive')
  const { items: staff, loading: staffLoading, loadingMore: staffLoadingMore, hasMore: staffHasMore,
          loadMore: loadMoreStaff, reload: reloadStaff, error: staffLoadError } =
    useLoadMore<Staff>('/hr/staff', { pageSize: 50 })
  const [depts,   setDepts]   = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [mode,    setMode]    = useState<null | 'add' | 'edit' | 'pin' | 'delete' | 'deptAdd' | 'deptEdit' | 'deptDelete' | 'setState'>(null)
  const [selected,setSelected]= useState<Staff | null>(null)
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [deptName, setDeptName] = useState('')
  const [form,    setForm]    = useState<StaffForm>(EMPTY)
  const [pin,     setPin]     = useState('')
  const [stateStaffId, setStateStaffId] = useState('')
  const [stateValue, setStateValue] = useState<'active' | 'inactive'>('inactive')
  const f = (k: keyof StaffForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Staff (the tab most likely to grow large) loads 50 at a time via
  // useLoadMore. Departments load together as before.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/hr/departments')
      setDepts(data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadAll = useCallback(() => { reloadStaff(); load() }, [reloadStaff, load])

  const openAdd = () => {
    setForm({ ...EMPTY, department_id: depts[0]?.id ?? '' })
    setSelected(null); setMode('add'); setError('')
  }
  const openEdit = (s: Staff) => {
    setForm({
      first_name: s.first_name, last_name: s.last_name, email: s.email,
      phone: s.phone ?? '', role: s.role, employment_type: s.employment_type,
      base_salary: String(s.basic_salary ?? s.base_salary ?? 0), joined_date: (s.joined_at ?? s.joined_date)?.slice(0,10) ?? '',
      department_id: depts.find(d=>d.name===s.department_name)?.id ?? '',
    })
    setSelected(s); setMode('edit'); setError('')
  }
  const close = () => {
    setMode(null); setSelected(null); setSelectedDept(null); setDeptName('')
    setError(''); setPin(''); setStateStaffId(''); setStateValue('inactive')
  }

  // ── Staff State (select a staff member, then set Active/Inactive) ────────────

  const openSetState = () => { setStateStaffId(''); setStateValue('inactive'); setMode('setState'); setError('') }

  // Picking a staff member prefills their current status, so you see where
  // they stand before choosing the new state.
  const handleStateStaffChange = (id: string) => {
    setStateStaffId(id)
    setStateValue(staff.find(s => s.id === id)?.is_active ? 'active' : 'inactive')
  }

  const saveStaffState = async () => {
    if (!stateStaffId) { setError('Select a staff member'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/hr/staff/${stateStaffId}/${stateValue === 'active' ? 'activate' : 'deactivate'}`)
      showToast('Staff state updated', 'success')
      close(); loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // ── Departments ─────────────────────────────────────────────────────────────

  const openDeptAdd    = () => { setDeptName(''); setSelectedDept(null); setMode('deptAdd'); setError('') }
  const openDeptEdit   = (d: Department) => { setSelectedDept(d); setDeptName(d.name); setMode('deptEdit'); setError('') }
  const openDeptDelete = (d: Department) => { setSelectedDept(d); setMode('deptDelete'); setError('') }

  const saveDept = async () => {
    if (!deptName.trim()) { setError('Department name is required'); return }
    setSaving(true); setError('')
    try {
      if (mode === 'deptEdit' && selectedDept) {
        await api.put(`/hr/departments/${selectedDept.id}`, { name: deptName.trim() })
        showToast('Department updated', 'success')
      } else {
        await api.post('/hr/departments', { name: deptName.trim() })
        showToast('Department created', 'success')
      }
      close(); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const doDeleteDept = async () => {
    if (!selectedDept) return
    setSaving(true)
    try {
      await api.delete(`/hr/departments/${selectedDept.id}`)
      close(); showToast('Department deleted', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); showToast(msg, 'error'); setError(msg) }
    finally { setSaving(false) }
  }

  const openPin = (s: Staff) => { setSelected(s); setPin(''); setMode('pin'); setError('') }

  const savePin = async () => {
    if (!selected || !/^\d{4,6}$/.test(pin)) { setError('PIN must be 4–6 digits'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/hr/staff/${selected.id}/pin`, { pin })
      close()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('First and last name are required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        first_name:       form.first_name.trim(),
        last_name:        form.last_name.trim(),
        email:            form.email || undefined,
        phone:            form.phone || undefined,
        role:             form.role,
        employment_type:  form.employment_type,
        basic_salary:     parseFloat(form.base_salary) || 0,
        joined_at:        form.joined_date || undefined,
        department_id:    form.department_id || undefined,
      }
      if (mode === 'add') await api.post('/hr/staff', payload)
      else if (selected)  await api.put(`/hr/staff/${selected.id}`, payload)
      close(); showToast(mode === 'add' ? 'Staff member added' : 'Staff member updated', 'success'); loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // Select a staff member, then set them Active or Inactive — same toggle
  // whether it's clicked from the Staff tab's row actions or the dedicated
  // Staff State tab (mirrors User Management's activate/suspend action).
  const toggleActive = async (s: Staff) => {
    setSaving(true); setError('')
    try {
      await api.patch(`/hr/staff/${s.id}/${s.is_active ? 'deactivate' : 'activate'}`)
      showToast(s.is_active ? 'Staff member deactivated' : 'Staff member activated', 'success')
      loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const openDelete = (s: Staff) => { setSelected(s); setMode('delete'); setError('') }
  const doDelete = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.delete(`/hr/staff/${selected.id}`)
      close(); showToast('Staff member deleted', 'success'); loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); showToast(msg, 'error'); setError(msg) }
    finally { setSaving(false) }
  }

  const activeCount = staff.filter(s => s.is_active).length
  const filteredStaff = activeFilter === 'active' ? staff.filter(s => s.is_active)
    : activeFilter === 'inactive' ? staff.filter(s => !s.is_active)
    : staff

  const COLS: DTColumn<Staff>[] = [
    { key:'first_name', label:'Name', render:r=>(
      <div>
        <p className={`font-semibold whitespace-nowrap ${r.is_active?'text-neutral-800 dark:text-neutral-200':'text-neutral-400 dark:text-neutral-500 line-through'}`}>
          {r.first_name} {r.last_name}
        </p>
        <p className="text-[11px] text-neutral-400">{r.email}</p>
      </div>
    )},
    { key:'department_name', label:'Dept',       render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.department_name ?? '—'}</span> },
    { key:'role',            label:'Role',        render:r=><span className="capitalize text-neutral-600 dark:text-neutral-300">{r.role?.replace('_',' ')}</span> },
    { key:'employment_type', label:'Type',        render:r=><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize ${TYPE_BADGE[r.employment_type]??''}`}>{r.employment_type?.replace('_',' ')}</span> },
    { key:'base_salary',     label:'Salary',      render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.basic_salary ?? r.base_salary ?? 0).toFixed(0)}</span>, exportValue:r=>Number(r.basic_salary ?? r.base_salary ?? 0) },
    { key:'joined_date',     label:'Joined',      render:r=><span className="text-neutral-500 dark:text-neutral-400">{(r.joined_at ?? r.joined_date)?.slice(0,10)}</span> },
    { key:'is_active',       label:'Status',      render:r=>(
      r.is_active
        ? <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</span>
        : <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">Inactive</span>
    )},
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEdit(r)} className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-neutral-700 dark:text-neutral-300 transition-colors">
          <Pencil size={11}/>
        </button>
        <button onClick={()=>openPin(r)}
          title="Set POS PIN"
          className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 transition-colors">
          <KeyRound size={11}/>
        </button>
        <button onClick={()=>toggleActive(r)} disabled={saving}
          title={r.is_active ? 'Deactivate' : 'Activate'}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${r.is_active ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
          <Power size={11}/>
        </button>
        <button onClick={()=>openDelete(r)}
          title="Delete"
          className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={11}/>
        </button>
      </div>
    )},
  ]

  // Staff State tab: select a staff member, then Activate/Deactivate them —
  // same toggle as the Staff tab's Power button, just as the sole focused
  // action here (mirrors User Management's Activate/Suspend flow).
  const STATE_COLS: DTColumn<Staff>[] = [
    { key:'first_name', label:'Staff', render:r=>(
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${r.is_active ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-neutral-100 text-neutral-400 dark:bg-white/[0.06] dark:text-neutral-500'}`}>
          <Users size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.first_name} {r.last_name}</p>
          <p className="text-[11px] text-neutral-400">{r.email}</p>
        </div>
      </div>
    )},
    { key:'department_name', label:'Dept', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.department_name ?? '—'}</span> },
    { key:'role',            label:'Role', render:r=><span className="capitalize text-neutral-600 dark:text-neutral-300">{r.role?.replace('_',' ')}</span> },
    { key:'is_active',       label:'Status', render:r=>(
      r.is_active
        ? <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</span>
        : <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">Inactive</span>
    )},
    { key:'_act', label:'', sortable:false, render:r=>(
      <button onClick={()=>toggleActive(r)} disabled={saving}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap ${r.is_active ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
        <Power size={12}/> {r.is_active ? 'Deactivate' : 'Activate'}
      </button>
    )},
  ]

  const DEPT_COLS: DTColumn<Department>[] = [
    { key:'name', label:'Department', render:d=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
          <Building2 size={15}/>
        </div>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{d.name}</span>
      </div>
    )},
    { key:'staff_count', label:'Active Staff', render:d=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        Number(d.staff_count) > 0
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}>{Number(d.staff_count ?? 0)} staff</span>
    ), exportValue:d=>Number(d.staff_count ?? 0) },
    { key:'_act', label:'', sortable:false, render:d=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openDeptEdit(d)} title="Edit"
          className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-neutral-700 dark:text-neutral-300 transition-colors">
          <Pencil size={11}/>
        </button>
        <button onClick={()=>openDeptDelete(d)} title="Delete"
          className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={11}/>
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Staff</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {activeCount} active · {staff.length} total · {depts.length} department{depts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={(loading || staffLoading) ? 'animate-spin' : ''}/>
          </button>
          {tab === 'staff' && (
            <button onClick={openAdd}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
              <Plus size={15}/> Add Staff
            </button>
          )}
          {tab === 'states' && (
            <button onClick={openSetState}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
              <Tag size={15}/> Staff State
            </button>
          )}
          {tab === 'departments' && (
            <button onClick={openDeptAdd}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
              <Plus size={15}/> Add Department
            </button>
          )}
        </div>
      </div>

      {(error || staffLoadError) && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error || staffLoadError}</p>}

      <Tabs
        active={tab}
        onChange={k => setTab(k as typeof tab)}
        tabs={[
          { key: 'staff',       label: 'Staff',       icon: <Users size={14}/>,     count: staff.length },
          { key: 'states',      label: 'Staff State', icon: <Tag size={14}/>,       count: activeCount },
          { key: 'departments', label: 'Departments', icon: <Building2 size={14}/>, count: depts.length },
        ]}
      />

      {tab === 'staff' && (
        <DataTable columns={COLS} data={staff} title="Staff" filename="staff"
          rowKey={r=>r.id} searchPlaceholder="Search name, role, dept…" loading={staffLoading}
          onLoadMore={loadMoreStaff} hasMore={staffHasMore} loadingMore={staffLoadingMore}/>
      )}
      {tab === 'states' && (
        <DataTable columns={STATE_COLS} data={filteredStaff} title="Staff State" filename="staff-state"
          rowKey={r=>r.id} searchPlaceholder="Search staff…" loading={staffLoading}
          actions={
            <select value={activeFilter} onChange={e=>setActiveFilter(e.target.value as typeof activeFilter)}
              className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-[12.5px] font-medium text-neutral-600 focus:border-rose-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          }/>
      )}
      {tab === 'departments' && (
        <DataTable columns={DEPT_COLS} data={depts} title="Departments" filename="departments"
          rowKey={d=>d.id} searchPlaceholder="Search department…" loading={loading}/>
      )}

      {/* Add/Edit */}
      <Modal open={mode==='add'||mode==='edit'} onClose={close}
        title={mode==='add'?'Add Staff Member':`Edit: ${selected?.first_name} ${selected?.last_name}`} size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode==='add'?'Add Staff':'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name">
              <input value={form.first_name} onChange={e=>f('first_name',e.target.value)} placeholder="First name" className={INPUT} autoFocus/>
            </Field>
            <Field label="Last Name">
              <input value={form.last_name} onChange={e=>f('last_name',e.target.value)} placeholder="Last name" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={form.email} onChange={e=>f('email',e.target.value)} placeholder="email@example.com" className={INPUT}/>
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="+252…" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <select value={form.department_id} onChange={e=>f('department_id',e.target.value)} className={INPUT}>
                <option value="">— None —</option>
                {depts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={e=>f('role',e.target.value)} className={INPUT}>
                {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Employment Type">
              <select value={form.employment_type} onChange={e=>f('employment_type',e.target.value)} className={INPUT}>
                {EMP_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
            <Field label="Base Salary ($)">
              <input type="number" min="0" value={form.base_salary} onChange={e=>f('base_salary',e.target.value)} placeholder="0" className={INPUT}/>
            </Field>
            <Field label="Join Date">
              <input type="date" value={form.joined_date} onChange={e=>f('joined_date',e.target.value)} className={INPUT}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* Set POS PIN */}
      <Modal open={mode==='pin'} onClose={close}
        title={`POS PIN — ${selected?.first_name ?? ''} ${selected?.last_name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={savePin} disabled={saving || !/^\d{4,6}$/.test(pin)}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <KeyRound size={13}/>} Save PIN
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="New PIN (4–6 digits)">
            <input type="password" inputMode="numeric" maxLength={6} value={pin}
              onChange={e=>setPin(e.target.value.replace(/\D/g,''))}
              placeholder="e.g. 1234" className={`${INPUT} text-center text-[20px] font-black tracking-[0.5em]`} autoFocus/>
          </Field>
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              The staff member uses this PIN to unlock the POS under their own name —
              every order they create is tracked to them.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={mode === 'delete'} onClose={close} onConfirm={doDelete} loading={saving}
        title="Delete Staff Member" confirmLabel="Delete"
        message={<>Permanently remove <b>{selected?.first_name} {selected?.last_name}</b>? This cannot be undone.</>}
      />

      {/* Add / Edit Department */}
      <Modal open={mode==='deptAdd'||mode==='deptEdit'} onClose={close}
        title={mode==='deptAdd' ? 'Add Department' : `Edit: ${selectedDept?.name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveDept} disabled={saving || !deptName.trim()}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode==='deptAdd' ? 'Add Department' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Department Name">
            <input value={deptName} onChange={e=>setDeptName(e.target.value)}
              onKeyDown={e=>{ if (e.key === 'Enter' && deptName.trim() && !saving) saveDept() }}
              placeholder="e.g. Kitchen, Front Desk, Housekeeping" className={INPUT} autoFocus/>
          </Field>
          <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10">
            <p className="text-[12px] text-rose-700 dark:text-rose-300">
              Staff members are assigned to a department when you add or edit them —
              the department then appears in their profile and payroll grouping.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={mode === 'deptDelete'} onClose={close} onConfirm={doDeleteDept} loading={saving}
        title="Delete Department" confirmLabel="Delete"
        message={<>Delete <b>{selectedDept?.name}</b>?
          {Number(selectedDept?.staff_count) > 0
            ? <> It still has <b>{Number(selectedDept?.staff_count)}</b> active staff member(s) — the server will block this until they are reassigned.</>
            : ' It has no active staff assigned.'}
        </>}
      />

      {/* Set Staff State: select a staff member, then their Active/Inactive state */}
      <Modal open={mode==='setState'} onClose={close} title="Staff State" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveStaffState} disabled={saving || !stateStaffId}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Save
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Select Staff">
            <Select value={stateStaffId} onChange={handleStateStaffChange}
              placeholder="— Select staff —" autoFocus
              options={staff.map(s => ({
                value: s.id,
                label: `${s.first_name} ${s.last_name} (${s.is_active ? 'Active' : 'Inactive'})`,
              }))}/>
          </Field>
          <Field label="State">
            <select value={stateValue} onChange={e=>setStateValue(e.target.value as 'active' | 'inactive')} className={INPUT} disabled={!stateStaffId}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
