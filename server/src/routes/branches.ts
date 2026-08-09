import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  listBranches, getBranch, createBranch, updateBranch,
} from '../controllers/system/branchController'

export const branchRouter = Router()
branchRouter.use(requireAuth)

branchRouter.get  ('/',    listBranches)
branchRouter.get  ('/:id', getBranch)
branchRouter.post ('/',    requireRole('org_admin'), createBranch)
branchRouter.put  ('/:id', requireRole('org_admin'), updateBranch)