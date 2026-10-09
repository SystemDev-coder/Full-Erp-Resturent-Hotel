import { safeRouter } from '../utils/safeRouter'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  listBranches, getBranch, createBranch, updateBranch,
} from '../controllers/system/branchController'

export const branchRouter = safeRouter()
branchRouter.use(requireAuth)

branchRouter.get  ('/',    listBranches)
branchRouter.get  ('/:id', getBranch)
branchRouter.post ('/',    requireRole('org_admin'), createBranch)
branchRouter.put  ('/:id', requireRole('org_admin'), updateBranch)