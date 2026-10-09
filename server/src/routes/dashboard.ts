import { safeRouter } from '../utils/safeRouter'
import { requireAuth } from '../middleware/auth'
import { enforceModulePermission } from '../middleware/permissions'
import { getDashboardSummary, getDashboardDetail } from '../controllers/system/dashboardSummaryController'
import { getDashboardStats, getRevenueChart, getOccupancySnapshot, getNotifications } from '../controllers/system/dashboardController'

export const dashboardRouter = safeRouter()
dashboardRouter.use(requireAuth)
dashboardRouter.use(enforceModulePermission('dashboard'))

dashboardRouter.get('/stats',         getDashboardStats)
dashboardRouter.get('/revenue',       getRevenueChart)
dashboardRouter.get('/occupancy',     getOccupancySnapshot)
dashboardRouter.get('/notifications', getNotifications)
dashboardRouter.get('/summary',       getDashboardSummary)
dashboardRouter.get('/detail/:kind',  getDashboardDetail)
