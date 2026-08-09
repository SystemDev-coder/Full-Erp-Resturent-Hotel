import { Request, Response, NextFunction } from 'express'
import { query } from '../db/pool'

// Per-user module permission enforcement.
//
// Three independent flags per module (stored in user_permission; no row =
// everything allowed via the user's role):
//   can_view   — read anything in the module (GET/HEAD)
//   can_edit   — create and update (POST/PUT/PATCH)
//   can_delete — delete (DELETE)
//
// org_admin always bypasses — otherwise an admin could lock themselves (or
// every admin) out of the system with no way back in.
export function enforceModulePermission(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth
    if (!auth) return res.status(401).json({ success: false, message: 'Not authenticated' })
    if (auth.role === 'org_admin') return next()

    try {
      const { rows } = await query(
        `SELECT can_view, can_edit, can_delete FROM user_permission
         WHERE user_id = $1 AND module_key = $2`,
        [auth.userId, moduleKey]
      )
      const perm = rows[0] ?? { can_view: true, can_edit: true, can_delete: true }

      if (!perm.can_view) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this module. Please contact your administrator.',
        })
      }
      if (req.method === 'DELETE' && !perm.can_delete) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete in this module. Please contact your administrator.',
        })
      }
      const isWrite = ['POST', 'PUT', 'PATCH'].includes(req.method)
      if (isWrite && !perm.can_edit) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create or edit in this module. Please contact your administrator.',
        })
      }
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

// Finer-grained sibling of enforceModulePermission — gates a single page/section
// within a module (e.g. hotel→rooms vs hotel→bookings), stored in
// user_submodule_permission (no row = full access, same "no row = allowed"
// convention as the module-level table). Mount with router.use('/rooms', ...)
// on the specific path prefix, after the module-level enforceModulePermission
// is already applied for the whole router.
//
// Deliberately only blocks writes (POST/PUT/PATCH/DELETE), never GET/HEAD:
// several pages read another section's data as a picker (Bookings reads
// guests + rate-plans, POS and the Orders/Tables page both read the menu) —
// blocking those reads here would break booking/order creation for anyone
// whose admin hid an unrelated section. "Hiding" the section is instead
// enforced by the frontend nav (see visibleSectionsFor in Layout.tsx), which
// is where can_view is actually consulted; here we only stop the user from
// creating/editing/deleting once they're inside a section they shouldn't be.
export function enforceSubmodulePermission(moduleKey: string, submoduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth
    if (!auth) return res.status(401).json({ success: false, message: 'Not authenticated' })
    if (auth.role === 'org_admin') return next()
    if (req.method === 'GET' || req.method === 'HEAD') return next()

    try {
      const { rows } = await query(
        `SELECT can_edit, can_delete FROM user_submodule_permission
         WHERE user_id = $1 AND module_key = $2 AND submodule_key = $3`,
        [auth.userId, moduleKey, submoduleKey]
      )
      const perm = rows[0] ?? { can_edit: true, can_delete: true }

      if (req.method === 'DELETE' && !perm.can_delete) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete in this section. Please contact your administrator.',
        })
      }
      if (req.method !== 'DELETE' && !perm.can_edit) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create or edit in this section. Please contact your administrator.',
        })
      }
      return next()
    } catch (err) {
      return next(err)
    }
  }
}
