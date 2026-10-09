import { safeRouter } from '../utils/safeRouter'
import { requireAuth, requireModule } from '../middleware/auth'
import { enforceModulePermission, enforceSubmodulePermission } from '../middleware/permissions'
import {
  listAPInvoices, getAPInvoice, createAPInvoice, payAPInvoice, voidAPInvoice,
} from '../controllers/accounting/apInvoiceController'
import {
  listInvoices, getInvoice, createInvoice, voidInvoice, recordPayment,
} from '../controllers/accounting/invoiceController'
import {
  listTransactions, createTransaction,
} from '../controllers/accounting/transactionController'
import {
  listAccounts, listAccountBalances, createAccount, updateAccount, deleteAccount,
  listTransfers, createTransfer, updateTransfer, deleteTransfer,
  listOtherIncome, createOtherIncome, updateOtherIncome, deleteOtherIncome,
  listExpenses, createExpense, updateExpense, deleteExpense,
  listExpenseCharges, createExpenseCharge, updateExpenseCharge, payExpenseCharge, deleteExpenseCharge,
  deleteExpensePayment,
  listSalaryCharges, createSalaryCharge, updateSalaryCharge, paySalaryCharge, deleteSalaryCharge,
  deleteSalaryPayment,
  listAssets, createAsset, updateAsset, deleteAsset,
  listPosSessions, openPosSession, closePosSession,
} from '../controllers/accounting/accountController'
import {
  listGuestPayments, listSupplierPayments,
  listExpensePayments, listSalaryPayments,
  listProfitSharing, createProfitSharing, deleteProfitSharing,
  getReportsSummary,
} from '../controllers/accounting/financeExtrasController'
import {
  listReceipts, getReceipt, createReceipt, updateReceipt, deleteReceipt,
} from '../controllers/accounting/receiptController'

import { getReportDetail } from '../controllers/accounting/reportDetailController'
import { getFinanceReport } from '../controllers/accounting/financeReportController'
import { getVatReport } from '../controllers/accounting/vatReportController'
import { getWaiterSales } from '../controllers/accounting/waiterSalesController'

export const accountingRouter = safeRouter()
accountingRouter.use(requireAuth)
accountingRouter.use(requireModule('accounting'))
accountingRouter.use(enforceModulePermission('finance'))

// WHO may touch Finance, by role (not only by the optional per-user permission rows, which default to "allowed"):
//   • managers, accountant, hotel cashier ........ everything
//   • report viewer .............................. the reports (read only)
//   • cashier / waiter / bar / receptionist ...... only what the till needs: the account list and taking a payment
//   • everyone else (chef, housekeeper, inventory) nothing
// A waiter therefore cannot open Receipts, expenses, salaries, transfers or reports even by calling the API directly.
const FINANCE_FULL = ['org_admin', 'branch_manager', 'accountant', 'hotel_cashier']
const TILL_ROLES = ['cashier', 'waiter', 'bar_staff', 'receptionist']
const TILL_ALLOWED: [string, RegExp][] = [['GET', /^\/accounts\/?$/], ['POST', /^\/invoices\/[0-9a-f-]{36}\/payment\/?$/i]]
accountingRouter.use((req, res, next) => {
  const role = req.auth!.role
  if (FINANCE_FULL.includes(role)) return next()
  if (role === 'report_viewer' && req.method === 'GET' && req.path.startsWith('/reports')) return next()
  if (TILL_ROLES.includes(role) && TILL_ALLOWED.some(([m, re]) => m === req.method && re.test(req.path))) return next()
  return res.status(403).json({ success: false, message: 'Your role does not have access to Finance.' })
})

// Sub-page gates — one per nav item (Accounts / Receipts / Expenses / Salary).
// Assets, POS Sessions, Profit Sharing, AP Invoices and Reports live on the
// System page (org_admin only) or aren't yet used by any frontend page, so
// they stay under the module-level check only.
accountingRouter.use('/accounts',        enforceSubmodulePermission('finance', 'accounts'))
accountingRouter.use('/transfers',       enforceSubmodulePermission('finance', 'accounts'))
accountingRouter.use('/other-income',    enforceSubmodulePermission('finance', 'accounts'))
accountingRouter.use('/receipts',        enforceSubmodulePermission('finance', 'receipts'))
accountingRouter.use('/invoices',        enforceSubmodulePermission('finance', 'receipts'))
accountingRouter.use('/expenses',        enforceSubmodulePermission('finance', 'expenses'))
accountingRouter.use('/expense-charges', enforceSubmodulePermission('finance', 'expenses'))
accountingRouter.use('/expense-payments',enforceSubmodulePermission('finance', 'expenses'))
accountingRouter.use('/salary-charges',  enforceSubmodulePermission('finance', 'salary'))
accountingRouter.use('/salary-payments', enforceSubmodulePermission('finance', 'salary'))

// ── Accounts ────────────────────────────────────────────────────────────────
accountingRouter.get   ('/accounts',                      listAccounts)
accountingRouter.get   ('/accounts/balances',             listAccountBalances)
accountingRouter.post  ('/accounts',                      createAccount)
accountingRouter.put   ('/accounts/:id',                  updateAccount)
accountingRouter.delete('/accounts/:id',                  deleteAccount)

// ── Invoices ────────────────────────────────────────────────────────────────
accountingRouter.get  ('/invoices',                       listInvoices)
accountingRouter.get  ('/invoices/:id',                   getInvoice)
accountingRouter.post ('/invoices',                       createInvoice)
accountingRouter.patch('/invoices/:id/void',              voidInvoice)
accountingRouter.post ('/invoices/:id/payment',           recordPayment)

// ── Transactions ─────────────────────────────────────────────────────────────
accountingRouter.get  ('/transactions',                   listTransactions)
accountingRouter.post ('/transactions',                   createTransaction)

// ── Transfers ────────────────────────────────────────────────────────────────
accountingRouter.get   ('/transfers',                     listTransfers)
accountingRouter.post  ('/transfers',                     createTransfer)
accountingRouter.put   ('/transfers/:id',                 updateTransfer)
accountingRouter.delete('/transfers/:id',                 deleteTransfer)

// ── Other Income ─────────────────────────────────────────────────────────────
accountingRouter.get   ('/other-income',                  listOtherIncome)
accountingRouter.post  ('/other-income',                  createOtherIncome)
accountingRouter.put   ('/other-income/:id',              updateOtherIncome)
accountingRouter.delete('/other-income/:id',              deleteOtherIncome)

// ── Expenses ─────────────────────────────────────────────────────────────────
accountingRouter.get   ('/expenses',                      listExpenses)
accountingRouter.post  ('/expenses',                      createExpense)
accountingRouter.put   ('/expenses/:id',                  updateExpense)
accountingRouter.delete('/expenses/:id',                  deleteExpense)
accountingRouter.get   ('/expense-charges',               listExpenseCharges)
accountingRouter.post  ('/expense-charges',               createExpenseCharge)
accountingRouter.put   ('/expense-charges/:id',           updateExpenseCharge)
accountingRouter.post  ('/expense-charges/:id/pay',       payExpenseCharge)
accountingRouter.delete('/expense-charges/:id',           deleteExpenseCharge)
accountingRouter.delete('/expense-payments/:id',          deleteExpensePayment)

// ── Salary ───────────────────────────────────────────────────────────────────
accountingRouter.get   ('/salary-charges',                listSalaryCharges)
accountingRouter.post  ('/salary-charges',                createSalaryCharge)
accountingRouter.put   ('/salary-charges/:id',            updateSalaryCharge)
accountingRouter.post  ('/salary-charges/:id/pay',        paySalaryCharge)
accountingRouter.delete('/salary-charges/:id',            deleteSalaryCharge)
accountingRouter.delete('/salary-payments/:id',           deleteSalaryPayment)

// ── Assets ───────────────────────────────────────────────────────────────────
accountingRouter.get   ('/assets',                        listAssets)
accountingRouter.post  ('/assets',                        createAsset)
accountingRouter.patch ('/assets/:id',                    updateAsset)
accountingRouter.delete('/assets/:id',                    deleteAsset)

// ── POS Sessions ─────────────────────────────────────────────────────────────
accountingRouter.get  ('/pos-sessions',                   listPosSessions)
accountingRouter.post ('/pos-sessions',                   openPosSession)
accountingRouter.patch('/pos-sessions/:id/close',         closePosSession)

// ── AP Invoices (Supplier Bills) ──────────────────────────────────────────────
accountingRouter.get  ('/ap-invoices',           listAPInvoices)
accountingRouter.get  ('/ap-invoices/:id',        getAPInvoice)
accountingRouter.post ('/ap-invoices',            createAPInvoice)
accountingRouter.post ('/ap-invoices/:id/pay',    payAPInvoice)
accountingRouter.patch('/ap-invoices/:id/void',   voidAPInvoice)

// ── Payment listings (Receipts / Expense / Salary tabs) ──────────────────────
accountingRouter.get  ('/guest-payments',         listGuestPayments)
accountingRouter.get  ('/supplier-payments',      listSupplierPayments)
accountingRouter.get  ('/expense-payments',       listExpensePayments)
accountingRouter.get  ('/salary-payments',        listSalaryPayments)

// ── Receipts (general receipt documents, with line items) ────────────────────
accountingRouter.get   ('/receipts',              listReceipts)
accountingRouter.get   ('/receipts/:id',          getReceipt)
accountingRouter.post  ('/receipts',              createReceipt)
accountingRouter.put   ('/receipts/:id',          updateReceipt)
accountingRouter.delete('/receipts/:id',          deleteReceipt)

// ── Profit Sharing ────────────────────────────────────────────────────────────
accountingRouter.get   ('/profit-sharing',        listProfitSharing)
accountingRouter.post  ('/profit-sharing',        createProfitSharing)
accountingRouter.delete('/profit-sharing/:id',    deleteProfitSharing)

// ── Reports ───────────────────────────────────────────────────────────────────
accountingRouter.get  ('/reports/summary',        getReportsSummary)
accountingRouter.get  ('/reports/finance',         getFinanceReport)
accountingRouter.get  ('/reports/vat',             getVatReport)
accountingRouter.get  ('/reports/waiters',         getWaiterSales)
accountingRouter.get  ('/reports/detail/:kind',   getReportDetail)
