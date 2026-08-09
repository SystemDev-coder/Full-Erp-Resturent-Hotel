import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { enforceModulePermission, enforceSubmodulePermission } from '../middleware/permissions'
import { listStock, adjustStock, getLowStock } from '../controllers/inventory/stockController'
import {
  listPOs, getPO, createPO, receivePO, cancelPO, deletePO,
  listPurchaseLines, listGoodsReceipts, listGoodsReceiptLines,
} from '../controllers/inventory/purchaseController'
import {
  listItems, getItem, createItem, updateItem, deleteItem,
  listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier,
  listMovements, listRecipes,
} from '../controllers/inventory/itemController'

export const inventoryRouter = Router()
inventoryRouter.use(requireAuth)
inventoryRouter.use(enforceModulePermission('inventory'))

// Sub-page gates — one per nav item; stock adjustments/movements and recipes
// are Items-page features so they share the 'items' gate.
inventoryRouter.use('/items',           enforceSubmodulePermission('inventory', 'items'))
inventoryRouter.use('/stock',           enforceSubmodulePermission('inventory', 'items'))
inventoryRouter.use('/recipes',         enforceSubmodulePermission('inventory', 'items'))
inventoryRouter.use('/warehouses',      enforceSubmodulePermission('inventory', 'warehouses'))
inventoryRouter.use('/suppliers',       enforceSubmodulePermission('inventory', 'suppliers'))
inventoryRouter.use('/purchase-orders', enforceSubmodulePermission('inventory', 'orders'))

// ── Items (Ingredients / Supplies) ───────────────────────────────────────────
inventoryRouter.get   ('/items',          listItems)
inventoryRouter.get   ('/items/:id',      getItem)
inventoryRouter.post  ('/items',          createItem)
inventoryRouter.put   ('/items/:id',      updateItem)
inventoryRouter.delete('/items/:id',      deleteItem)

// ── Warehouses ────────────────────────────────────────────────────────────────
inventoryRouter.get   ('/warehouses',     listWarehouses)
inventoryRouter.post  ('/warehouses',     createWarehouse)
inventoryRouter.put   ('/warehouses/:id', updateWarehouse)
inventoryRouter.delete('/warehouses/:id', deleteWarehouse)

// ── Suppliers ─────────────────────────────────────────────────────────────────
inventoryRouter.get   ('/suppliers',      listSuppliers)
inventoryRouter.get   ('/suppliers/:id',  getSupplier)
inventoryRouter.post  ('/suppliers',      createSupplier)
inventoryRouter.put   ('/suppliers/:id',  updateSupplier)
inventoryRouter.delete('/suppliers/:id',  deleteSupplier)

// ── Stock ─────────────────────────────────────────────────────────────────────
inventoryRouter.get   ('/stock',                      listStock)
inventoryRouter.get   ('/stock/low',                  getLowStock)
inventoryRouter.post  ('/stock/adjust',               adjustStock)
inventoryRouter.get   ('/stock/movements',            listMovements)

// ── Recipes ───────────────────────────────────────────────────────────────────
inventoryRouter.get   ('/recipes',        listRecipes)

// ── Purchase Orders ───────────────────────────────────────────────────────────
inventoryRouter.get   ('/purchase-orders',             listPOs)
inventoryRouter.get   ('/purchase-orders/:id',         getPO)
inventoryRouter.post  ('/purchase-orders',             createPO)
inventoryRouter.patch ('/purchase-orders/:id/receive', receivePO)
inventoryRouter.patch ('/purchase-orders/:id/cancel',  cancelPO)
inventoryRouter.delete('/purchase-orders/:id',         deletePO)
inventoryRouter.get   ('/purchase-lines',              listPurchaseLines)
inventoryRouter.get   ('/goods-receipts',              listGoodsReceipts)
inventoryRouter.get   ('/goods-receipt-lines',         listGoodsReceiptLines)

