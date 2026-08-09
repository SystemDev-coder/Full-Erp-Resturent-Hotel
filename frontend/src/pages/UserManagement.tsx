import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Search, Plus, RefreshCw, ChevronLeft, ChevronRight,
  MoreHorizontal, ShieldOff, ShieldCheck, Trash2, KeyRound, X, Check,
  Eye, EyeOff,
} from 'lucide-react'
import {
  listUsers, createUser, deleteUser, suspendUser,
  activateUser, resetPassword,
} from '@services/adminService'
import type { AdminUser, CreateUserPayload } from '@services/adminService'
import { getApiErrorMessage } from '@services/api'
import type { UserRole } from '@/types/auth'
import { useAuth } from '@hooks/useAuth'

const ROLES: UserRole[] = ['super_admin', 'admin', 'analyst', 'researcher', 'viewer']

const ROLE_LEVEL: Record<string, number> = {
  super_admin: 4, admin: 3, analyst: 2, researcher: 1, viewer: 0,
}

const roleBadge: Record<string, string> = {
  super_admin: 'bg-violet-100 text-violet-700 dark:bg-violet-500/12 dark:text-violet-400',
  admin:       'bg-sky-100 text-sky-700 dark:bg-sky-500/12 dark:text-sky-400',
  analyst:     'bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-400',
  researcher:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400',
  viewer:      'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const initials = (u: AdminUser) =>
  (u.name || u.email).slice(0, 2).toUpperCase()

const avatarColor = (role: string) => {
  const map: Record<string, string> = {
    super_admin: 'bg-violet-500', admin: 'bg-sky-500',
    analyst: 'bg-amber-500', researcher: 'bg-emerald-500', viewer: 'bg-neutral-400',
  }
  return map[role] ?? 'bg-neutral-400'
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function canManage(meRole: string, targetRole: string, meId: string, targetId: string) {
  if (meId === targetId) return false
  return ROLE_LEVEL[meRole] > ROLE_LEVEL[targetRole]
}

/* ── Field component ─────────────────────────────────────────────────────── */
function Field({
  label, value, onChange, type = 'text', placeholder = '', children,
}: {
  label: string; value?: string; onChange?: (v: string) => void
  type?: string; placeholder?: string; children?: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</label>
      {children ?? (
        <div className="relative">
          <input
            type={isPassword && !show ? 'password' : 'text'}
            value={value}
            placeholder={placeholder}
            onChange={e => onChange?.(e.target.value)}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 text-sm text-neutral-900 placeholder-neutral-400 transition-colors focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-white dark:placeholder-neutral-600 dark:focus:border-sky-500/50 dark:focus:bg-neutral-800"
          />
          {isPassword && (
            <button type="button" onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Modal shell ─────────────────────────────────────────────────────────── */
function Modal({ title, width = 'max-w-md', onClose, children }: {
  title: string; width?: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`w-full ${width} overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-2xl dark:border-white/[0.07] dark:bg-[#0D1B2A]`}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-white/[0.06]">
          <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white">{title}</h2>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/8 dark:hover:text-white">
            <X size={15} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </motion.div>
    </div>
  )
}

/* ── Create User Modal ───────────────────────────────────────────────────── */
function CreateModal({ myRole, onClose, onSuccess }: {
  myRole: string; onClose: () => void; onSuccess: () => void
}) {
  const [form, setForm] = useState<CreateUserPayload>({ email: '', name: '', password: '', role: 'viewer' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allowedRoles = ROLES.filter(r => ROLE_LEVEL[r] < ROLE_LEVEL[myRole])

  const submit = async () => {
    if (!form.email || !form.password) return
    setSaving(true); setError(null)
    try { await createUser(form); onSuccess(); onClose() }
    catch (e) { setError(getApiErrorMessage(e, 'Failed to create user.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Create new user" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Full Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Jane Doe" />
        <Field label="Email address" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} type="email" placeholder="jane@example.com" />
        <Field label="Password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} type="password" placeholder="Min 8 characters" />
        <Field label="Role">
          <select
            value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 text-sm text-neutral-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-white"
          >
            {allowedRoles.map(r => (
              <option key={r} value={r}>{r.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>
            ))}
          </select>
        </Field>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-1">
          <button onClick={onClose}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !form.email || !form.password}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-600 disabled:opacity-50">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            Create User
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Reset Password Modal ────────────────────────────────────────────────── */
function ResetModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (pw.length < 8) return
    setSaving(true); setError(null)
    try { await resetPassword(user.id, pw); setDone(true) }
    catch (e) { setError(getApiErrorMessage(e, 'Failed to reset password.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Reset Password" width="max-w-sm" onClose={onClose}>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Setting a new password for <span className="font-semibold text-neutral-800 dark:text-neutral-200">{user.email}</span>
      </p>
      {done ? (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400">
          <Check size={15} />
          Password updated successfully.
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="New Password" value={pw} onChange={setPw} type="password" placeholder="Min 8 characters" />
          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2.5">
            <button onClick={onClose}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5">
              Cancel
            </button>
            <button onClick={submit} disabled={saving || pw.length < 8}
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-600 disabled:opacity-50">
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />}
              Reset
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ── Action Dropdown ─────────────────────────────────────────────────────── */
function ActionMenu({
  user, me, pos, onClose, onToggle, onReset, onDelete,
}: {
  user: AdminUser
  me: { id: string; role: string }
  pos: { top: number; right: number }
  onClose: () => void
  onToggle: () => void
  onReset: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const canDo  = canManage(me.role, user.role, me.id, user.id)
  const canDel = me.role === 'super_admin' && user.id !== me.id

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.13, ease: 'easeOut' }}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
      className="w-52 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-xl shadow-black/10 dark:border-white/[0.08] dark:bg-[#0D1B2A] dark:shadow-black/40"
    >
      {/* User info header */}
      <div className="border-b border-neutral-100 px-4 py-3 dark:border-white/[0.06]">
        <p className="truncate text-[11px] font-bold text-neutral-900 dark:text-white">{user.name || user.email}</p>
        <p className="mt-0.5 truncate text-[10px] text-neutral-400 dark:text-neutral-500">{user.role.replace('_', ' ')}</p>
      </div>

      <div className="p-1.5 space-y-0.5">
        {canDo ? (
          <>
            <button onClick={onToggle}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-colors ${
                user.is_active
                  ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/8'
                  : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/8'
              }`}>
              {user.is_active
                ? <><ShieldOff size={13} /> Suspend user</>
                : <><ShieldCheck size={13} /> Activate user</>
              }
            </button>

            <button onClick={onReset}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/6">
              <KeyRound size={13} />
              Reset password
            </button>
          </>
        ) : (
          <p className="px-3 py-2 text-[11px] text-neutral-400 dark:text-neutral-600">
            No actions available
          </p>
        )}

        {canDel && (
          <>
            <div className="my-1 h-px bg-neutral-100 dark:bg-white/[0.05]" />
            <button onClick={onDelete}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/8">
              <Trash2 size={13} />
              Delete user
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers]             = useState<AdminUser[]>([])
  const [total, setTotal]             = useState(0)
  const [pages, setPages]             = useState(1)
  const [page, setPage]               = useState(1)
  const [search, setSearch]           = useState('')
  const [roleFilter, setRoleFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [showCreate, setShowCreate]   = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [menuOpen, setMenuOpen]       = useState<string | null>(null)
  const [menuPos, setMenuPos]         = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  const myRole = me?.role ?? 'viewer'
  const myId   = me?.id ?? ''

  const load = useCallback(async (p = page) => {
    setLoading(true); setError(null)
    try {
      const res = await listUsers({ page: p, limit: 20,
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      })
      setUsers(res.data.users)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load users.'))
    } finally { setLoading(false) }
  }, [page, search, roleFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, userId: string) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    setMenuOpen(userId === menuOpen ? null : userId)
  }

  const handleToggle = async (u: AdminUser) => {
    setMenuOpen(null)
    try { u.is_active ? await suspendUser(u.id) : await activateUser(u.id); load() } catch {}
  }

  const handleDelete = async (u: AdminUser) => {
    setMenuOpen(null)
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return
    try { await deleteUser(u.id); load() } catch {}
  }

  const activeUser = menuOpen ? users.find(u => u.id === menuOpen) : null

  return (
    <div className="space-y-5" onClick={() => setMenuOpen(null)}>

      {/* Modals — rendered at top level, above everything */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal myRole={myRole} onClose={() => setShowCreate(false)} onSuccess={load} />
        )}
        {resetTarget && (
          <ResetModal user={resetTarget} onClose={() => setResetTarget(null)} />
        )}
      </AnimatePresence>

      {/* Fixed dropdown */}
      <AnimatePresence>
        {menuOpen && activeUser && me && (
          <ActionMenu
            user={activeUser}
            me={{ id: myId, role: myRole }}
            pos={menuPos}
            onClose={() => setMenuOpen(null)}
            onToggle={() => handleToggle(activeUser)}
            onReset={() => { setResetTarget(activeUser); setMenuOpen(null) }}
            onDelete={() => handleDelete(activeUser)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Users</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-500">
            {total.toLocaleString()} registered accounts
          </p>
        </div>
        {myRole === 'super_admin' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-600">
            <Plus size={15} />
            Create User
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name or email…"
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-4 text-sm text-neutral-900 placeholder-neutral-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-neutral-600"
          />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300">
          <option value="">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button onClick={() => load()}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/15 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.06] dark:bg-[#0D2137]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                {['User', 'Role', 'Status', 'Predictions', 'Last Login', 'Joined', ''].map((h, i) => (
                  <th key={i} className={`px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-600 ${i === 6 ? 'w-12' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.03]">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3.5 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" style={{ width: j === 0 ? '70%' : '50%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <Users size={28} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-700" />
                    <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-500">No users found</p>
                  </td>
                </tr>
              ) : users.map((u) => {
                const hasActions = canManage(myRole, u.role, myId, u.id) || (myRole === 'super_admin' && u.id !== myId)
                return (
                  <tr key={u.id} className="group transition-colors hover:bg-neutral-50/60 dark:hover:bg-white/[0.015]">
                    {/* User */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white ${avatarColor(u.role)}`}>
                          {initials(u)}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900 dark:text-white leading-tight">{u.name || '—'}</p>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-5 py-4">
                      <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold capitalize ${roleBadge[u.role]}`}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        u.is_active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    {/* Predictions */}
                    <td className="px-5 py-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {u.daily_prediction_count}/{u.daily_prediction_limit === -1 ? '∞' : u.daily_prediction_limit}
                    </td>
                    {/* Last login */}
                    <td className="px-5 py-4 text-xs text-neutral-500 dark:text-neutral-500">{fmt(u.last_login)}</td>
                    {/* Joined */}
                    <td className="px-5 py-4 text-xs text-neutral-500 dark:text-neutral-500">{fmt(u.created_at)}</td>
                    {/* Actions */}
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      {hasActions && (
                        <button
                          onClick={e => openMenu(e, u.id)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                            menuOpen === u.id
                              ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400'
                              : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/8 dark:hover:text-neutral-200'
                          }`}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 dark:border-white/[0.05]">
            <p className="text-xs text-neutral-400 dark:text-neutral-600">
              Page {page} of {pages} · {total} users
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-neutral-400">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-neutral-400">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
