import type { ERPRole } from '@/types/auth'

export interface ModulePermission { key: string; label: string; roles: ERPRole[] }

const MANAGERS: ERPRole[] = ['org_admin', 'branch_manager']

// Mirrors the section-level role gates in components/Layout.tsx
// (visibleSectionsFor / ALL_SECTIONS) — kept as an explicit, readable table
// so Settings → Roles/Permissions can display real access rules instead of
// duplicating the nav config's JSX-embedded arrays.
export const MODULE_PERMISSIONS: ModulePermission[] = [
  { key: 'hotel',      label: 'Hotel',      roles: [...MANAGERS, 'receptionist', 'housekeeper', 'hotel_cashier'] },
  { key: 'restaurant', label: 'Restaurant', roles: [...MANAGERS, 'cashier', 'waiter', 'chef', 'bar_staff'] },
  { key: 'inventory',  label: 'Inventory',  roles: [...MANAGERS, 'inventory_manager', 'chef'] },
  { key: 'finance',    label: 'Finance',    roles: [...MANAGERS, 'accountant', 'hotel_cashier'] },
  { key: 'hr',         label: 'HR',         roles: [...MANAGERS, 'accountant'] },
  { key: 'system',     label: 'System',     roles: [...MANAGERS, 'accountant', 'report_viewer'] },
]

export const ALL_ROLES: ERPRole[] = [
  'org_admin', 'branch_manager', 'receptionist', 'housekeeper', 'hotel_cashier',
  'cashier', 'waiter', 'chef', 'bar_staff', 'accountant', 'inventory_manager', 'report_viewer',
]

export function roleHasModule(role: ERPRole, moduleKey: string): boolean {
  const mod = MODULE_PERMISSIONS.find(m => m.key === moduleKey)
  return !!mod && mod.roles.includes(role)
}
