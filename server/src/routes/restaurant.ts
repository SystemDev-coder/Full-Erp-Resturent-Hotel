import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { enforceModulePermission, enforceSubmodulePermission } from '../middleware/permissions'
import {
  listOrders, getOrder, createOrder, addOrderLine,
  updateLineStatus, closeOrder, cancelOrder,
  updateOrderStatus, billOrder,
} from '../controllers/restaurant/orderController'
import { listPosStaff, verifyPosPin } from '../controllers/restaurant/posController'
import {
  listMenuCategories, listMenuItems, createMenuItem, updateMenuItem, toggleAvailable,
} from '../controllers/restaurant/menuController'
import {
  listTables, getTableStatus, updateTableStatus,
} from '../controllers/restaurant/tableController'
import {
  listReservations, createReservation, updateReservationStatus, cancelReservation,
} from '../controllers/restaurant/reservationController'
import {
  listModifierGroups, createModifierGroup, updateModifierGroup, deleteModifierGroup,
  addModifier, updateModifier, deleteModifier,
  linkModifierGroup, unlinkModifierGroup,
  getRecipe, upsertRecipeLine, deleteRecipeLine,
} from '../controllers/restaurant/modifierController'

export const restaurantRouter = Router()
restaurantRouter.use(requireAuth)
restaurantRouter.use(enforceModulePermission('restaurant'))

// Sub-page gates — one per nav item (POS / Orders & Tables / Menu); modifiers
// are menu configuration so they share the 'menu' gate.
restaurantRouter.use('/pos',           enforceSubmodulePermission('restaurant', 'pos'))
restaurantRouter.use('/orders',        enforceSubmodulePermission('restaurant', 'operations'))
restaurantRouter.use('/tables',        enforceSubmodulePermission('restaurant', 'operations'))
restaurantRouter.use('/reservations',  enforceSubmodulePermission('restaurant', 'operations'))
restaurantRouter.use('/menu',          enforceSubmodulePermission('restaurant', 'menu'))
restaurantRouter.use('/modifiers',     enforceSubmodulePermission('restaurant', 'menu'))

// ── POS staff login (waiter PIN) ──────────────────────────────────────────────
restaurantRouter.get   ('/pos/staff',                listPosStaff)
restaurantRouter.post  ('/pos/verify-pin',           verifyPosPin)

// ── Orders / POS ──────────────────────────────────────────────────────────────
restaurantRouter.get   ('/orders',                   listOrders)
restaurantRouter.get   ('/orders/:id',               getOrder)
restaurantRouter.post  ('/orders',                   createOrder)
restaurantRouter.post  ('/orders/:id/lines',         addOrderLine)
restaurantRouter.patch ('/orders/:id/lines/:lineId', updateLineStatus)
restaurantRouter.patch ('/orders/:id/status',        updateOrderStatus)
restaurantRouter.post  ('/orders/:id/bill',          billOrder)
restaurantRouter.patch ('/orders/:id/close',         closeOrder)
restaurantRouter.patch ('/orders/:id/cancel',        cancelOrder)

// ── Menu Categories & Items ───────────────────────────────────────────────────
restaurantRouter.get   ('/menu/categories',              listMenuCategories)
restaurantRouter.get   ('/menu/items',                   listMenuItems)
restaurantRouter.post  ('/menu/items',                   createMenuItem)
restaurantRouter.put   ('/menu/items/:id',               updateMenuItem)
restaurantRouter.patch ('/menu/items/:id/toggle',        toggleAvailable)
restaurantRouter.get   ('/menu/items/:menuItemId/recipe',  getRecipe)
restaurantRouter.post  ('/menu/items/:menuItemId/recipe',  upsertRecipeLine)
restaurantRouter.delete('/menu/items/recipe/:id',          deleteRecipeLine)

// ── Modifier Groups & Modifiers ───────────────────────────────────────────────
restaurantRouter.get   ('/modifiers/groups',                          listModifierGroups)
restaurantRouter.post  ('/modifiers/groups',                          createModifierGroup)
restaurantRouter.put   ('/modifiers/groups/:id',                      updateModifierGroup)
restaurantRouter.delete('/modifiers/groups/:id',                      deleteModifierGroup)
restaurantRouter.post  ('/modifiers/groups/:group_id/modifiers',      addModifier)
restaurantRouter.put   ('/modifiers/:id',                             updateModifier)
restaurantRouter.delete('/modifiers/:id',                             deleteModifier)
restaurantRouter.post  ('/menu/items/:itemId/modifier-groups/:groupId', linkModifierGroup)
restaurantRouter.delete('/menu/items/:itemId/modifier-groups/:groupId', unlinkModifierGroup)

// ── Tables ────────────────────────────────────────────────────────────────────
restaurantRouter.get   ('/tables',              listTables)
restaurantRouter.get   ('/tables/:id',          getTableStatus)
restaurantRouter.patch ('/tables/:id/status',   updateTableStatus)

// ── Reservations ──────────────────────────────────────────────────────────────
restaurantRouter.get   ('/reservations',              listReservations)
restaurantRouter.post  ('/reservations',              createReservation)
restaurantRouter.patch ('/reservations/:id/status',   updateReservationStatus)
restaurantRouter.patch ('/reservations/:id/cancel',   cancelReservation)
