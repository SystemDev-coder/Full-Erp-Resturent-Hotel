import { Request, Response } from 'express'
import { pool, query } from '../../db/pool'
import { getPagination, sliceHasMore } from '../../utils/pagination'

// ── Inventory Items ───────────────────────────────────────────────────────────

export async function listItems(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { category, q } = req.query
  // Default 200 (the pagination cap) so the Purchase Order line-item picker,
  // which calls this without ?limit=, keeps seeing the full catalog it did
  // before. The Items DataTable's "Load More" explicitly sends limit=50.
  const { limit, offset } = getPagination(req, 200)
  let sql = `
    SELECT i.id, i.sku, i.name, i.category, i.item_type, i.unit_of_measure,
           i.reorder_level, i.is_active,
           COALESCE(SUM(sb.quantity_on_hand), 0) AS total_stock,
           COALESCE(AVG(sb.average_cost), 0) AS avg_cost
    FROM item i
    LEFT JOIN stock_balance sb ON sb.item_id = i.id
    WHERE i.organization_id = $1 AND i.deleted_at IS NULL`
  const params: any[] = [orgId]

  if (category) { params.push(category); sql += ` AND i.category = $${params.length}` }
  if (q)        { params.push(`%${q}%`); sql += ` AND (i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length})` }

  params.push(limit + 1, offset)
  sql += ` GROUP BY i.id ORDER BY i.category, i.name LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await query(sql, params)
  const { rows: page, hasMore } = sliceHasMore(rows, limit)
  return res.json({ success: true, data: page, hasMore })
}

export async function getItem(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT i.*, COALESCE(SUM(sb.quantity_on_hand), 0) AS total_stock
     FROM item i LEFT JOIN stock_balance sb ON sb.item_id = i.id
     WHERE i.id = $1 AND i.deleted_at IS NULL GROUP BY i.id`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Item not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createItem(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { sku, name, category = 'general', item_type = 'ingredient',
          unit_of_measure = 'piece', reorder_level = 0 } = req.body
  if (!sku || !name) return res.status(400).json({ success: false, message: 'sku and name are required' })

  const { rows } = await query(
    `INSERT INTO item (organization_id, sku, name, category, item_type, unit_of_measure, reorder_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, sku, name`,
    [orgId, sku, name, category, item_type, unit_of_measure, reorder_level]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateItem(req: Request, res: Response) {
  const { name, category, item_type, unit_of_measure, reorder_level, is_active } = req.body
  const { rows } = await query(
    `UPDATE item SET
       name             = COALESCE($1, name),
       category         = COALESCE($2, category),
       item_type        = COALESCE($3, item_type),
       unit_of_measure  = COALESCE($4, unit_of_measure),
       reorder_level    = COALESCE($5, reorder_level),
       is_active        = COALESCE($6, is_active)
     WHERE id = $7 AND deleted_at IS NULL RETURNING id, sku, name`,
    [name ?? null, category ?? null, item_type ?? null,
     unit_of_measure ?? null, reorder_level ?? null, is_active ?? null, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Item not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteItem(req: Request, res: Response) {
  await query(`UPDATE item SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

// ── Warehouses ────────────────────────────────────────────────────────────────

export async function listWarehouses(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, name, location_note, is_active FROM warehouse
     WHERE branch_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [req.auth!.branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createWarehouse(req: Request, res: Response) {
  const { name, location_note } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })
  const { rows } = await query(
    `INSERT INTO warehouse (branch_id, name, location_note)
     VALUES ($1,$2,$3) RETURNING id, name`,
    [req.auth!.branchId, name, location_note ?? null]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateWarehouse(req: Request, res: Response) {
  const { name, location_note, is_active } = req.body
  const { rows } = await query(
    `UPDATE warehouse SET
       name          = COALESCE($1, name),
       location_note = COALESCE($2, location_note),
       is_active     = COALESCE($3, is_active)
     WHERE id = $4 AND deleted_at IS NULL RETURNING id, name`,
    [name ?? null, location_note ?? null, is_active ?? null, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Warehouse not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteWarehouse(req: Request, res: Response) {
  const { id } = req.params
  // Block deleting a warehouse that still holds stock
  const { rows: stock } = await query(
    `SELECT 1 FROM stock_balance WHERE warehouse_id = $1 AND quantity_on_hand > 0 LIMIT 1`,
    [id]
  )
  if (stock[0]) {
    return res.status(409).json({ success: false, message: 'Warehouse still holds stock — move or adjust it out first' })
  }
  await query(`UPDATE warehouse SET deleted_at = NOW() WHERE id = $1`, [id])
  return res.json({ success: true })
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function listSuppliers(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, name, contact_name, phone, email, address, tax_id, begin_balance, is_active
     FROM supplier WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [req.auth!.orgId]
  )
  return res.json({ success: true, data: rows })
}

export async function getSupplier(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT s.*, COALESCE(SUM(po.total_amount), 0) AS total_purchases
     FROM supplier s
     LEFT JOIN purchase_order po ON po.supplier_id = s.id AND po.deleted_at IS NULL
     WHERE s.id = $1 GROUP BY s.id`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Supplier not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function createSupplier(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const { name, contact_name, phone, email, address, tax_id, begin_balance = 0 } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [supplier] } = await client.query(
      `INSERT INTO supplier (organization_id, name, contact_name, phone, email, address, tax_id, begin_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name`,
      [orgId, name, contact_name ?? null, phone ?? null, email ?? null,
       address ?? null, tax_id ?? null, begin_balance]
    )

    // What we already owed this supplier becomes an unpaid opening bill —
    // it shows in payables and gets settled through the normal pay flow.
    if (Number(begin_balance) > 0 && branchId) {
      await client.query(
        `INSERT INTO ap_invoice (branch_id, supplier_id, invoice_number, invoice_date,
                                 total_amount, status, notes, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,$4,'unpaid',$5,$6)`,
        [branchId, supplier.id, 'OB-' + Date.now().toString(36).toUpperCase(),
         Number(begin_balance), 'Opening balance — owed before system start', userId]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: supplier })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateSupplier(req: Request, res: Response) {
  const { name, contact_name, phone, email, address, tax_id, is_active } = req.body
  const { rows } = await query(
    `UPDATE supplier SET
       name         = COALESCE($1, name),
       contact_name = COALESCE($2, contact_name),
       phone        = COALESCE($3, phone),
       email        = COALESCE($4, email),
       address      = COALESCE($5, address),
       tax_id       = COALESCE($6, tax_id),
       is_active    = COALESCE($7, is_active),
       updated_at   = NOW()
     WHERE id = $8 AND deleted_at IS NULL RETURNING id, name`,
    [name ?? null, contact_name ?? null, phone ?? null, email ?? null,
     address ?? null, tax_id ?? null, is_active ?? null, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Supplier not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteSupplier(req: Request, res: Response) {
  await query(`UPDATE supplier SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
}

// ── Recipes (menu item ↔ inventory item usage) ───────────────────────────────

export async function listRecipes(req: Request, res: Response) {
  const { orgId } = req.auth!
  const { rows } = await query(
    `SELECT r.id, r.menu_item_id, r.item_id, r.quantity_used, r.unit,
            mi.name AS menu_item_name, mi.price AS menu_item_price,
            i.name AS item_name, i.sku, i.unit_of_measure
     FROM recipe r
     JOIN menu_item mi ON mi.id = r.menu_item_id
     JOIN item i       ON i.id  = r.item_id
     WHERE i.organization_id = $1 AND r.deleted_at IS NULL
       AND mi.deleted_at IS NULL AND i.deleted_at IS NULL
     ORDER BY mi.name, i.name`,
    [orgId]
  )
  return res.json({ success: true, data: rows })
}

// ── Stock Movements History ───────────────────────────────────────────────────

export async function listMovements(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { item_id, movement_type, from_date, to_date } = req.query

  let sql = `
    SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost, sm.notes,
           sm.moved_at, sm.reference_type, sm.reference_id,
           i.name AS item_name, i.unit_of_measure, i.sku
    FROM stock_movement sm
    JOIN item i ON i.id = sm.item_id
    JOIN warehouse w ON w.id = sm.warehouse_id
    WHERE w.branch_id = $1 AND sm.deleted_at IS NULL`

  const params: any[] = [branchId]
  if (item_id)       { params.push(item_id);       sql += ` AND sm.item_id = $${params.length}` }
  if (movement_type) { params.push(movement_type); sql += ` AND sm.movement_type = $${params.length}` }
  if (from_date)     { params.push(from_date);     sql += ` AND sm.moved_at >= $${params.length}` }
  if (to_date)       { params.push(to_date);       sql += ` AND sm.moved_at <= $${params.length}` }

  sql += ` ORDER BY sm.moved_at DESC LIMIT 200`
  const { rows } = await query(sql, params)
  return res.json({ success: true, data: rows })
}
