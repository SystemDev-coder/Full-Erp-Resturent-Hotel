import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { enforceModulePermission } from '../middleware/permissions'
import { getDashboardStats, getRevenueChart, getOccupancySnapshot, getNotifications } from '../controllers/system/dashboardController'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)
dashboardRouter.use(enforceModulePermission('dashboard'))

dashboardRouter.get('/stats',         getDashboardStats)
dashboardRouter.get('/revenue',       getRevenueChart)
dashboardRouter.get('/occupancy',     getOccupancySnapshot)
dashboardRouter.get('/notifications', getNotifications)