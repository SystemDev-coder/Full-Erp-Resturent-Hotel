import { Router } from 'express'
import { login, logout, refreshToken, getMe, getMyPermissions, switchBranch } from '../controllers/system/authController'
import { requireAuth } from '../middleware/auth'

export const authRouter = Router()

authRouter.post('/login',         login)
authRouter.post('/logout',        logout)
authRouter.post('/refresh',       refreshToken)
authRouter.get ('/me',            requireAuth, getMe)
authRouter.get ('/my-permissions', requireAuth, getMyPermissions)
authRouter.post('/switch-branch', requireAuth, switchBranch)