import { safeRouter } from '../utils/safeRouter'
import { resetUserTwoFactor } from '../controllers/system/twoFactorController'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  listUsers, inviteUser, updateUserBranch, deactivateUser, activateUser, unlockUser,
  updateUser, deleteUser, lockUser, revokeUserSessions,
  getUserPermissions, setUserPermissions,
  getUserSubmodulePermissions, setUserSubmodulePermissions,
  resetUserPassword,
} from '../controllers/system/userController'

export const usersRouter = safeRouter()
usersRouter.use(requireAuth)
usersRouter.use(requireRole('org_admin', 'branch_manager'))

usersRouter.get   ('/',                    listUsers)
usersRouter.post  ('/invite',              inviteUser)
usersRouter.put   ('/:id',                 updateUser)
usersRouter.delete('/:id',                 deleteUser)
usersRouter.patch ('/:id/branch-role',     updateUserBranch)
usersRouter.patch ('/:id/deactivate',      deactivateUser)
usersRouter.patch ('/:id/activate',        activateUser)
usersRouter.patch ('/:id/lock',            lockUser)
usersRouter.patch ('/:id/unlock',          unlockUser)
usersRouter.post  ('/:id/revoke-sessions', revokeUserSessions)
usersRouter.get   ('/:id/permissions',     getUserPermissions)
usersRouter.put   ('/:id/permissions',     setUserPermissions)
usersRouter.get   ('/:id/submodule-permissions', getUserSubmodulePermissions)
usersRouter.put   ('/:id/submodule-permissions', setUserSubmodulePermissions)
usersRouter.patch ('/:id/password',        resetUserPassword)
usersRouter.post  ('/:id/2fa/reset',       requireRole('org_admin'), resetUserTwoFactor)