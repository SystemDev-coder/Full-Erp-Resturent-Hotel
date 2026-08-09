import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Plus, RefreshCw, Users as UsersIcon, ToggleLeft, Lock, ScrollText,
  ShieldOff, ShieldCheck, Unlock, Mail, Phone, Calendar, Clock, Pencil, Trash2,
  Eye, KeyRound, ImagePlus, X, ShieldQuestion, Grid, ShieldAlert, LogOut,
  BedDouble, UtensilsCrossed, Boxes, Landmark, UserSquare2, Save,
  ShieldAlert as ShieldWarn, UserCheck, AlertTriangle, Check, LayoutDashboard,
  ChevronDown,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { ImageThumb } from '@/components/ui/ImageThumb'
import ImageModal from '@/components/ui/ImageModal'
import { ROLE_LABELS } from '@/types/auth'
import type { ERPRole } from '@/types/auth'
import { MODULE_PERMISSIONS, ALL_ROLES } from '@/config/rolePermissions'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@hooks/useAuth'
import { useLoadMore } from '@hooks/useLoadMore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string; email: string; full_name: string; phone?: string; avatar_url?: string
  is_active: boolean; is_locked: boolean; last_login_at?: string
  failed_attempts: number; locked_until?: string; created_at: string
  branches: { branch_id: string; role: ERPRole; branch_name: string }[]
}

interface AuditLog {
  id: string; action: string; table_name: string; record_id: string
  user_name: string; user_email: string; branch_name: string
  ip_address: string; created_at: string
}

interface Branch { id: string; name: string }
interface RoleRow { role: ERPRole }

const ACTION_BADGE: Record<string, string> = {
  INSERT:              'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  UPDATE:               'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  DELETE:               'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  LOGIN_SUCCESS:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  LOGIN_FAILED:         'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  USER_CREATED:         'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  USER_UPDATED:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  USER_DELETED:         'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  USER_LOCKED:          'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  USER_UNLOCKED:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  USER_ACTIVATED:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  USER_DEACTIVATED:     'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  USER_SESSIONS_REVOKED:'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  USER_PASSWORD_RESET:  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  USER_PERMISSIONS_UPDATED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  PRINT_KOT:            'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  PRINT_RECEIPT:        'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  PRINT_REPORT:         'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
}

const SECURITY_ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'USER_LOCKED', 'USER_UNLOCKED', 'USER_SESSIONS_REVOKED', 'USER_PASSWORD_RESET', 'USER_PERMISSIONS_UPDATED']

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

interface InviteForm { full_name: string; email: string; phone: string; branch_id: string; role: string; password: string }
const EMPTY_INVITE: InviteForm = { full_name: '', email: '', phone: '', branch_id: '', role: 'receptionist', password: '' }

interface EditForm { full_name: string; phone: string; branch_id: string; role: string; is_active: boolean; new_password: string }

// Per-user module permission editor (Permissions tab)
interface PermFlags { view: boolean; edit: boolean; delete: boolean }
interface PermModuleDef { key: string; label: string; desc: string; icon: React.ReactNode; readOnly?: boolean }
const PERM_MODULE_DEFS: PermModuleDef[] = [
  { key: 'dashboard',  label: 'Dashboard',  desc: 'KPIs, revenue charts, notifications',         icon: <LayoutDashboard size={16}/>, readOnly: true },
  { key: 'hotel',      label: 'Hotel',      desc: 'Bookings, rooms, guests, housekeeping',       icon: <BedDouble size={16}/> },
  { key: 'restaurant', label: 'Restaurant', desc: 'POS, orders & tables, menu',                  icon: <UtensilsCrossed size={16}/> },
  { key: 'inventory',  label: 'Inventory',  desc: 'Items, stock, suppliers, purchase orders',    icon: <Boxes size={16}/> },
  { key: 'finance',    label: 'Finance',    desc: 'Accounts, receipts, expenses, salary',        icon: <Landmark size={16}/> },
  { key: 'hr',         label: 'HR',         desc: 'Staff and departments',                       icon: <UserSquare2 size={16}/> },
]
const DEFAULT_PERMS = (): Record<string, PermFlags> =>
  Object.fromEntries(PERM_MODULE_DEFS.map(m => [m.key, { view: true, edit: true, delete: true }]))

// Sub-pages within a module — clicking a module card expands these below it.
// Mirrors the nav structure in components/Layout.tsx and the SUBMODULES map
// on the server (userController.ts). Modules not listed here (dashboard, hr)
// have nothing to split — HR is just "Staff", dashboard has no sub-pages.
interface SubModuleDef { key: string; label: string }
const SUBMODULE_DEFS: Record<string, SubModuleDef[]> = {
  hotel: [
    { key: 'bookings',     label: 'Bookings' },
    { key: 'rooms',        label: 'Rooms' },
    { key: 'guests',       label: 'Guests' },
    { key: 'housekeeping', label: 'Housekeeping' },
  ],
  restaurant: [
    { key: 'pos',        label: 'POS' },
    { key: 'operations', label: 'Orders & Tables' },
    { key: 'menu',       label: 'Menu' },
  ],
  inventory: [
    { key: 'items',      label: 'Items' },
    { key: 'warehouses', label: 'Warehouses' },
    { key: 'suppliers',  label: 'Suppliers' },
    { key: 'orders',     label: 'Purchase Orders' },
  ],
  finance: [
    { key: 'accounts', label: 'Accounts' },
    { key: 'receipts', label: 'Receipts' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'salary',   label: 'Salary' },
  ],
}
const DEFAULT_SUB_PERMS = (): Record<string, Record<string, PermFlags>> =>
  Object.fromEntries(Object.entries(SUBMODULE_DEFS).map(([mod, subs]) =>
    [mod, Object.fromEntries(subs.map(s => [s.key, { view: true, edit: true, delete: true }]))]
  ))

// Taskora-style green checkbox
function PermCheckbox({ checked, disabled, onToggle }: { checked: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      className={`mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-md border-2 transition-all ${
        checked
          ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
          : 'border-neutral-300 bg-white hover:border-emerald-400 dark:border-white/[0.15] dark:bg-white/[0.04]'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
      {checked && <Check size={14} strokeWidth={3.5}/>}
    </button>
  )
}

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

type ConfirmType = 'delete' | 'lock' | 'unlock' | 'activate' | 'deactivate'
const CONFIRM_COPY: Record<ConfirmType, { title: string; confirmLabel: string; danger: boolean; verb: string }> = {
  delete:     { title: 'Delete User',     confirmLabel: 'Delete',     danger: true,  verb: 'Permanently remove' },
  lock:       { title: 'Lock User',       confirmLabel: 'Lock',       danger: true,  verb: 'Lock' },
  unlock:     { title: 'Unlock User',     confirmLabel: 'Unlock',     danger: false, verb: 'Unlock' },
  activate:   { title: 'Activate User',   confirmLabel: 'Activate',   danger: false, verb: 'Activate' },
  deactivate: { title: 'Deactivate User', confirmLabel: 'Deactivate', danger: true,  verb: 'Deactivate' },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { showToast } = useToast()
  const { user: me, refreshUser } = useAuth()
  const [tab, setTab] = useState<'users' | 'status' | 'locks' | 'roles' | 'permissions' | 'security' | 'logs'>('users')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [users,    setUsers]    = useState<UserRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const { items: logs, loading: logsLoading, loadingMore: logsLoadingMore, hasMore: logsHasMore,
          loadMore: loadMoreLogs, reload: reloadLogs, error: logsLoadError } =
    useLoadMore<AuditLog>('/system/audit', { pageSize: 50 })

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode,       setMode]       = useState<null | 'invite' | 'edit' | 'view' | 'deactivatePicker' | 'lockPicker'>(null)
  const [pickerUserId, setPickerUserId] = useState('')
  const [activeUser, setActiveUser] = useState<UserRow | null>(null)
  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE)
  const [editForm,   setEditForm]   = useState<EditForm>({ full_name: '', phone: '', branch_id: '', role: 'receptionist', is_active: true, new_password: '' })
  const [tempPw,     setTempPw]     = useState('')
  const [confirmAction, setConfirmAction] = useState<{ type: ConfirmType; user: UserRow } | null>(null)

  // Permissions tab — pick a user, edit their module-by-module access
  const [permUser,    setPermUser]    = useState<UserRow | null>(null)
  const [perms,       setPerms]       = useState<Record<string, PermFlags>>(DEFAULT_PERMS())
  const [permsLoading, setPermsLoading] = useState(false)
  const [permsSaving,  setPermsSaving]  = useState(false)
  const [permsDirty,   setPermsDirty]   = useState(false)
  // Sub-page permissions — expand a module row to reveal per-page cards
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [subPerms,       setSubPerms]       = useState<Record<string, Record<string, PermFlags>>>(DEFAULT_SUB_PERMS())

  // Avatar upload (Add/Edit)
  const [imgFile,    setImgFile]    = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState('')
  const [viewImage,  setViewImage]  = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Security tab — force-logout-everywhere
  const [revokeUserId, setRevokeUserId] = useState('')
  const [revokeBusy,   setRevokeBusy]   = useState(false)

  // Activity Logs (the tab most likely to grow very large) loads 50 at a
  // time via useLoadMore. Users/branches load together as before.
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

  const loadAll = useCallback(() => { reloadLogs(); load() }, [reloadLogs, load])

  const close = () => { setMode(null); setError(''); setTempPw(''); setActiveUser(null); setPickerUserId(''); clearImage() }
  const clearImage = () => { setImgFile(null); setImgPreview('') }

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Unsupported image format — please use JPG, PNG, or WebP.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('Image is too large — please use a file under 15MB.'); return }
    setError('')
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const uploadAvatarIfNeeded = async (): Promise<string | undefined> => {
    if (!imgFile) return undefined
    const fd = new FormData()
    fd.append('file', imgFile)
    const up = await api.post('/uploads/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    return up.data.url
  }

  const invite = async () => {
    if (!inviteForm.full_name.trim() || !inviteForm.email.trim() || !inviteForm.branch_id || !inviteForm.role) {
      setError('Name, email, branch, and role are required'); return
    }
    setSaving(true); setError('')
    try {
      const avatar_url = await uploadAvatarIfNeeded()
      const r = await api.post('/users/invite', {
        full_name: inviteForm.full_name.trim(),
        email:     inviteForm.email.trim(),
        phone:     inviteForm.phone || undefined,
        branch_id: inviteForm.branch_id,
        role:      inviteForm.role,
        password:  inviteForm.password || undefined,
        avatar_url,
      })
      if (r.data.data?.temp_password) { setTempPw(r.data.data.temp_password) }
      else { close(); showToast('User created', 'success') }
      load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const openInvite = () => {
    setInviteForm({ ...EMPTY_INVITE, branch_id: branches[0]?.id ?? '' })
    clearImage(); setMode('invite'); setError(''); setTempPw('')
  }

  const openEdit = (u: UserRow) => {
    setActiveUser(u)
    const primary = u.branches?.[0]
    setEditForm({
      full_name: u.full_name ?? '', phone: u.phone ?? '',
      branch_id: primary?.branch_id ?? branches[0]?.id ?? '',
      role: primary?.role ?? 'receptionist', is_active: u.is_active,
      new_password: '',
    })
    setImgFile(null); setImgPreview(u.avatar_url ?? '')
    setMode('edit'); setError('')
  }

  const saveEdit = async () => {
    if (!activeUser) return
    if (!editForm.full_name.trim()) { setError('Full name is required'); return }
    if (editForm.new_password && editForm.new_password.length < 6) {
      setError('New password must be at least 6 characters'); return
    }
    setSaving(true); setError('')
    try {
      const avatar_url = await uploadAvatarIfNeeded()
      await api.put(`/users/${activeUser.id}`, {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone || undefined,
        branch_id: editForm.branch_id || undefined,
        role: editForm.role || undefined,
        avatar_url,
      })
      if (editForm.is_active !== activeUser.is_active) {
        await api.patch(`/users/${activeUser.id}/${editForm.is_active ? 'activate' : 'deactivate'}`)
      }
      if (editForm.new_password) {
        await api.patch(`/users/${activeUser.id}/password`, { password: editForm.new_password })
      }
      close()
      showToast(editForm.new_password ? 'User updated — new password is active' : 'User updated', 'success')
      load()
      // Editing your own account? Refresh the session profile so the navbar
      // avatar/name updates immediately without a page reload.
      if (activeUser.id === me?.id) refreshUser()
    } catch (e) {
      const msg = getApiErrorMessage(e)
      setError(msg); showToast(msg, 'error')
    } finally { setSaving(false) }
  }

  // ── Permissions tab handlers ─────────────────────────────────────────────────

  const selectPermUser = async (userId: string) => {
    const u = users.find(x => x.id === userId)
    if (!u) { setPermUser(null); return }
    setPermUser(u); setPermsDirty(false); setPermsLoading(true); setExpandedModule(null)
    try {
      const [r, subR] = await Promise.all([
        api.get(`/users/${u.id}/permissions`),
        api.get(`/users/${u.id}/submodule-permissions`),
      ])
      setPerms({ ...DEFAULT_PERMS(), ...r.data.data })
      setSubPerms({ ...DEFAULT_SUB_PERMS(), ...subR.data.data })
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
    finally { setPermsLoading(false) }
  }

  const togglePermFlag = (moduleKey: string, flag: keyof PermFlags) => {
    setPerms(p => {
      const cur = p[moduleKey] ?? { view: true, edit: true, delete: true }
      const next = { ...cur, [flag]: !cur[flag] }
      // Removing View blocks the module entirely — edit/delete can't survive it
      if (flag === 'view' && !next.view) { next.edit = false; next.delete = false }
      // Granting edit/delete implies the user can see the module
      if ((flag === 'edit' || flag === 'delete') && next[flag]) next.view = true
      return { ...p, [moduleKey]: next }
    })
    setPermsDirty(true)
  }

  const toggleSubPermFlag = (moduleKey: string, subKey: string, flag: keyof PermFlags) => {
    setSubPerms(p => {
      const mod = p[moduleKey] ?? {}
      const cur = mod[subKey] ?? { view: true, edit: true, delete: true }
      const next = { ...cur, [flag]: !cur[flag] }
      if (flag === 'view' && !next.view) { next.edit = false; next.delete = false }
      if ((flag === 'edit' || flag === 'delete') && next[flag]) next.view = true
      return { ...p, [moduleKey]: { ...mod, [subKey]: next } }
    })
    setPermsDirty(true)
  }

  const savePerms = async () => {
    if (!permUser) return
    setPermsSaving(true)
    try {
      await Promise.all([
        api.put(`/users/${permUser.id}/permissions`, { permissions: perms }),
        api.put(`/users/${permUser.id}/submodule-permissions`, { permissions: subPerms }),
      ])
      setPermsDirty(false)
      showToast(`Permissions saved for ${permUser.full_name}`, 'success')
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
    finally { setPermsSaving(false) }
  }

  const openView = (u: UserRow) => { setActiveUser(u); setMode('view') }

  const doConfirm = async () => {
    if (!confirmAction) return
    const { type, user } = confirmAction
    setSaving(true)
    try {
      if (type === 'delete')          await api.delete(`/users/${user.id}`)
      else if (type === 'lock')        await api.patch(`/users/${user.id}/lock`)
      else if (type === 'unlock')      await api.patch(`/users/${user.id}/unlock`)
      else if (type === 'activate')    await api.patch(`/users/${user.id}/activate`)
      else if (type === 'deactivate')  await api.patch(`/users/${user.id}/deactivate`)
      showToast(`User ${type === 'delete' ? 'deleted' : type + 'd'}`, 'success')
      setConfirmAction(null); load()
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
    finally { setSaving(false) }
  }

  const openDeactivatePicker = () => { setPickerUserId(''); setMode('deactivatePicker'); setError('') }
  const openLockPicker       = () => { setPickerUserId(''); setMode('lockPicker'); setError('') }

  const doPickerAction = async () => {
    if (!pickerUserId) return
    setSaving(true)
    try {
      if (mode === 'deactivatePicker') {
        await api.patch(`/users/${pickerUserId}/deactivate`)
        showToast('User deactivated', 'success')
      } else if (mode === 'lockPicker') {
        await api.patch(`/users/${pickerUserId}/lock`)
        showToast('User locked', 'success')
      }
      close(); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const doRevoke = async () => {
    if (!revokeUserId) return
    setRevokeBusy(true)
    try {
      const r = await api.post(`/users/${revokeUserId}/revoke-sessions`)
      showToast(`Signed out of ${r.data.data.sessions_revoked} active session(s)`, 'success')
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
    finally { setRevokeBusy(false) }
  }

  const isLocked = (u: UserRow) => u.is_locked || (!!u.locked_until && new Date(u.locked_until) > new Date())
  const needsAttention = (u: UserRow) => isLocked(u) || u.failed_attempts > 0

  // ── Shared cells ─────────────────────────────────────────────────────────────

  const initialsAvatar = (u: UserRow) => (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-extrabold text-white">
      {(u.full_name ?? u.email).slice(0,2).toUpperCase()}
    </div>
  )

  const userCell = (u: UserRow) => (
    <div className="flex items-center gap-3">
      {u.avatar_url
        ? <ImageThumb src={u.avatar_url} alt={u.full_name} className="h-9 w-9 rounded-full"
            onClick={()=>setViewImage(u.avatar_url!)} fallback={initialsAvatar(u)}/>
        : initialsAvatar(u)}
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{u.full_name}</p>
        <p className="text-[11px] text-neutral-400">{u.email}</p>
      </div>
    </div>
  )

  const statusBadge = (u: UserRow) => (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
      u.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
    }`}>{u.is_active ? 'Active' : 'Inactive'}</span>
  )

  const lockBadge = (u: UserRow) => (
    isLocked(u)
      ? <span className="flex w-fit items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"><Lock size={10}/> Locked</span>
      : <span className="flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"><Unlock size={10}/> Unlocked</span>
  )

  // ── Data slices ──────────────────────────────────────────────────────────────

  const activeUsers   = users.filter(u => u.is_active)
  const inactiveUsers = users.filter(u => !u.is_active)
  // "User Locks" tab shows strictly locked accounts (manual or auto-lock).
  // atRiskUsers additionally includes accounts with pending failed attempts
  // that aren't locked yet — used only for the header/security "needs attention" signal.
  const lockedUsers   = users.filter(isLocked)
  const atRiskUsers   = users.filter(needsAttention)
  const unlockedActiveUsers = users.filter(u => !isLocked(u))
  const usersForTab   = statusFilter === 'active' ? activeUsers : statusFilter === 'inactive' ? inactiveUsers : users

  // ── Columns ──────────────────────────────────────────────────────────────────

  const USER_COLS: DTColumn<UserRow>[] = [
    { key:'avatar_url', label:'Photo', sortable:false, render:u=>(
      u.avatar_url
        ? <ImageThumb src={u.avatar_url} alt={u.full_name} className="h-9 w-9 rounded-full" onClick={()=>setViewImage(u.avatar_url!)} fallback={initialsAvatar(u)}/>
        : initialsAvatar(u)
    )},
    { key:'full_name', label:'Full Name', render:u=><span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{u.full_name}</span> },
    { key:'email', label:'Username', render:u=><span className="text-[12.5px] text-neutral-500 dark:text-neutral-400">{u.email}</span> },
    { key:'branches', label:'Role', sortable:false, render:u=>(
      <div className="flex flex-wrap gap-1">
        {(u.branches ?? []).filter(b=>b.branch_id).map((b, i) => (
          <span key={i} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10.5px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            {ROLE_LABELS[b.role] ?? b.role}
          </span>
        ))}
      </div>
    )},
    { key:'phone', label:'Phone', render:u=><span className="text-neutral-500 dark:text-neutral-400">{u.phone ?? '—'}</span> },
    { key:'is_active', label:'Status', render:statusBadge },
    { key:'is_locked', label:'Lock Status', render:lockBadge },
    { key:'created_at', label:'Created', render:u=><span className="text-[12px] text-neutral-400">{u.created_at?.slice(0,10)}</span> },
    { key:'_actions', label:'Actions', sortable:false, headerClassName:'text-right', className:'text-right', render:u=>{
      const isSelf = u.id === me?.id
      return (
        <div className="flex items-center justify-end gap-1.5">
          <button title="View" onClick={()=>openView(u)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 transition-colors"><Eye size={13}/></button>
          <button title="Edit" onClick={()=>openEdit(u)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 transition-colors"><Pencil size={13}/></button>
          {!isSelf && (u.is_active
            ? <button title="Deactivate" onClick={()=>setConfirmAction({type:'deactivate',user:u})} className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 transition-colors"><ShieldOff size={13}/></button>
            : <button title="Activate" onClick={()=>setConfirmAction({type:'activate',user:u})} className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 transition-colors"><ShieldCheck size={13}/></button>)}
          {!isSelf && (isLocked(u)
            ? <button title="Unlock" onClick={()=>setConfirmAction({type:'unlock',user:u})} className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 transition-colors"><KeyRound size={13}/></button>
            : <button title="Lock" onClick={()=>setConfirmAction({type:'lock',user:u})} className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 transition-colors"><Lock size={13}/></button>)}
          {!isSelf && (
            <button title="Delete" onClick={()=>setConfirmAction({type:'delete',user:u})} className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><Trash2 size={13}/></button>
          )}
        </div>
      )
    }},
  ]

  const STATUS_COLS: DTColumn<UserRow>[] = [
    { key:'full_name', label:'User', exportValue:u=>u.full_name, render:userCell },
    { key:'is_active', label:'Current State', render:()=>(
      <span className="flex w-fit items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
        <ShieldOff size={11}/> Deactivated
      </span>
    )},
    { key:'created_at', label:'Member Since', render:u=><span className="text-[12px] text-neutral-400">{u.created_at?.slice(0,10)}</span> },
    { key:'last_login_at', label:'Last Login', render:u=>(
      <span className="text-[12px] text-neutral-400">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}</span>
    )},
  ]

  const LOCK_COLS: DTColumn<UserRow>[] = [
    { key:'full_name', label:'User', exportValue:u=>u.full_name, render:userCell },
    { key:'failed_attempts', label:'Failed Attempts', render:u=>(
      <span className={`font-bold ${u.failed_attempts > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}`}>{u.failed_attempts}</span>
    ), exportValue:u=>u.failed_attempts },
    { key:'lock_reason', label:'Lock Reason', sortable:false, render:u=>(
      u.is_locked
        ? <span className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">Locked by admin</span>
        : u.locked_until && new Date(u.locked_until) > new Date()
          ? <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">Auto-locked (too many failed attempts) until {new Date(u.locked_until).toLocaleString()}</span>
          : <span className="text-[12px] text-neutral-400">Failed attempts pending</span>
    )},
    { key:'is_locked', label:'Lock Status', render:lockBadge },
  ]

  const LOG_COLS: DTColumn<AuditLog>[] = [
    { key:'created_at', label:'Time', render:r=><span className="font-mono text-[11px] text-neutral-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</span> },
    { key:'action', label:'Action', render:r=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${ACTION_BADGE[r.action] ?? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'}`}>{r.action}</span>
    )},
    { key:'table_name', label:'Resource', render:r=><span className="capitalize text-neutral-600 dark:text-neutral-400">{r.table_name?.replace(/_/g,' ') ?? '—'}</span> },
    { key:'user_name', label:'Actor', render:r=>(
      <div>
        <p className="text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">{r.user_name ?? '—'}</p>
        <p className="text-[11px] text-neutral-400">{r.user_email}</p>
      </div>
    )},
    { key:'branch_name', label:'Branch', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.branch_name ?? '—'}</span> },
    { key:'ip_address', label:'IP', render:r=><span className="font-mono text-[11px] text-neutral-400">{r.ip_address ?? '—'}</span> },
  ]

  const assignmentCount = (role: ERPRole) => users.reduce((n, u) => n + (u.branches ?? []).filter(b => b.role === role).length, 0)
  const roleRows: RoleRow[] = useMemo(() => ALL_ROLES.map(role => ({ role })), [])

  const ROLE_COLS: DTColumn<RoleRow>[] = [
    { key:'role', label:'Role', render:r=><span className="font-bold text-neutral-800 dark:text-white">{ROLE_LABELS[r.role] ?? r.role}</span>, exportValue:r=>ROLE_LABELS[r.role] ?? r.role },
    { key:'count', label:'Assignments', render:r=><span className="font-semibold text-indigo-600 dark:text-indigo-400">{assignmentCount(r.role)}</span>, exportValue:r=>assignmentCount(r.role) },
    { key:'modules', label:'Accessible Modules', sortable:false, render:r=>(
      <div className="flex flex-wrap gap-1">
        {MODULE_PERMISSIONS.filter(m=>m.roles.includes(r.role)).map(m=>(
          <span key={m.key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{m.label}</span>
        ))}
      </div>
    )},
  ]

  const securityLogs = useMemo(() => logs.filter(l => SECURITY_ACTIONS.includes(l.action)), [logs])

  const last24h = (iso: string) => Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000
  const failed24  = useMemo(() => logs.filter(l => l.action === 'LOGIN_FAILED'  && last24h(l.created_at)).length, [logs])
  const success24 = useMemo(() => logs.filter(l => l.action === 'LOGIN_SUCCESS' && last24h(l.created_at)).length, [logs])


  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Settings</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {users.length} users · {activeUsers.length} active
            {atRiskUsers.length > 0 && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">{atRiskUsers.length} need attention</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={(loading || logsLoading) ? 'animate-spin' : ''}/>
          </button>
          {tab === 'users' && (
            <button onClick={openInvite}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
              <Plus size={15}/> Add New User
            </button>
          )}
          {tab === 'status' && (
            <button onClick={openDeactivatePicker} disabled={activeUsers.length === 0}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
              <ShieldOff size={15}/> Deactivate User
            </button>
          )}
          {tab === 'locks' && (
            <button onClick={openLockPicker} disabled={unlockedActiveUsers.length === 0}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40 transition-colors">
              <Lock size={15}/> Lock User
            </button>
          )}
        </div>
      </div>

      {(error || logsLoadError) && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error || logsLoadError}</p>}

      <Tabs
        active={tab}
        onChange={k => setTab(k as typeof tab)}
        tabs={[
          { key: 'users',       label: 'Users',         icon: <UsersIcon size={14}/>,      count: users.length },
          { key: 'status',      label: 'User Status',   icon: <ToggleLeft size={14}/>,     count: inactiveUsers.length },
          { key: 'locks',       label: 'User Locks',     icon: <Lock size={14}/>,           count: lockedUsers.length },
          { key: 'roles',       label: 'Roles',         icon: <ShieldQuestion size={14}/>, count: ALL_ROLES.length },
          { key: 'permissions', label: 'Permissions',   icon: <Grid size={14}/>,           count: MODULE_PERMISSIONS.length },
          { key: 'security',    label: 'Security',      icon: <ShieldAlert size={14}/>,    count: securityLogs.length },
          { key: 'logs',        label: 'Activity Logs', icon: <ScrollText size={14}/>,     count: logs.length },
        ]}
      />

      {tab === 'users' && (<>
        <div className="flex items-center gap-2">
          {(['all','active','inactive'] as const).map(f => (
            <button key={f} onClick={()=>setStatusFilter(f)}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                statusFilter===f ? 'bg-indigo-600 text-white' : 'bg-white border border-neutral-200/60 text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-[#1c2333] dark:text-neutral-300'
              }`}>
              {f === 'all' ? 'All Users' : f === 'active' ? 'Active Users' : 'Inactive Users'}
            </button>
          ))}
        </div>
        <DataTable columns={USER_COLS} data={usersForTab} title="Users" filename="users"
          rowKey={u=>u.id} searchPlaceholder="Search name, email…" loading={loading}/>
      </>)}
      {tab === 'status' && (
        <DataTable columns={STATUS_COLS} data={inactiveUsers} title="User Status" filename="user_status"
          rowKey={u=>u.id} searchPlaceholder="Search name, email…" loading={loading}
          rowActions={{ showActivate: true, showView: true, onActivate: u => setConfirmAction({type:'activate', user:u}), onView: openView }}/>
      )}
      {tab === 'locks' && (
        <DataTable columns={LOCK_COLS} data={lockedUsers} title="User Locks" filename="user_locks"
          rowKey={u=>u.id} searchPlaceholder="Search name, email…" loading={loading}
          rowActions={{ showUnlock: true, showView: true, onUnlock: u => setConfirmAction({type:'unlock', user:u}), onView: openView }}/>
      )}
      {tab === 'roles' && (<>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
          <p className="text-[12.5px] text-sky-700 dark:text-sky-300">Roles are fixed system roles (not freely creatable) — each one's module access is enforced in code, shown here for reference.</p>
        </div>
        <DataTable columns={ROLE_COLS} data={roleRows} title="Roles" filename="roles" rowKey={r=>r.role} searchPlaceholder="Search role…"/>
      </>)}
      {tab === 'permissions' && (
        <div className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          {/* Header: user dropdown + save */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 dark:border-white/[0.05]">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full max-w-[340px]">
                <Select value={permUser?.id ?? ''} onChange={selectPermUser}
                  placeholder="— Choose a user to manage —"
                  options={users.map(u => ({
                    value: u.id,
                    label: `${u.full_name} · ${ROLE_LABELS[(u.branches ?? [])[0]?.role] ?? u.email}`,
                  }))}/>
              </div>
              {permUser && (
                <div className="flex items-center gap-2.5">
                  {permUser.avatar_url
                    ? <ImageThumb src={permUser.avatar_url} alt={permUser.full_name} className="h-9 w-9 rounded-full"/>
                    : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-extrabold text-white">
                        {(permUser.full_name ?? permUser.email).slice(0,2).toUpperCase()}
                      </div>}
                  <div>
                    <p className="text-[13px] font-bold leading-tight text-neutral-900 dark:text-white">{permUser.full_name}</p>
                    <p className="text-[10.5px] text-neutral-400">{permUser.email}</p>
                  </div>
                </div>
              )}
            </div>
            <button onClick={savePerms} disabled={!permUser || !permsDirty || permsSaving || permUser?.id === me?.id}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {permsSaving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}
              Save Permissions
            </button>
          </div>

          {!permUser ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
                <ShieldQuestion size={26}/>
              </div>
              <p className="text-[14px] font-bold text-neutral-700 dark:text-neutral-200">Choose a user from the dropdown to manage their permissions</p>
              <p className="max-w-sm text-[12.5px] text-neutral-400">Control access module by module — View, Create/Edit, and Delete are each granted separately.</p>
            </div>
          ) : (
            <div className="p-5">
              {permUser.id === me?.id && (
                <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  You cannot change your own permissions.
                </p>
              )}
              {(permUser.branches ?? []).some(b => b.role === 'org_admin') && (
                <p className="mb-4 rounded-xl bg-violet-50 px-4 py-2.5 text-[12.5px] text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                  This user is an <b>Organization Admin</b> — admins always keep full access regardless of these settings.
                </p>
              )}

              {permsLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_,i)=><div key={i} className="h-[52px] animate-pulse rounded-xl bg-neutral-100 dark:bg-white/[0.05]"/>)}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-white/[0.07]">
                  {/* Matrix header */}
                  <div className="grid grid-cols-[1fr_74px_84px_74px] items-center border-b border-neutral-200/70 bg-neutral-50 px-4 py-3 dark:border-white/[0.07] dark:bg-white/[0.03] sm:grid-cols-[1fr_110px_110px_110px]">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Module</span>
                    <span className="text-center text-[11px] font-bold uppercase tracking-wide text-neutral-400">View</span>
                    <span className="text-center text-[11px] font-bold uppercase tracking-wide text-neutral-400">Create / Edit</span>
                    <span className="text-center text-[11px] font-bold uppercase tracking-wide text-neutral-400">Delete</span>
                  </div>
                  {PERM_MODULE_DEFS.map((m, i) => {
                    const f = perms[m.key] ?? { view: true, edit: true, delete: true }
                    const subs = SUBMODULE_DEFS[m.key]
                    const isOpen = expandedModule === m.key
                    return (
                      <div key={m.key} className={i < PERM_MODULE_DEFS.length - 1 ? 'border-b border-neutral-100 dark:border-white/[0.04]' : ''}>
                        <div className="grid grid-cols-[1fr_74px_84px_74px] items-center px-4 py-3.5 transition-colors hover:bg-neutral-50/70 dark:hover:bg-white/[0.02] sm:grid-cols-[1fr_110px_110px_110px]">
                          <button type="button" disabled={!subs}
                            onClick={() => setExpandedModule(o => o === m.key ? null : m.key)}
                            className={`flex min-w-0 items-center gap-3 text-left ${subs ? 'cursor-pointer' : 'cursor-default'}`}>
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                              !f.view ? 'bg-rose-50 text-rose-400 dark:bg-rose-500/10 dark:text-rose-500'
                              : (f.edit && (f.delete || m.readOnly)) ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                            }`}>{m.icon}</div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-neutral-800 dark:text-white">{m.label}</p>
                              <p className="hidden truncate text-[11px] text-neutral-400 sm:block">{m.desc}</p>
                            </div>
                            {subs && (
                              <ChevronDown size={14}
                                className={`ml-1 shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
                            )}
                          </button>
                          <PermCheckbox checked={f.view} onToggle={()=>togglePermFlag(m.key, 'view')}/>
                          {m.readOnly
                            ? <>
                                <span className="text-center text-[13px] text-neutral-300 dark:text-neutral-600">—</span>
                                <span className="text-center text-[13px] text-neutral-300 dark:text-neutral-600">—</span>
                              </>
                            : <>
                                <PermCheckbox checked={f.edit} disabled={!f.view} onToggle={()=>togglePermFlag(m.key, 'edit')}/>
                                <PermCheckbox checked={f.delete} disabled={!f.view} onToggle={()=>togglePermFlag(m.key, 'delete')}/>
                              </>}
                        </div>

                        {/* Sub-page cards — expand to hide/allow individual pages within this module */}
                        {isOpen && subs && (
                          <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-4 dark:border-white/[0.04] dark:bg-white/[0.015]">
                            {!f.view && (
                              <p className="mb-3 text-[11.5px] text-rose-500">
                                Module View is off — the pages below are already hidden regardless of these settings.
                              </p>
                            )}
                            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                              {subs.map(s => {
                                const sf = subPerms[m.key]?.[s.key] ?? { view: true, edit: true, delete: true }
                                return (
                                  <div key={s.key}
                                    className={`rounded-xl border px-3 py-2.5 transition-colors ${
                                      sf.view ? 'border-neutral-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.03]'
                                              : 'border-rose-100 bg-rose-50/40 dark:border-rose-500/15 dark:bg-rose-500/5'
                                    }`}>
                                    <p className="mb-2 truncate text-[12px] font-bold text-neutral-800 dark:text-white">{s.label}</p>
                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-1.5">
                                        <PermCheckbox checked={sf.view} disabled={!f.view}
                                          onToggle={()=>toggleSubPermFlag(m.key, s.key, 'view')}/>
                                        <span className="text-[10.5px] font-semibold text-neutral-500 dark:text-neutral-400">View</span>
                                      </label>
                                      <label className="flex items-center gap-1.5">
                                        <PermCheckbox checked={sf.edit} disabled={!f.view || !sf.view}
                                          onToggle={()=>toggleSubPermFlag(m.key, s.key, 'edit')}/>
                                        <span className="text-[10.5px] font-semibold text-neutral-500 dark:text-neutral-400">Edit</span>
                                      </label>
                                      <label className="flex items-center gap-1.5">
                                        <PermCheckbox checked={sf.delete} disabled={!f.view || !sf.view}
                                          onToggle={()=>toggleSubPermFlag(m.key, s.key, 'delete')}/>
                                        <span className="text-[10.5px] font-semibold text-neutral-500 dark:text-neutral-400">Del</span>
                                      </label>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="mt-4 text-[11.5px] text-neutral-400">
                Each permission is independent — e.g. check <b>Create / Edit</b> without <b>Delete</b> and the user
                can add and modify records but never remove them. Unchecking <b>View</b> blocks the whole module.
                Everything is enforced by the server, not just hidden in the UI. Click a module with an arrow
                (Hotel, Restaurant, Inventory, Finance) to reveal its individual pages — unchecking a page's
                <b> View</b> hides it from that user's sidebar, and <b>Edit</b>/<b>Delete</b> are enforced by the
                server the same way as the module-level checks above.
              </p>
            </div>
          )}
        </div>
      )}
      {tab === 'security' && (<>
        {/* Security posture at a glance */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Active Users',      caption: 'can sign in right now',   value: activeUsers.length, icon: <UserCheck size={19}/>,
              iconCls: 'bg-gradient-to-br from-emerald-400 to-emerald-600', bar: 'bg-emerald-500' },
            { label: 'Locked / At Risk',  caption: 'need admin attention',    value: atRiskUsers.length, icon: <ShieldWarn size={19}/>,
              iconCls: 'bg-gradient-to-br from-rose-400 to-rose-600', bar: 'bg-rose-500' },
            { label: 'Failed Logins',     caption: 'last 24 hours',           value: failed24,           icon: <AlertTriangle size={19}/>,
              iconCls: 'bg-gradient-to-br from-amber-400 to-amber-600', bar: 'bg-amber-500' },
            { label: 'Successful Logins', caption: 'last 24 hours',           value: success24,          icon: <ShieldCheck size={19}/>,
              iconCls: 'bg-gradient-to-br from-indigo-400 to-indigo-600', bar: 'bg-indigo-500' },
          ].map(card => (
            <div key={card.label} className="relative overflow-hidden rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-white/[0.06] dark:bg-[#1c2333]">
              <span className={`absolute inset-x-0 top-0 h-[3px] ${card.bar}`}/>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{card.label}</p>
                  <p className="mt-1.5 text-[28px] font-extrabold leading-none text-neutral-900 dark:text-white">{card.value}</p>
                  <p className="mt-1.5 text-[11px] text-neutral-400">{card.caption}</p>
                </div>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${card.iconCls}`}>
                  {card.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Policy */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333] lg:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg"><Lock size={17}/></div>
              <div>
                <p className="text-[13.5px] font-bold text-neutral-800 dark:text-white">Login & Lockout Policy</p>
                <p className="text-[11px] text-neutral-400">Enforced automatically on every sign-in</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {[
                'Passwords hashed with bcrypt (12 rounds) — never stored in plain text',
                'Access tokens expire after 15 minutes; refresh tokens after 7 days',
                'Auto-lock for 30 minutes after 5 consecutive failed logins',
                'Admins can manually lock, unlock, or deactivate any account',
                'Every attempt & admin action audited with IP address',
              ].map(line => (
                <li key={line} className="flex items-start gap-2.5 rounded-xl bg-neutral-50/70 px-3 py-2.5 text-[12px] text-neutral-600 dark:bg-white/[0.03] dark:text-neutral-300">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                    <Check size={10} strokeWidth={3.5} className="text-emerald-600 dark:text-emerald-400"/>
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* Recent security activity — timeline */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333] lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg"><ShieldWarn size={17}/></div>
                <div>
                  <p className="text-[13.5px] font-bold text-neutral-800 dark:text-white">Recent Security Activity</p>
                  <p className="text-[11px] text-neutral-400">Logins, locks, resets and permission changes</p>
                </div>
              </div>
              <button onClick={()=>setTab('logs')}
                className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">
                View all →
              </button>
            </div>
            {securityLogs.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-neutral-400">No security events yet.</p>
            ) : (
              <div className="relative max-h-[340px] space-y-0.5 overflow-y-auto pr-1">
                <span className="absolute bottom-2 left-[15px] top-2 w-px bg-neutral-100 dark:bg-white/[0.06]" aria-hidden/>
                {securityLogs.slice(0, 12).map(l => {
                  const bad  = ['LOGIN_FAILED','USER_LOCKED'].includes(l.action)
                  const warn = ['USER_SESSIONS_REVOKED','USER_PASSWORD_RESET'].includes(l.action)
                  return (
                    <div key={l.id} className="relative flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-neutral-50/70 dark:hover:bg-white/[0.02] transition-colors">
                      <span className={`relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-[#1c2333] ${
                        bad  ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                        : warn ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                        : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                      }`}>
                        {bad ? <ShieldWarn size={13}/> : warn ? <KeyRound size={13}/> : <ShieldCheck size={13}/>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-200">
                          {l.action.replace(/_/g,' ').toLowerCase().replace(/^./, c=>c.toUpperCase())}
                          <span className="font-normal text-neutral-400"> — {l.user_name ?? l.user_email ?? 'system'}</span>
                        </p>
                        <p className="text-[10.5px] text-neutral-400">{l.ip_address ?? 'no IP'} · {l.branch_name ?? '—'}</p>
                      </div>
                      <span className="shrink-0 text-[10.5px] font-semibold text-neutral-400">{timeAgo(l.created_at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Force logout */}
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-lg"><LogOut size={17}/></div>
              <div>
                <p className="text-[13.5px] font-bold text-neutral-800 dark:text-white">Force Logout Everywhere</p>
                <p className="text-[11.5px] text-neutral-400">Revoke every active session for a user — for lost devices or compromised accounts.</p>
              </div>
            </div>
            <div className="flex min-w-[300px] flex-1 gap-2 sm:max-w-md">
              <div className="flex-1"><Select value={revokeUserId} onChange={setRevokeUserId} placeholder="— Select user —" options={users.map(u=>({value:u.id,label:`${u.full_name} (${u.email})`}))}/></div>
              <button onClick={doRevoke} disabled={!revokeUserId || revokeBusy}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
                {revokeBusy ? <RefreshCw size={13} className="animate-spin"/> : <LogOut size={13}/>} Revoke
              </button>
            </div>
          </div>
        </div>
      </>)}
      {tab === 'logs' && (
        <DataTable columns={LOG_COLS} data={logs} title="Activity Logs" filename="activity_logs"
          rowKey={l=>l.id} searchPlaceholder="Search action, user…" loading={logsLoading}
          onLoadMore={loadMoreLogs} hasMore={logsHasMore} loadingMore={logsLoadingMore}/>
      )}

      {/* ── Invite / Add New User ───────────────────────────────────────── */}
      <Modal open={mode === 'invite'} onClose={close} title="Add New User" size="md"
        footer={tempPw ? (
          <button onClick={close}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            Done
          </button>
        ) : (<>
          <CancelBtn onClick={close}/>
          <button onClick={invite}
            disabled={!inviteForm.full_name.trim() || !inviteForm.email.trim() || !inviteForm.branch_id || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Create
          </button>
        </>)}>
        {tempPw ? (
          <div className="space-y-4 py-2 text-center">
            <p className="text-[14px] font-bold text-neutral-800 dark:text-white">User created!</p>
            <p className="text-[13px] text-neutral-500">Share this temporary password with them — it is shown only once:</p>
            <p className="mx-auto w-fit rounded-xl bg-indigo-50 px-6 py-3 font-mono text-[16px] font-extrabold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              {tempPw}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

            <Field label="Profile Photo (optional)">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} className="hidden"/>
              {imgPreview ? (
                <div className="flex items-center gap-3">
                  <ImageThumb src={imgPreview} className="h-16 w-16 rounded-2xl" onClick={()=>setViewImage(imgPreview)}/>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>fileRef.current?.click()} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors">Change</button>
                    <button type="button" onClick={clearImage} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><X size={13}/></button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={()=>fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-[12.5px] font-semibold text-neutral-500 hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-neutral-400 transition-colors">
                  <ImagePlus size={16}/> Upload photo (JPG, PNG, WebP · max 15MB)
                </button>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name">
                <input value={inviteForm.full_name} onChange={e=>setInviteForm(p=>({...p, full_name: e.target.value}))}
                  placeholder="Full name" className={INPUT} autoFocus/>
              </Field>
              <Field label="Email">
                <input type="email" value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p, email: e.target.value}))}
                  placeholder="user@company.com" className={INPUT}/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (optional)">
                <input value={inviteForm.phone} onChange={e=>setInviteForm(p=>({...p, phone: e.target.value}))}
                  placeholder="+252 …" className={INPUT}/>
              </Field>
              <Field label="Password (optional — auto-generated if empty)">
                <input type="text" value={inviteForm.password} onChange={e=>setInviteForm(p=>({...p, password: e.target.value}))}
                  placeholder="Leave empty to auto-generate" className={INPUT}/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch">
                <Select value={inviteForm.branch_id} onChange={v=>setInviteForm(p=>({...p, branch_id: v}))}
                  placeholder="— Select branch —"
                  options={branches.map(b => ({ value: b.id, label: b.name }))}/>
              </Field>
              <Field label="Role">
                <Select value={inviteForm.role} onChange={v=>setInviteForm(p=>({...p, role: v}))} options={ROLE_OPTIONS}/>
              </Field>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit User ────────────────────────────────────────────────────── */}
      <Modal open={mode === 'edit'} onClose={close} title="Edit User" size="md" footer={<>
        <CancelBtn onClick={close}/>
        <button onClick={saveEdit} disabled={saving || !editForm.full_name.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Save Changes
        </button>
      </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <Field label="Profile Photo (optional)">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} className="hidden"/>
            {imgPreview ? (
              <div className="flex items-center gap-3">
                <ImageThumb src={imgPreview} className="h-16 w-16 rounded-2xl" onClick={()=>setViewImage(imgPreview)}/>
                <div className="flex gap-2">
                  <button type="button" onClick={()=>fileRef.current?.click()} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors">Change</button>
                  <button type="button" onClick={clearImage} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><X size={13}/></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={()=>fileRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-[12.5px] font-semibold text-neutral-500 hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-neutral-400 transition-colors">
                <ImagePlus size={16}/> Upload photo (JPG, PNG, WebP · max 15MB)
              </button>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Full Name">
              <input value={editForm.full_name} onChange={e=>setEditForm(p=>({...p, full_name: e.target.value}))} className={INPUT} autoFocus/>
            </Field>
            <Field label="Email (read-only)">
              <input value={activeUser?.email ?? ''} disabled className={`${INPUT} opacity-60 cursor-not-allowed`}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={editForm.phone} onChange={e=>setEditForm(p=>({...p, phone: e.target.value}))} className={INPUT}/>
            </Field>
            <Field label="Branch">
              <Select value={editForm.branch_id} onChange={v=>setEditForm(p=>({...p, branch_id: v}))}
                options={branches.map(b => ({ value: b.id, label: b.name }))}/>
            </Field>
          </div>
          <Field label="Role">
            <Select value={editForm.role} onChange={v=>setEditForm(p=>({...p, role: v}))} options={ROLE_OPTIONS}/>
          </Field>

          {/* Password reset — optional, admin sets a new one directly */}
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
            <div className="mb-2 flex items-center gap-2">
              <KeyRound size={14} className="text-amber-600 dark:text-amber-400"/>
              <p className="text-[12.5px] font-bold text-amber-800 dark:text-amber-300">Reset Password</p>
            </div>
            <input type="text" value={editForm.new_password}
              onChange={e=>setEditForm(p=>({...p, new_password: e.target.value}))}
              placeholder="Leave blank to keep the current password" className={INPUT}/>
            <p className="mt-2 text-[11px] text-amber-700/80 dark:text-amber-400/80">
              Minimum 6 characters. Setting a new password also unlocks the account and signs the user out of all devices.
            </p>
          </div>

          <label className="flex items-center gap-2.5 rounded-xl border border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
            <input type="checkbox" checked={editForm.is_active} onChange={e=>setEditForm(p=>({...p, is_active: e.target.checked}))}
              className="h-4 w-4 rounded accent-indigo-600"/>
            <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Account is active</span>
          </label>
        </div>
      </Modal>

      {/* ── View User ────────────────────────────────────────────────────── */}
      <Modal open={mode === 'view'} onClose={close} title="User Profile" size="md">
        {activeUser && (
          <div className="space-y-5">
            {/* Hero header */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 px-6 pb-6 pt-7 text-center">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10"/>
              <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10"/>
              <div className="relative mx-auto mb-3 h-20 w-20">
                {activeUser.avatar_url
                  ? <ImageThumb src={activeUser.avatar_url} alt={activeUser.full_name}
                      className="h-20 w-20 rounded-2xl ring-4 ring-white/30"
                      onClick={()=>setViewImage(activeUser.avatar_url!)}/>
                  : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-[24px] font-extrabold text-white ring-4 ring-white/30 backdrop-blur-sm">
                      {(activeUser.full_name ?? activeUser.email).slice(0,2).toUpperCase()}
                    </div>}
              </div>
              <p className="relative text-[17px] font-extrabold text-white">{activeUser.full_name}</p>
              <p className="relative text-[12px] text-white/70">{activeUser.email}</p>
              <div className="relative mt-3 flex justify-center gap-2">
                {statusBadge(activeUser)}
                {lockBadge(activeUser)}
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Mail size={15}/>,     label: 'Email',        value: activeUser.email },
                { icon: <Phone size={15}/>,    label: 'Phone',        value: activeUser.phone ?? '—' },
                { icon: <Calendar size={15}/>, label: 'Member Since', value: activeUser.created_at?.slice(0,10) ?? '—' },
                { icon: <Clock size={15}/>,    label: 'Last Login',   value: activeUser.last_login_at ? new Date(activeUser.last_login_at).toLocaleString() : 'Never' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/60 px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">{item.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{item.label}</p>
                    <p className="truncate text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-200">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Branch & role */}
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 px-4 py-3.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Branch & Role</p>
              <div className="flex flex-wrap gap-1.5">
                {(activeUser.branches ?? []).filter(b=>b.branch_id).map((b, i) => (
                  <span key={i} className="rounded-full bg-indigo-50 px-3 py-1 text-[11.5px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {b.branch_name} · {ROLE_LABELS[b.role] ?? b.role}
                  </span>
                ))}
              </div>
            </div>

            {needsAttention(activeUser) && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"/>
                <p className="text-[12.5px] text-rose-700 dark:text-rose-300">
                  {activeUser.failed_attempts} failed login attempt(s)
                  {activeUser.is_locked && <> — locked by an administrator</>}
                  {!activeUser.is_locked && activeUser.locked_until && new Date(activeUser.locked_until) > new Date() && <> — auto-locked until {new Date(activeUser.locked_until).toLocaleString()}</>}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Deactivate User (picker) ────────────────────────────────────── */}
      <Modal open={mode === 'deactivatePicker'} onClose={close} title="Deactivate User" size="sm" footer={<>
        <CancelBtn onClick={close}/>
        <button onClick={doPickerAction} disabled={!pickerUserId || saving}
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={13} className="animate-spin"/> : <ShieldOff size={13}/>} Deactivate
        </button>
      </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="User">
            <Select value={pickerUserId} onChange={setPickerUserId} placeholder="— Select an active user —"
              options={activeUsers.filter(u=>u.id!==me?.id).map(u=>({ value: u.id, label: `${u.full_name} (${u.email})` }))}/>
          </Field>
          <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10">
            <p className="text-[12px] text-rose-700 dark:text-rose-300">
              A deactivated user cannot sign in until an admin activates them again — they'll immediately
              move to this tab.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Lock User (picker) ──────────────────────────────────────────── */}
      <Modal open={mode === 'lockPicker'} onClose={close} title="Lock User" size="sm" footer={<>
        <CancelBtn onClick={close}/>
        <button onClick={doPickerAction} disabled={!pickerUserId || saving}
          className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={13} className="animate-spin"/> : <Lock size={13}/>} Lock
        </button>
      </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="User">
            <Select value={pickerUserId} onChange={setPickerUserId} placeholder="— Select a user to lock —"
              options={unlockedActiveUsers.filter(u=>u.id!==me?.id).map(u=>({ value: u.id, label: `${u.full_name} (${u.email})` }))}/>
          </Field>
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              A locked account is blocked from signing in immediately, even with the correct password,
              until an admin unlocks it from the User Locks tab.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Confirm quick actions (lock/unlock/activate/deactivate/delete) ── */}
      <ConfirmModal
        open={!!confirmAction} onClose={()=>setConfirmAction(null)} onConfirm={doConfirm} loading={saving}
        title={confirmAction ? CONFIRM_COPY[confirmAction.type].title : ''}
        confirmLabel={confirmAction ? CONFIRM_COPY[confirmAction.type].confirmLabel : ''}
        danger={confirmAction ? CONFIRM_COPY[confirmAction.type].danger : true}
        message={confirmAction && <>{CONFIRM_COPY[confirmAction.type].verb} <b>{confirmAction.user.full_name}</b>?
          {confirmAction.type === 'delete' && ' They will lose access immediately. This cannot be undone.'}
        </>}
      />

      <ImageModal src={viewImage} alt="User photo" onClose={()=>setViewImage(null)}/>
    </div>
  )
}
