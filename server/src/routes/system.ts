import { safeRouter } from '../utils/safeRouter'
import { requireAuth, requireRole } from '../middleware/auth'
import { listModules, toggleModule } from '../controllers/system/moduleController'
import { listAuditLogs, logPrintEvent } from '../controllers/system/auditController'
import {
  listFiscalYears, createFiscalYear, closeFiscalYear, reopenFiscalYear, getCurrentFiscalYear,
} from '../controllers/system/fiscalYearController'
import { getOrganization, updateOrganization } from '../controllers/system/organizationController'
import { getSystemReport, getSystemReportDetail } from '../controllers/system/systemReportController'
import { getBackups, createBackup, downloadBackup, deleteBackup } from '../controllers/system/backupController'
import { runImport } from '../controllers/system/importController'
import { getOnlineBookingSettings, updateOnlineBookingSettings } from '../controllers/hotel/onlineBookingController'
import {
  getNotificationSettings, updateNotificationSettings, listNotifications, sendTestNotification,
  runReminders, markNotificationSent, retryNotification,
} from '../controllers/system/notificationController'

export const systemRouter = safeRouter()
systemRouter.use(requireAuth)

// ── Organization (Company Info) ───────────────────────────────────────────────
systemRouter.get  ('/organization',  getOrganization)
systemRouter.put  ('/organization',  requireRole('org_admin'), updateOrganization)

// ── Module Config ─────────────────────────────────────────────────────────────
systemRouter.get  ('/modules',       listModules)
systemRouter.patch('/modules/:key',  requireRole('org_admin'), toggleModule)

// ── Audit Log ─────────────────────────────────────────────────────────────────
systemRouter.get  ('/audit',         requireRole('org_admin', 'branch_manager'), listAuditLogs)
systemRouter.post ('/audit/print',   logPrintEvent)

// ── Fiscal Years ──────────────────────────────────────────────────────────────
systemRouter.get  ('/fiscal-years',          listFiscalYears)
systemRouter.get  ('/fiscal-years/current',  getCurrentFiscalYear)
systemRouter.post ('/fiscal-years',          requireRole('org_admin'), createFiscalYear)
systemRouter.patch('/fiscal-years/:id/close',requireRole('org_admin'), closeFiscalYear)
systemRouter.patch('/fiscal-years/:id/reopen',requireRole('org_admin'), reopenFiscalYear)

// ── System report (administrators / branch managers) ─────────────────────────
systemRouter.get  ('/reports/summary',       requireRole('org_admin', 'branch_manager'), getSystemReport)
systemRouter.get  ('/reports/detail/:kind',  requireRole('org_admin', 'branch_manager'), getSystemReportDetail)

// ── Database backups (administrators only) ───────────────────────────────────
systemRouter.get   ('/backups',              requireRole('org_admin'), getBackups)
systemRouter.post  ('/backups',              requireRole('org_admin'), createBackup)
systemRouter.get   ('/backups/:name/download', requireRole('org_admin'), downloadBackup)
systemRouter.delete('/backups/:name',        requireRole('org_admin'), deleteBackup)

// ── Guest notifications (WhatsApp / SMS) ─────────────────────────────────────
systemRouter.get   ('/notifications/settings',  requireRole('org_admin'), getNotificationSettings)
systemRouter.put   ('/notifications/settings',  requireRole('org_admin'), updateNotificationSettings)
systemRouter.get   ('/notifications',           requireRole('org_admin', 'branch_manager'), listNotifications)
systemRouter.post  ('/notifications/test',      requireRole('org_admin'), sendTestNotification)
systemRouter.post  ('/notifications/run-reminders', requireRole('org_admin'), runReminders)
systemRouter.post  ('/notifications/:id/mark-sent', requireRole('org_admin', 'branch_manager'), markNotificationSent)
systemRouter.post  ('/notifications/:id/retry', requireRole('org_admin', 'branch_manager'), retryNotification)

// ── Bulk import from Excel / CSV (rows are parsed in the browser) ────────────
systemRouter.post  ('/import/:kind',            runImport)

// ── Online booking page settings ─────────────────────────────────────────────
systemRouter.get   ('/online-booking',          requireRole('org_admin', 'branch_manager'), getOnlineBookingSettings)
systemRouter.put   ('/online-booking',          requireRole('org_admin'), updateOnlineBookingSettings)
