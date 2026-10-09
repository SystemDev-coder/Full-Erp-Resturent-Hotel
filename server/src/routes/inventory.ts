import { safeRouter } from '../utils/safeRouter'
import { requireAuth, requireModule } from '../middleware/auth'
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

import {
  listWaste, recordWaste, listStockTakes, startStockTake, getStockTake, saveCounts,
  completeStockTake, cancelStockTake, getCosting, applyCosting,
} from '../controllers/inventory/stockControlController'

export const inventoryRouter = safeRouter()
inventoryRouter.use(requireAuth)
inventoryRouter.use(requireModule('inventory'))
inventoryRouter.use(enforceModulePermission('inventory'))

// Sub-page gates — one per nav item; stock adjustments/movements and recipes
// are Items-page features so they share the 'items' gate.
inventoryRouter.use('/items',           enforceSubmodulePermission('inventory', 'items'))
inventoryRouter.use('/stock',           enforceSubmodulePermission('inventory', 'items'))
inventoryRouter.use('/recipes',         enforceSubmodulePermission('inventory', 'items'))
for (const p of ['/waste', '/stock-takes', '/costing']) inventoryRouter.use(p, enforceSubmodulePermission('inventory', 'stock-control'))
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

// ── Stock control: waste, stock-take, recipe costing ─────────────────────────
inventoryRouter.get   ('/waste',                      listWaste)
inventoryRouter.post  ('/waste',                      recordWaste)
inventoryRouter.get   ('/stock-takes',                listStockTakes)
inventoryRouter.post  ('/stock-takes',                startStockTake)
inventoryRouter.get   ('/stock-takes/:id',            getStockTake)
inventoryRouter.patch ('/stock-takes/:id/counts',     saveCounts)
inventoryRouter.post  ('/stock-takes/:id/complete',   completeStockTake)
inventoryRouter.post  ('/stock-takes/:id/cancel',     cancelStockTake)
inventoryRouter.get   ('/costing',                    getCosting)
inventoryRouter.post  ('/costing/apply',              applyCosting)

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

