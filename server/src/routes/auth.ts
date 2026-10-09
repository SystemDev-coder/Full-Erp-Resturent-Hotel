import { safeRouter } from '../utils/safeRouter'
import { login, logout, refreshToken, getMe, getMyPermissions, switchBranch, lockSession, unlockSession } from '../controllers/system/authController'
import { requireAuth } from '../middleware/auth'
import { getTwoFactorStatus, startTwoFactorSetup, enableTwoFactor, disableTwoFactor, verifyTwoFactorLogin } from '../controllers/system/twoFactorController'

export const authRouter = safeRouter()

authRouter.post('/login',         login)
authRouter.post('/logout',        logout)
authRouter.post('/refresh',       refreshToken)
authRouter.get ('/me',            requireAuth, getMe)
authRouter.get ('/my-permissions', requireAuth, getMyPermissions)
authRouter.post('/switch-branch', requireAuth, switchBranch)
authRouter.get ('/2fa',           requireAuth, getTwoFactorStatus)
authRouter.post('/2fa/setup',     requireAuth, startTwoFactorSetup)
authRouter.post('/2fa/enable',    requireAuth, enableTwoFactor)
authRouter.post('/2fa/disable',   requireAuth, disableTwoFactor)
authRouter.post('/2fa/verify',    verifyTwoFactorLogin)      // sign-in step 2 (no session yet)
authRouter.post('/lock',          requireAuth, lockSession)
authRouter.post('/unlock',        requireAuth, unlockSession)
