import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, BedDouble, CalendarCheck, Users, DoorOpen, SprayCan,
  UtensilsCrossed, ClipboardList, BookOpenCheck, Monitor,
  ShoppingCart, Archive,
  Landmark,
  UserSquare2, Wallet,
  Settings2, Shield,
  Bell, Search, Sun, Moon, Menu, X,
  ChevronDown, LogOut, Building2, Boxes, Check,
  ChevronRight, RefreshCw, Truck, Warehouse,
  Receipt, Flame, Banknote, BarChart3,
  FileText, AlertTriangle, CornerDownLeft,
} from 'lucide-react'
import api from '@/services/api'
import { useAuth } from '@hooks/useAuth'
import { useTheme } from '@contexts/ThemeContext'
import { useLanguage } from '@contexts/LanguageContext'
import { LangPicker } from '@/components/ui/LangPicker'
import { ROLE_LABELS, ROLE_COLORS } from '@/types/auth'
import type { User, UserBranch, BranchType, ERPRole } from '@/types/auth'

// ─── Nav structure (labels are i18n keys, translated at render) ───────────────
// `roles` limits who sees a section/item; omit it to allow everyone.

interface NavItem  { path: string; label: string; icon: React.ReactNode; roles?: ERPRole[] }
interface NavSection { key: string; label: string; icon: React.ReactNode; items: NavItem[]; color: string; roles?: ERPRole[] }

const MANAGERS: ERPRole[] = ['org_admin', 'branch_manager']

const HOTEL_SECTION: NavSection = {
  key: 'hotel', label: 'nav.hotel', icon: <BedDouble size={15} />, color: 'text-sky-400',
  roles: [...MANAGERS, 'receptionist', 'housekeeper', 'hotel_cashier'],
  items: [
    { path: '/hotel/bookings',     label: 'nav.bookings',     icon: <CalendarCheck size={14} /> },
    { path: '/hotel/rooms',        label: 'nav.rooms',        icon: <DoorOpen size={14} /> },
    { path: '/hotel/guests',       label: 'nav.guests',       icon: <Users size={14} /> },
    { path: '/hotel/housekeeping', label: 'nav.housekeeping', icon: <SprayCan size={14} /> },
  ],
}

const RESTAURANT_SECTION: NavSection = {
  key: 'restaurant', label: 'nav.restaurant', icon: <UtensilsCrossed size={15} />, color: 'text-amber-400',
  roles: [...MANAGERS, 'cashier', 'waiter', 'chef', 'bar_staff'],
  items: [
    { path: '/restaurant/pos',        label: 'nav.pos',          icon: <Monitor size={14} /> },
    { path: '/restaurant/operations', label: 'nav.ordersTables', icon: <ClipboardList size={14} /> },
    // Only managers touch the menu itself (prices, photos)
    { path: '/restaurant/menu',       label: 'nav.menu',         icon: <BookOpenCheck size={14} />, roles: MANAGERS },
  ],
}

const INVENTORY_SECTION: NavSection = {
  key: 'inventory', label: 'nav.inventory', icon: <Boxes size={15} />, color: 'text-emerald-400',
  roles: [...MANAGERS, 'inventory_manager', 'chef'],
  items: [
    { path: '/inventory/suppliers',  label: 'nav.suppliers',      icon: <Truck size={14} />, roles: [...MANAGERS, 'inventory_manager'] },
    { path: '/inventory/warehouses', label: 'nav.warehouses',     icon: <Warehouse size={14} />, roles: [...MANAGERS, 'inventory_manager'] },
    { path: '/inventory/items',      label: 'nav.items',          icon: <Archive size={14} /> },
    { path: '/inventory/orders',     label: 'nav.purchaseOrders', icon: <ShoppingCart size={14} />, roles: [...MANAGERS, 'inventory_manager'] },
  ],
}

const FINANCE_SECTION: NavSection = {
  key: 'finance', label: 'nav.finance', icon: <Landmark size={15} />, color: 'text-violet-400',
  roles: [...MANAGERS, 'accountant', 'hotel_cashier'],
  items: [
    { path: '/accounting/accounts',     label: 'nav.accounts',     icon: <Wallet size={14} />, roles: [...MANAGERS, 'accountant'] },
    { path: '/accounting/receipts',     label: 'nav.receipts',     icon: <Receipt size={14} /> },
    { path: '/accounting/expenses',     label: 'nav.expenses',     icon: <Flame size={14} />, roles: [...MANAGERS, 'accountant'] },
    { path: '/accounting/salary',       label: 'nav.salary',       icon: <Banknote size={14} />, roles: [...MANAGERS, 'accountant'] },
  ],
}

const HR_SECTION: NavSection = {
  key: 'hr', label: 'nav.hr', icon: <UserSquare2 size={15} />, color: 'text-pink-400',
  roles: [...MANAGERS, 'accountant'],
  items: [
    { path: '/hr/staff',   label: 'nav.staff',   icon: <UserSquare2 size={14} /> },
  ],
}

const SYSTEM_SECTION: NavSection = {
  key: 'system', label: 'nav.system', icon: <Settings2 size={15} />, color: 'text-neutral-400',
  roles: [...MANAGERS, 'accountant', 'report_viewer'],
  items: [
    { path: '/system/settings', label: 'nav.settings',     icon: <Shield size={14} />, roles: MANAGERS },
    { path: '/system/systems',  label: 'nav.systems',      icon: <Settings2 size={14} />, roles: ['org_admin'] },
    { path: '/reports',         label: 'nav.reports',      icon: <BarChart3 size={14} />, roles: [...MANAGERS, 'accountant', 'report_viewer'] },
  ],
}

const ALL_SECTIONS = [HOTEL_SECTION, RESTAURANT_SECTION, INVENTORY_SECTION, FINANCE_SECTION, HR_SECTION, SYSTEM_SECTION]

// Per-user permission overrides fetched from /auth/my-permissions — same
// shape the Settings → Permissions editor manages. A page's submodule key is
// just its last path segment (bookings, rooms, pos, accounts…), which lines
// up 1:1 with the module_key/submodule_key pairs the server checks.
export interface PermFlags { view: boolean; edit: boolean; delete: boolean }
export interface MyPermissions {
  modules: Record<string, PermFlags>
  submodules: Record<string, Record<string, PermFlags>>
}
const lastSegment = (path: string) => path.split('/').filter(Boolean).pop() ?? ''

// Combined visibility: the branch type hides hotel/restaurant on single-type
// branches, the user's ROLE hides everything not meant for them, and any
// per-user permission override (Settings → Permissions) hides a module or an
// individual page within it on top of that — hotel staff never see
// restaurant menus, restaurant staff never see hotel, and an admin can hide
// e.g. just "Rooms" for one receptionist without touching their role.
function visibleSectionsFor(branchType?: BranchType, role?: ERPRole, perms?: MyPermissions | null): NavSection[] {
  const roleAllows = (roles?: ERPRole[]) => !roles || !role || roles.includes(role)
  return ALL_SECTIONS
    .filter(s => {
      if (s.key === 'hotel'      && branchType === 'restaurant') return false
      if (s.key === 'restaurant' && branchType === 'hotel')      return false
      if (perms && perms.modules[s.key]?.view === false) return false
      return roleAllows(s.roles)
    })
    .map(s => ({
      ...s,
      items: s.items.filter(i => {
        if (!roleAllows(i.roles)) return false
        if (!perms) return true
        const sub = perms.submodules[s.key]?.[lastSegment(i.path)]
        return sub?.view !== false
      }),
    }))
    .filter(s => s.items.length > 0)
}

// URL segment → i18n key for breadcrumbs
const SEGMENT_KEY: Record<string, string> = {
  dashboard: 'nav.dashboard', hotel: 'nav.hotel', bookings: 'nav.bookings',
  rooms: 'nav.rooms', guests: 'nav.guests', housekeeping: 'nav.housekeeping',
  restaurant: 'nav.restaurant', pos: 'nav.pos', operations: 'nav.ordersTables',
  orders: 'nav.orders', tables: 'nav.tables', menu: 'nav.menu',
  inventory: 'nav.inventory', suppliers: 'nav.suppliers', warehouses: 'nav.warehouses',
  items: 'nav.items', stock: 'nav.stock',
  accounting: 'nav.finance', accounts: 'nav.accounts', receipts: 'nav.receipts',
  expenses: 'nav.expenses', salary: 'nav.salary',
  invoices: 'nav.invoices', transactions: 'nav.transactions',
  hr: 'nav.hr', staff: 'nav.staff', payroll: 'nav.payroll',
  system: 'nav.system', settings: 'nav.settings', systems: 'nav.systems', reports: 'nav.reports',
  users: 'nav.usersAccess', modules: 'nav.moduleConfig', audit: 'nav.auditLogs',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(user: User | null) {
  const n = user?.full_name ?? user?.email ?? 'U'
  return n.slice(0, 2).toUpperCase()
}
function displayName(user: User | null) { return user?.full_name ?? user?.email ?? 'User' }
function roleLabel(user: User | null)   { const r = user?.current_branch?.role ?? user?.role; return r ? ROLE_LABELS[r] : 'Staff' }
function roleColor(user: User | null)   { const r = user?.current_branch?.role ?? user?.role; return r ? ROLE_COLORS[r] : 'bg-neutral-700 text-neutral-300' }

function branchTypeBadge(type: BranchType) {
  return type === 'both'  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
       : type === 'hotel' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
       :                    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
}

function branchId(b: UserBranch) { return b.branch_id ?? b.id }

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (isNaN(s) || s < 60) return 'now'
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

interface Notif { kind: 'booking' | 'order' | 'invoice' | 'stock'; text: string; link: string; at: string }

const NOTIF_ICON: Record<Notif['kind'], { icon: React.ReactNode; cls: string }> = {
  booking: { icon: <CalendarCheck size={14}/>,   cls: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  order:   { icon: <UtensilsCrossed size={14}/>, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  invoice: { icon: <FileText size={14}/>,        cls: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  stock:   { icon: <AlertTriangle size={14}/>,   cls: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
}

// ─── Flat nav item ────────────────────────────────────────────────────────────

function NavLinkItem({ path, label, icon, onClose }: NavItem & { onClose: () => void }) {
  const { pathname } = useLocation()
  const { t } = useLanguage()
  const active = pathname === path || pathname.startsWith(path + '/')
  return (
    <Link to={path} onClick={onClose}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[12.5px] font-medium transition-all group ${
        active ? 'bg-white/[0.08] text-white' : 'text-[#8888aa] hover:bg-white/[0.04] hover:text-white'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-indigo-400" />}
      <span className={`shrink-0 transition-colors ${active ? 'text-indigo-400' : 'text-[#55557a] group-hover:text-[#8888aa]'}`}>
        {icon}
      </span>
      {t(label)}
    </Link>
  )
}

// ─── Flat section (no collapse) ───────────────────────────────────────────────

function NavSection({ section, onClose }: { section: NavSection; onClose: () => void }) {
  const { pathname } = useLocation()
  const { t } = useLanguage()
  const hasActive = section.items.some(i => pathname === i.path || pathname.startsWith(i.path + '/'))

  return (
    <div className="mb-3">
      {/* Section label — NOT a button, just a label */}
      <div className={`flex items-center gap-2 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-widest mb-1 ${
        hasActive ? 'text-white' : 'text-[#44445a]'
      }`}>
        <span className={section.color}>{section.icon}</span>
        {t(section.label)}
      </div>
      {/* Items always visible */}
      <div className="space-y-0.5">
        {section.items.map(item => (
          <NavLinkItem key={item.path} {...item} onClose={onClose} />
        ))}
      </div>
    </div>
  )
}

// ─── Branch Switcher ──────────────────────────────────────────────────────────
// The branch pill in the navbar is now a dropdown: pick any branch you're
// assigned to → a new branch-scoped token is issued → the app reloads its data.

function BranchSwitcher() {
  const { user, switchBranch } = useAuth()
  const { t } = useLanguage()
  const [open,      setOpen]      = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  const current  = user?.current_branch
  const branches = user?.branches ?? []
  if (!current) return null

  const currentId  = branchId(current)
  const canSwitch  = branches.length > 1

  const pick = async (id: string) => {
    if (id === currentId || switching) { setOpen(false); return }
    setSwitching(id)
    try {
      await switchBranch(id) // reloads the page on success
    } catch {
      setSwitching(null)
    }
  }

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => canSwitch && setOpen(v => !v)}
        className={`flex items-center gap-2 rounded-lg border border-neutral-200/60 bg-neutral-50 px-3 py-1.5 dark:border-white/[0.07] dark:bg-white/[0.04] transition-colors ${
          canSwitch ? 'hover:border-indigo-300 dark:hover:border-indigo-500/40 cursor-pointer' : 'cursor-default'
        }`}
      >
        <Building2 size={13} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
        <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">{current.branch_name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${branchTypeBadge(current.branch_type)}`}>
          {current.branch_type}
        </span>
        {canSwitch && <ChevronDown size={12} className={`text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-11 z-30 w-72 rounded-2xl border border-neutral-200/60 bg-white py-1.5 shadow-xl dark:border-white/[0.08] dark:bg-[#1c2333]"
            >
              <p className="px-4 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {t('branch.your')}
              </p>

              {branches.map(b => {
                const id       = branchId(b)
                const isActive = id === currentId
                const isBusy   = switching === id
                return (
                  <button
                    key={id}
                    onClick={() => pick(id)}
                    disabled={!!switching}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-60 ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-500/10'
                        : 'hover:bg-neutral-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400'
                    }`}>
                      {isBusy ? <RefreshCw size={13} className="animate-spin" /> : <Building2 size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12.5px] font-semibold ${
                        isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-neutral-700 dark:text-neutral-200'
                      }`}>
                        {b.branch_name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-bold capitalize ${branchTypeBadge(b.branch_type)}`}>
                          {b.branch_type}
                        </span>
                        <span className="text-[10px] text-neutral-400">{ROLE_LABELS[b.role] ?? b.role}</span>
                      </div>
                    </div>
                    {isBusy
                      ? <span className="text-[10px] font-semibold text-indigo-500">{t('branch.switching')}</span>
                      : isActive && (
                        <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[9.5px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          <Check size={9} /> {t('branch.current')}
                        </span>
                      )
                    }
                  </button>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sign-Out Confirmation Modal ─────────────────────────────────────────────

function SignOutModal({ open, onClose, onConfirm, user }: {
  open: boolean; onClose: () => void; onConfirm: () => void; user: User | null
}) {
  const { t } = useLanguage()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}/>

      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#1c2333]">

        {/* Close */}
        <button onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors">
          <X size={15}/>
        </button>

        <div className="px-6 py-6">
          {/* Title */}
          <div className="mb-5">
            <h2 className="text-[16px] font-extrabold text-neutral-900 dark:text-white">{t('signout.title')}</h2>
            <p className="mt-0.5 text-[12.5px] text-neutral-500 dark:text-neutral-400">{t('signout.subtitle')}</p>
          </div>

          {/* User card */}
          <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[13px] font-extrabold text-white shadow">
              {initials(user)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-neutral-800 dark:text-white">{displayName(user)}</p>
              <p className="truncate text-[11.5px] text-neutral-500 dark:text-neutral-400">{user?.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[9.5px] font-bold ${roleColor(user)}`}>
                  {roleLabel(user)}
                </span>
                {user?.current_branch && (
                  <span className="text-[10.5px] text-neutral-400 dark:text-neutral-500">
                    · {user.current_branch.branch_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
            <p className="text-[12.5px] font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
              {t('signout.warning')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04]">
              {t('signout.stay')}
            </button>
            <button onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-rose-700 active:scale-[0.98]">
              <LogOut size={14}/> {t('signout.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export const Layout = () => {
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [notifOpen,    setNotifOpen]    = useState(false)
  const [signOutOpen,  setSignOutOpen]  = useState(false)
  const [avatarOpen,   setAvatarOpen]   = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()

  // Per-user permission overrides (Settings → Permissions) — fetched once per
  // session; org_admin has no override rows so this naturally resolves to
  // full access for them without any special-casing here.
  const [myPerms, setMyPerms] = useState<MyPermissions | null>(null)
  useEffect(() => {
    api.get('/auth/my-permissions')
      .then(r => setMyPerms(r.data.data))
      .catch(() => setMyPerms(null))
  }, [])

  // Only show modules relevant to the active branch type, the user's role,
  // and any per-user permission override
  const visibleSections = visibleSectionsFor(
    user?.current_branch?.branch_type,
    user?.current_branch?.role ?? user?.role,
    myPerms,
  )

  // ── Real notifications (refreshed every minute) ─────────────────────────────
  const [notifs, setNotifs] = useState<Notif[]>([])
  const loadNotifs = useCallback(() => {
    api.get('/dashboard/notifications')
      .then(r => setNotifs(r.data.data))
      .catch(() => {})
  }, [])
  useEffect(() => {
    loadNotifs()
    const timer = setInterval(loadNotifs, 60_000)
    return () => clearInterval(timer)
  }, [loadNotifs])

  // ── Global search (Ctrl+K) — pages + guests ─────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [guestHits, setGuestHits] = useState<{ id: string; first_name: string; last_name: string; phone?: string }[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 60)
    else { setQ(''); setGuestHits([]) }
  }, [searchOpen])

  // Debounced live guest search
  useEffect(() => {
    if (q.trim().length < 2) { setGuestHits([]); return }
    const timer = setTimeout(() => {
      api.get(`/hotel/guests?q=${encodeURIComponent(q.trim())}`)
        .then(r => setGuestHits(r.data.data.slice(0, 5)))
        .catch(() => setGuestHits([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  // Pages the current user can see, filtered by the query
  const pageHits = q.trim()
    ? [
        { path: '/dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard size={14}/> },
        ...visibleSections.flatMap(s => s.items.map(i => ({ path: i.path, label: t(i.label), icon: i.icon }))),
      ].filter(p => p.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 7)
    : []

  const goTo = (path: string) => { setSearchOpen(false); navigate(path) }

  const currentLabel = (() => {
    for (const s of ALL_SECTIONS) {
      const item = s.items.find(i => pathname === i.path || pathname.startsWith(i.path + '/'))
      if (item) return t(item.label)
    }
    return t('nav.dashboard')
  })()

  const breadcrumbs = pathname.split('/').filter(Boolean).map((seg, i, arr) => ({
    label: SEGMENT_KEY[seg]
      ? t(SEGMENT_KEY[seg])
      : seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
    path: '/' + arr.slice(0, i + 1).join('/'),
  }))

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const Sidebar = (
    <aside className="flex h-full w-[252px] flex-col bg-[#1a1a2e] border-r border-white/[0.05]">

      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
        <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <Building2 size={17} className="text-white" />
          </div>
          <div className="leading-none">
            <p className="text-[14px] font-extrabold tracking-tight text-white">
              Hospitality<span className="text-indigo-400"> ERP</span>
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#55557a]">
              {user?.organization_name ?? 'Management System'}
            </p>
          </div>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="ml-auto shrink-0 p-1 text-[#55557a] hover:text-white lg:hidden">
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Dashboard */}
        <Link to="/dashboard" onClick={() => setMobileOpen(false)}
          className={`relative mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all group ${
            pathname === '/dashboard' ? 'bg-indigo-500/20 text-white' : 'text-[#8888aa] hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          {pathname === '/dashboard' && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-indigo-400" />}
          <LayoutDashboard size={15} className={pathname === '/dashboard' ? 'text-indigo-400' : 'text-[#55557a] group-hover:text-[#8888aa]'} />
          {t('nav.dashboard')}
          {pathname === '/dashboard' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />}
        </Link>

        <div className="mb-3 h-px bg-white/[0.05]" />

        {visibleSections.map(s => (
          <NavSection key={s.key} section={s} onClose={() => setMobileOpen(false)} />
        ))}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-[12px] font-extrabold text-white shadow">
            {initials(user)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-white leading-tight">{displayName(user)}</p>
            <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9.5px] font-bold ${roleColor(user)}`}>
              {roleLabel(user)}
            </span>
          </div>
          <button onClick={toggleTheme} aria-label="Toggle theme"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#55557a] hover:bg-white/10 hover:text-white transition-colors">
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
        <button onClick={() => setSignOutOpen(true)}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#8888aa] transition-colors hover:bg-red-500/10 hover:text-red-400">
          <LogOut size={14} /> {t('signout.title')}
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f5fa] dark:bg-[#111827]">

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)} />
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">{Sidebar}</div>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ x: -252 }} animate={{ x: 0 }} exit={{ x: -252 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed inset-y-0 left-0 z-50 lg:hidden">
            {Sidebar}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* Navbar */}
        <header className="flex h-[64px] shrink-0 items-center gap-4 border-b border-neutral-200/70 bg-white/90 px-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#1c2333]/90 z-30 lg:px-7">

          {/* Mobile menu */}
          <button onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.06] lg:hidden">
            <Menu size={18} />
          </button>

          {/* Breadcrumb */}
          <nav className="hidden sm:flex min-w-0 items-center gap-2 text-[13px]">
            <Link to="/dashboard" className="shrink-0 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors">{t('nav.home')}</Link>
            {breadcrumbs.map((c, i) => (
              <span key={c.path} className="flex min-w-0 items-center gap-2">
                <ChevronRight size={12} className="shrink-0 text-neutral-300 dark:text-neutral-600 rtl:rotate-180" />
                {i === breadcrumbs.length - 1
                  ? <span className="truncate font-semibold text-neutral-700 dark:text-neutral-200">{c.label}</span>
                  : <Link to={c.path} className="shrink-0 capitalize text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors">{c.label}</Link>
                }
              </span>
            ))}
          </nav>

          {/* Mobile title */}
          <span className="sm:hidden text-[14px] font-bold text-neutral-800 dark:text-white">{currentLabel}</span>

          {/* ── Right actions — grouped with breathing room ── */}
          <div className="ml-auto flex shrink-0 items-center gap-2.5">

            {/* Group 1: context (branch + language) */}
            <BranchSwitcher />

            {/* Language picker */}
            <LangPicker />

            {/* Divider between context and tools */}
            <span className="mx-0.5 hidden h-6 w-px bg-neutral-200 dark:bg-white/[0.08] md:block" aria-hidden/>

            {/* Group 2: tools (search + notifications) */}
            <button aria-label={t('common.search')} onClick={() => setSearchOpen(true)} title="Search (Ctrl+K)"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/60 bg-neutral-50 text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400 transition-colors">
              <Search size={15} />
            </button>

            {/* Notifications — live data, refreshed every minute */}
            <div className="relative">
              <button onClick={() => { setNotifOpen(v => !v); if (!notifOpen) loadNotifs() }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/60 bg-neutral-50 text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400 transition-colors">
                <Bell size={15} />
                {notifs.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-[#1c2333]">
                    {notifs.length > 9 ? '9+' : notifs.length}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.12 }}
                      className="absolute right-0 top-11 z-30 w-[340px] overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-xl dark:border-white/[0.07] dark:bg-[#1c2333]"
                    >
                      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-white/[0.06]">
                        <p className="text-[13px] font-bold text-neutral-800 dark:text-white">{t('common.notifications')}</p>
                        {notifs.length > 0 && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                            {notifs.length} {t('common.new')}
                          </span>
                        )}
                      </div>
                      <div className="max-h-[380px] overflow-y-auto">
                        {notifs.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <Bell size={22} className="text-neutral-300 dark:text-neutral-600"/>
                            <p className="text-[12.5px] text-neutral-400">All caught up — no notifications</p>
                          </div>
                        ) : notifs.map((n, i) => {
                          const ic = NOTIF_ICON[n.kind] ?? NOTIF_ICON.booking
                          return (
                            <button key={i}
                              onClick={() => { setNotifOpen(false); navigate(n.link) }}
                              className="flex w-full items-start gap-3 border-b border-neutral-100/60 px-4 py-3 text-left hover:bg-neutral-50 dark:border-white/[0.04] dark:hover:bg-white/[0.03] last:border-none transition-colors">
                              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${ic.cls}`}>{ic.icon}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12.5px] font-medium leading-snug text-neutral-700 dark:text-neutral-200">{n.text}</p>
                                <p className="mt-0.5 text-[11px] text-neutral-400">{timeAgo(n.at)}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Divider before profile */}
            <span className="mx-0.5 hidden h-6 w-px bg-neutral-200 dark:bg-white/[0.08] md:block" aria-hidden/>

            {/* Avatar — profile menu */}
            <div className="relative">
              <button onClick={() => setAvatarOpen(v => !v)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-extrabold text-white shadow hover:opacity-90 transition-opacity">
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt={displayName(user)} className="h-full w-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
                  : initials(user)}
              </button>
              <AnimatePresence>
                {avatarOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setAvatarOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.12 }}
                      className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-xl dark:border-white/[0.07] dark:bg-[#1c2333]"
                    >
                      <div className="border-b border-neutral-100 px-4 py-3.5 dark:border-white/[0.06]">
                        <p className="truncate text-[13.5px] font-bold text-neutral-900 dark:text-white">{displayName(user)}</p>
                        <p className="truncate text-[11.5px] text-neutral-400">{user?.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${roleColor(user)}`}>{roleLabel(user)}</span>
                          {user?.current_branch && (
                            <span className="text-[10.5px] text-neutral-400">· {user.current_branch.branch_name}</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => { setAvatarOpen(false); toggleTheme() }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-medium text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors">
                        {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
                        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                      </button>
                      <button onClick={() => { setAvatarOpen(false); setSignOutOpen(true) }}
                        className="flex w-full items-center gap-2.5 border-t border-neutral-100 px-4 py-2.5 text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-white/[0.06] dark:text-rose-400 dark:hover:bg-rose-500/10 transition-colors">
                        <LogOut size={14}/> {t('signout.title')}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] p-5 lg:p-7">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Global search palette (Ctrl+K) ─────────────────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSearchOpen(false)}/>
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ duration: 0.12 }}
              className="relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#1c2333]"
            >
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3.5 dark:border-white/[0.06]">
                <Search size={16} className="shrink-0 text-neutral-400"/>
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const first = pageHits[0]?.path ?? (guestHits[0] ? '/hotel/guests' : null)
                      if (first) goTo(first)
                    }
                  }}
                  placeholder="Search pages, guests…"
                  className="flex-1 bg-transparent text-[14px] text-neutral-800 dark:text-white placeholder-neutral-400 outline-none"/>
                <kbd className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 dark:border-white/[0.1] dark:bg-white/[0.05]">ESC</kbd>
              </div>

              <div className="max-h-[50vh] overflow-y-auto py-2">
                {!q.trim() ? (
                  <p className="px-4 py-6 text-center text-[12.5px] text-neutral-400">
                    Type to search pages and guests — <b>Enter</b> opens the first result
                  </p>
                ) : pageHits.length === 0 && guestHits.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[12.5px] text-neutral-400">No results for “{q}”</p>
                ) : (
                  <>
                    {pageHits.length > 0 && (
                      <>
                        <p className="px-4 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pages</p>
                        {pageHits.map(p => (
                          <button key={p.path} onClick={() => goTo(p.path)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">{p.icon}</span>
                            <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{p.label}</span>
                            <CornerDownLeft size={12} className="ml-auto text-neutral-300 dark:text-neutral-600"/>
                          </button>
                        ))}
                      </>
                    )}
                    {guestHits.length > 0 && (
                      <>
                        <p className="px-4 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Guests</p>
                        {guestHits.map(g => (
                          <button key={g.id} onClick={() => goTo('/hotel/guests')}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-[10px] font-black text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                              {(g.first_name[0] + (g.last_name?.[0] ?? '')).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{g.first_name} {g.last_name}</p>
                              {g.phone && <p className="text-[11px] text-neutral-400">{g.phone}</p>}
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sign-out confirmation modal */}
      <SignOutModal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => logout()}
        user={user}
      />
    </div>
  )
}

