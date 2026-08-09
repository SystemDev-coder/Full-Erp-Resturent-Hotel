export type ERPRole =
  | 'org_admin'
  | 'branch_manager'
  | 'receptionist'
  | 'housekeeper'
  | 'hotel_cashier'
  | 'cashier'
  | 'waiter'
  | 'chef'
  | 'bar_staff'
  | 'accountant'
  | 'inventory_manager'
  | 'report_viewer'

export type BranchType = 'hotel' | 'restaurant' | 'both'

export interface UserBranch {
  id: string
  branch_id: string
  branch_name: string
  branch_type: BranchType
  role: ERPRole
  is_primary: boolean
}

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  organization_id: string
  organization_name?: string
  organization_logo?: string
  current_branch?: UserBranch
  branches?: UserBranch[]
  // legacy compat
  name?: string
  role?: ERPRole
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterPayload {
  full_name: string
  email: string
  password: string
  organization_name: string
}

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => void
  /** Switch the active branch — gets a new branch-scoped token then reloads data. */
  switchBranch: (branchId: string) => Promise<void>
  /** Re-fetch the signed-in user's profile (e.g. after changing their photo). */
  refreshUser: () => Promise<void>
}

export const isOrgAdmin = (user: User | null) =>
  user?.current_branch?.role === 'org_admin' || user?.role === 'org_admin'

export const isBranchManager = (user: User | null) =>
  isOrgAdmin(user) || user?.current_branch?.role === 'branch_manager'

export const canAccessHotel = (user: User | null): boolean => {
  const bt = user?.current_branch?.branch_type
  return bt === 'hotel' || bt === 'both'
}

export const canAccessRestaurant = (user: User | null): boolean => {
  const bt = user?.current_branch?.branch_type
  return bt === 'restaurant' || bt === 'both'
}

export const ROLE_LABELS: Record<ERPRole, string> = {
  org_admin:         'Org Admin',
  branch_manager:    'Branch Manager',
  receptionist:      'Receptionist',
  housekeeper:       'Housekeeper',
  hotel_cashier:     'Hotel Cashier',
  cashier:           'Cashier',
  waiter:            'Waiter',
  chef:              'Chef',
  bar_staff:         'Bar Staff',
  accountant:        'Accountant',
  inventory_manager: 'Inventory Mgr',
  report_viewer:     'Report Viewer',
}

export const ROLE_COLORS: Record<ERPRole, string> = {
  org_admin:         'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  branch_manager:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  receptionist:      'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  housekeeper:       'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  hotel_cashier:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  cashier:           'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  waiter:            'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  chef:              'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  bar_staff:         'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
  accountant:        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  inventory_manager: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
  report_viewer:     'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
}