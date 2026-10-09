import { Request, Response } from 'express'
import { query } from '../../db/pool'

// A menu item belongs to a branch through its category → restaurant. The branch id
// is the LAST bind parameter of whichever query embeds this ($12 in the UPDATE,
// swapped to $2 in the single-id ones).
const IN_BRANCH = `category_id IN (
  SELECT mc.id FROM menu_category mc JOIN restaurant r ON r.id = mc.restaurant_id WHERE r.branch_id = $12)`

export async function listMenuCategories(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT mc.id, mc.name, mc.display_order, mc.is_active
     FROM menu_category mc JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE r.branch_id = $1 AND mc.deleted_at IS NULL ORDER BY mc.display_order`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function listMenuItems(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT mi.id, mi.name, mi.description, mi.price, mi.cost_price, mi.image_url,
            mi.item_type, mi.is_available, mi.is_halal,
            mi.category_id, mc.name AS category_name
     FROM menu_item mi
     JOIN menu_category mc ON mc.id = mi.category_id
     JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE r.branch_id = $1 AND mi.deleted_at IS NULL
     ORDER BY mc.display_order, mi.display_order`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createMenuItem(req: Request, res: Response) {
  const { branchId } = req.auth!
  const {
    category_id, name, description, price, cost_price = 0,
    item_type = 'food', is_halal = true, is_vegetarian = false,
    prep_time_minutes = 0, image_url, display_order = 0,
  } = req.body

  if (!category_id || !name || price == null) {
    return res.status(400).json({ success: false, message: 'category_id, name, and price are required' })
  }
  if (!Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isFinite(Number(cost_price)) || Number(cost_price) < 0) {
    return res.status(400).json({ success: false, message: 'price and cost_price cannot be negative' })
  }

  // Verify category belongs to this branch
  const { rows: cats } = await query(
    `SELECT mc.id FROM menu_category mc
     JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE mc.id = $1 AND r.branch_id = $2 AND mc.deleted_at IS NULL`,
    [category_id, branchId]
  )
  if (!cats[0]) return res.status(404).json({ success: false, message: 'Category not found' })

  const { rows } = await query(
    `INSERT INTO menu_item
       (category_id, name, description, price, cost_price, item_type,
        is_halal, is_vegetarian, prep_time_minutes, image_url, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, name, price, is_available`,
    [category_id, name, description ?? null, price, cost_price,
     item_type, is_halal, is_vegetarian, prep_time_minutes, image_url ?? null, display_order]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateMenuItem(req: Request, res: Response) {
  const { id } = req.params
  const {
    name, description, price, cost_price,
    item_type, is_halal, is_vegetarian,
    prep_time_minutes, image_url, display_order,
  } = req.body

  const { rows } = await query(
    `UPDATE menu_item SET
       name               = COALESCE($1, name),
       description        = COALESCE($2, description),
       price              = COALESCE($3, price),
       cost_price         = COALESCE($4, cost_price),
       item_type          = COALESCE($5, item_type),
       is_halal           = COALESCE($6, is_halal),
       is_vegetarian      = COALESCE($7, is_vegetarian),
       prep_time_minutes  = COALESCE($8, prep_time_minutes),
       image_url          = COALESCE($9, image_url),
       display_order      = COALESCE($10, display_order),
       updated_at         = NOW()
     WHERE id = $11 AND deleted_at IS NULL AND ${IN_BRANCH}
     RETURNING id, name, price, is_available`,
    [name ?? null, description ?? null, price ?? null, cost_price ?? null,
     item_type ?? null, is_halal ?? null, is_vegetarian ?? null,
     prep_time_minutes ?? null, image_url ?? null, display_order ?? null, id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Menu item not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function toggleAvailable(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE menu_item SET is_available = NOT is_available
     WHERE id = $1 AND deleted_at IS NULL AND ${IN_BRANCH.replace('$12', '$2')} RETURNING is_available`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Menu item not found' })
  return res.json({ success: true, is_available: rows[0].is_available })
}

// The Menu page's delete button always called this route, which did not exist (404).
// Soft delete — past orders keep their own copy of the item name/price.
export async function deleteMenuItem(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE menu_item SET deleted_at = NOW(), deleted_by = $3, is_available = FALSE
     WHERE id = $1 AND deleted_at IS NULL AND ${IN_BRANCH.replace('$12', '$2')} RETURNING id`,
    [req.params.id, req.auth!.branchId, req.auth!.userId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Menu item not found' })
  return res.json({ success: true })
}