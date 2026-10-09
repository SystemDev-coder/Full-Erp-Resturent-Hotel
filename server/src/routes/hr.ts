import { safeRouter } from '../utils/safeRouter'
import { requireAuth, requireModule } from '../middleware/auth'
import { enforceModulePermission } from '../middleware/permissions'
import {
  listStaff, getStaff, createStaff, updateStaff,
  deactivateStaff, activateStaff, deleteStaff,
} from '../controllers/hr/staffController'
import { setStaffPin } from '../controllers/restaurant/posController'
import {
  listPayrollRuns, createPayrollRun, approvePayroll,
} from '../controllers/hr/payrollController'
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  getPayrollLines,
} from '../controllers/hr/departmentController'

export const hrRouter = safeRouter()
hrRouter.use(requireAuth)
hrRouter.use(requireModule('hr'))
hrRouter.use(enforceModulePermission('hr'))

// ── Departments ───────────────────────────────────────────────────────────────
hrRouter.get   ('/departments',       listDepartments)
hrRouter.post  ('/departments',       createDepartment)
hrRouter.put   ('/departments/:id',   updateDepartment)
hrRouter.delete('/departments/:id',   deleteDepartment)

// ── Staff ─────────────────────────────────────────────────────────────────────
hrRouter.get   ('/staff',                listStaff)
hrRouter.get   ('/staff/:id',            getStaff)
hrRouter.post  ('/staff',                createStaff)
hrRouter.put   ('/staff/:id',            updateStaff)
hrRouter.patch ('/staff/:id/deactivate', deactivateStaff)
hrRouter.patch ('/staff/:id/activate',   activateStaff)
hrRouter.patch ('/staff/:id/pin',        setStaffPin)
hrRouter.delete('/staff/:id',            deleteStaff)

// ── Payroll ───────────────────────────────────────────────────────────────────
hrRouter.get   ('/payroll',              listPayrollRuns)
hrRouter.post  ('/payroll',              createPayrollRun)
hrRouter.patch ('/payroll/:id/approve',  approvePayroll)
hrRouter.get   ('/payroll/:id/lines',    getPayrollLines)
