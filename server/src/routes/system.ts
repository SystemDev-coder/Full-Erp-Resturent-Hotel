import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { listModules, toggleModule } from '../controllers/system/moduleController'
import { listAuditLogs, logPrintEvent } from '../controllers/system/auditController'
import {
  listFiscalYears, createFiscalYear, closeFiscalYear, getCurrentFiscalYear,
} from '../controllers/system/fiscalYearController'
import { getOrganization, updateOrganization } from '../controllers/system/organizationController'

export const systemRouter = Router()
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
