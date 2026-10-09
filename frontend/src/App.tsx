import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PublicRoute } from './components/PublicRoute'
import { Layout } from './components/Layout'
import POSLayout from './components/POSLayout'
import { ApprovalHost } from './components/ApprovalHost'
import Login from './pages/Login'

// Dashboard
const Dashboard = lazy(() => import('./pages/Dashboard'))

// Hotel
const Bookings     = lazy(() => import('./pages/hotel/Bookings'))
const Rooms        = lazy(() => import('./pages/hotel/Rooms'))
const Guests       = lazy(() => import('./pages/hotel/Guests'))
const Housekeeping = lazy(() => import('./pages/hotel/Housekeeping'))
const BookingStatement = lazy(() => import('./pages/hotel/BookingStatement'))

// Restaurant
const POS          = lazy(() => import('./pages/restaurant/POS'))
const OrdersTables = lazy(() => import('./pages/restaurant/OrdersTables'))
const MenuMgmt     = lazy(() => import('./pages/restaurant/Menu'))
const Kitchen      = lazy(() => import('./pages/restaurant/Kitchen'))

// Inventory
const Suppliers      = lazy(() => import('./pages/inventory/Suppliers'))
const Warehouses     = lazy(() => import('./pages/inventory/Warehouses'))
const Items          = lazy(() => import('./pages/inventory/Items'))
const PurchaseOrders = lazy(() => import('./pages/inventory/PurchaseOrders'))
const StockControl   = lazy(() => import('./pages/inventory/StockControl'))

// Accounting / Finance
const Accounts     = lazy(() => import('./pages/accounting/Accounts'))
const Receipts     = lazy(() => import('./pages/accounting/Receipts'))
const Expenses     = lazy(() => import('./pages/accounting/Expenses'))
const Salary       = lazy(() => import('./pages/accounting/Salary'))

// HR
const Staff   = lazy(() => import('./pages/hr/Staff'))

// System
const Settings     = lazy(() => import('./pages/system/Settings'))
const Systems      = lazy(() => import('./pages/system/Systems'))
const Reports      = lazy(() => import('./pages/Reports'))
const ModuleConfig = lazy(() => import('./pages/system/ModuleConfig'))

// Public
const MenuPage = lazy(() => import('./pages/public/MenuPage'))
const BookPage = lazy(() => import('./pages/public/BookPage'))

const PageLoader = () => (
  <div className="flex h-full min-h-[400px] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-indigo-500 dark:border-neutral-700 dark:border-t-indigo-400" />
  </div>
)

const S = (C: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}>
    <C />
  </Suspense>
)

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <ApprovalHost />
          <Routes>
            {/* ── Public routes (no auth) ───────────────────── */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/menu/:branchId" element={
              <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-orange-500"/></div>}>
                <MenuPage />
              </Suspense>
            }/>

            <Route path="/book/:branchId" element={
              <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-sky-500"/></div>}>
                <BookPage />
              </Suspense>
            }/>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* ── Printable guest statement (protected, no sidebar) ── */}
            <Route path="hotel/bookings/:id/statement" element={<ProtectedRoute>{S(BookingStatement)}</ProtectedRoute>} />

            {/* ── Standalone POS (protected, no sidebar) ───── */}
            <Route element={<ProtectedRoute><POSLayout /></ProtectedRoute>}>
              <Route path="restaurant/pos" element={S(POS)} />
            </Route>

            {/* ── Main app with sidebar layout ─────────────── */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              {/* Dashboard */}
              <Route path="dashboard" element={S(Dashboard)} />

              {/* Hotel */}
              <Route path="hotel/bookings"     element={S(Bookings)} />
              <Route path="hotel/rooms"        element={S(Rooms)} />
              <Route path="hotel/guests"       element={S(Guests)} />
              <Route path="hotel/housekeeping" element={S(Housekeeping)} />

              {/* Restaurant */}
              <Route path="restaurant/operations" element={S(OrdersTables)} />
              <Route path="restaurant/kitchen"    element={S(Kitchen)} />
              <Route path="restaurant/menu"       element={S(MenuMgmt)} />
              {/* Legacy paths → merged Orders & Tables page */}
              <Route path="restaurant/orders" element={<Navigate to="/restaurant/operations" replace />} />
              <Route path="restaurant/tables" element={<Navigate to="/restaurant/operations" replace />} />

              {/* Inventory */}
              <Route path="inventory/suppliers"  element={S(Suppliers)} />
              <Route path="inventory/warehouses" element={S(Warehouses)} />
              <Route path="inventory/items"      element={S(Items)} />
              <Route path="inventory/orders"     element={S(PurchaseOrders)} />
              <Route path="inventory/stock-control" element={S(StockControl)} />
              {/* Legacy path → Items page (Stock Balance tab lives there) */}
              <Route path="inventory/stock" element={<Navigate to="/inventory/items" replace />} />

              {/* Finance */}
              <Route path="accounting/accounts"     element={S(Accounts)} />
              <Route path="accounting/receipts"     element={S(Receipts)} />
              <Route path="accounting/expenses"     element={S(Expenses)} />
              <Route path="accounting/salary"       element={S(Salary)} />
              <Route path="accounting/invoices"     element={<Navigate to="/accounting/receipts" replace />} />
              <Route path="accounting/transactions" element={<Navigate to="/accounting/receipts" replace />} />

              {/* HR */}
              <Route path="hr/staff"   element={S(Staff)} />
              <Route path="hr/payroll" element={<Navigate to="/hr/staff" replace />} />

              {/* System */}
              <Route path="system/settings" element={S(Settings)} />
              <Route path="system/systems"  element={S(Systems)} />
              <Route path="reports"         element={S(Reports)} />
              <Route path="system/modules"  element={S(ModuleConfig)} />
              {/* Legacy paths → Settings tabs */}
              <Route path="system/users" element={<Navigate to="/system/settings" replace />} />
              <Route path="system/audit" element={<Navigate to="/system/settings" replace />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
