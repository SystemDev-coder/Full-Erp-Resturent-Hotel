import { Request, Response } from 'express'
import { query } from '../../db/pool'

// Ownership checks: every id in the URL must belong to the caller's branch.
const groupInBranch = async (groupId: string, branchId: string) =>
  !!(await query(
    `SELECT 1 FROM modifier_group mg JOIN restaurant r ON r.id = mg.restaurant_id
     WHERE mg.id = $1 AND r.branch_id = $2 AND mg.deleted_at IS NULL`, [groupId, branchId])).rows[0]

const itemInBranch = async (itemId: string, branchId: string) =>
  !!(await query(
    `SELECT 1 FROM menu_item mi JOIN menu_category mc ON mc.id = mi.category_id
     JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE mi.id = $1 AND r.branch_id = $2 AND mi.deleted_at IS NULL`, [itemId, branchId])).rows[0]

const notFound = (res: Response, what: string) =>
  res.status(404).json({ success: false, message: `${what} not found` })

// ── Modifier Groups ───────────────────────────────────────────────────────────

export async function listModifierGroups(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT mg.id, mg.name, mg.selection_type, mg.is_required,
            mg.min_selections, mg.max_selections, mg.display_order,
            json_agg(json_build_object(
              'id', mm.id, 'name', mm.name, 'price_delta', mm.price_delta,
              'is_available', mm.is_available
            ) ORDER BY mm.display_order) FILTER (WHERE mm.id IS NOT NULL) AS modifiers
     FROM modifier_group mg
     JOIN restaurant r ON r.id = mg.restaurant_id
     LEFT JOIN menu_modifier mm ON mm.group_id = mg.id AND mm.deleted_at IS NULL
     WHERE r.branch_id = $1 AND mg.deleted_at IS NULL
     GROUP BY mg.id ORDER BY mg.display_order, mg.name`,
    [branchId]
  )
  return res.json({ success: true, data: rows })
}

export async function createModifierGroup(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { name, selection_type = 'single', is_required = false,
          min_selections = 0, max_selections = 1, display_order = 0 } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })

  const { rows: [rest] } = await query(
    `SELECT id FROM restaurant WHERE branch_id = $1`, [branchId]
  )
  if (!rest) return res.status(404).json({ success: false, message: 'Restaurant not found' })

  const { rows } = await query(
    `INSERT INTO modifier_group (restaurant_id, name, selection_type, is_required,
                                 min_selections, max_selections, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name`,
    [rest.id, name, selection_type, is_required, min_selections, max_selections, display_order]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateModifierGroup(req: Request, res: Response) {
  const { id } = req.params
  const { name, selection_type, is_required, min_selections, max_selections, display_order } = req.body
  const { rows } = await query(
    `UPDATE modifier_group SET
       name            = COALESCE($1, name),
       selection_type  = COALESCE($2, selection_type),
       is_required     = COALESCE($3, is_required),
       min_selections  = COALESCE($4, min_selections),
       max_selections  = COALESCE($5, max_selections),
       display_order   = COALESCE($6, display_order)
     WHERE id = $7 AND deleted_at IS NULL
       AND restaurant_id IN (SELECT id FROM restaurant WHERE branch_id = $8)
     RETURNING id, name`,
    [name ?? null, selection_type ?? null, is_required ?? null,
     min_selections ?? null, max_selections ?? null, display_order ?? null, id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Modifier group not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteModifierGroup(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE modifier_group SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND restaurant_id IN (SELECT id FROM restaurant WHERE branch_id = $2)
     RETURNING id`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return notFound(res, 'Modifier group')
  return res.json({ success: true })
}

// ── Menu Modifiers ────────────────────────────────────────────────────────────

export async function addModifier(req: Request, res: Response) {
  const { group_id } = req.params
  const { name, price_delta = 0, display_order = 0 } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })
  if (!Number.isFinite(Number(price_delta)) || Number(price_delta) < 0) {
    return res.status(400).json({ success: false, message: 'price_delta cannot be negative' })
  }
  if (!(await groupInBranch(group_id, req.auth!.branchId))) return notFound(res, 'Modifier group')

  const { rows } = await query(
    `INSERT INTO menu_modifier (group_id, name, price_delta, display_order)
     VALUES ($1,$2,$3,$4) RETURNING id, name, price_delta`,
    [group_id, name, price_delta, display_order]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function updateModifier(req: Request, res: Response) {
  const { id } = req.params
  const { name, price_delta, is_available, display_order } = req.body
  const { rows } = await query(
    `UPDATE menu_modifier SET
       name          = COALESCE($1, name),
       price_delta   = COALESCE($2, price_delta),
       is_available  = COALESCE($3, is_available),
       display_order = COALESCE($4, display_order)
     WHERE id = $5 AND deleted_at IS NULL
       AND group_id IN (SELECT mg.id FROM modifier_group mg JOIN restaurant r ON r.id = mg.restaurant_id WHERE r.branch_id = $6)
     RETURNING id, name, price_delta`,
    [name ?? null, price_delta ?? null, is_available ?? null, display_order ?? null, id, req.auth!.branchId]
  )
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Modifier not found' })
  return res.json({ success: true, data: rows[0] })
}

export async function deleteModifier(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE menu_modifier SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
       AND group_id IN (SELECT mg.id FROM modifier_group mg JOIN restaurant r ON r.id = mg.restaurant_id WHERE r.branch_id = $2)
     RETURNING id`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return notFound(res, 'Modifier')
  return res.json({ success: true })
}

// ── Item ↔ Modifier Group links ───────────────────────────────────────────────

export async function linkModifierGroup(req: Request, res: Response) {
  const { itemId, groupId } = req.params
  const { branchId } = req.auth!
  if (!(await itemInBranch(itemId, branchId))) return notFound(res, 'Menu item')
  if (!(await groupInBranch(groupId, branchId))) return notFound(res, 'Modifier group')
  // DO UPDATE (not DO NOTHING): re-linking a group that was unlinked earlier must bring it back
  await query(
    `INSERT INTO menu_item_modifier_group (menu_item_id, group_id)
     VALUES ($1,$2) ON CONFLICT (menu_item_id, group_id) DO UPDATE SET deleted_at = NULL, deleted_by = NULL`,
    [itemId, groupId]
  )
  return res.json({ success: true })
}

export async function unlinkModifierGroup(req: Request, res: Response) {
  if (!(await itemInBranch(req.params.itemId, req.auth!.branchId))) return notFound(res, 'Menu item')
  await query(
    `UPDATE menu_item_modifier_group SET deleted_at = NOW()
     WHERE menu_item_id = $1 AND group_id = $2`,
    [req.params.itemId, req.params.groupId]
  )
  return res.json({ success: true })
}

// ── Recipe ────────────────────────────────────────────────────────────────────

export async function getRecipe(req: Request, res: Response) {
  if (!(await itemInBranch(req.params.menuItemId, req.auth!.branchId))) return notFound(res, 'Menu item')
  const { rows } = await query(
    `SELECT r.id, r.item_id, r.quantity_used, r.unit,
            i.name AS ingredient_name, i.unit_of_measure
     FROM recipe r JOIN item i ON i.id = r.item_id
     WHERE r.menu_item_id = $1 AND r.deleted_at IS NULL`,
    [req.params.menuItemId]
  )
  return res.json({ success: true, data: rows })
}

export async function upsertRecipeLine(req: Request, res: Response) {
  const { menuItemId } = req.params
  const { item_id, quantity_used, unit } = req.body
  if (!item_id || !quantity_used || !unit) {
    return res.status(400).json({ success: false, message: 'item_id, quantity_used, unit are required' })
  }
  if (!Number.isFinite(Number(quantity_used)) || Number(quantity_used) <= 0) {
    return res.status(400).json({ success: false, message: 'quantity_used must be greater than 0' })
  }
  if (!(await itemInBranch(menuItemId, req.auth!.branchId))) return notFound(res, 'Menu item')
  const { rows } = await query(
    `INSERT INTO recipe (menu_item_id, item_id, quantity_used, unit)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (menu_item_id, item_id) DO UPDATE
       SET quantity_used = $3, unit = $4, deleted_at = NULL
     RETURNING id, item_id, quantity_used, unit`,
    [menuItemId, item_id, quantity_used, unit]
  )
  return res.status(201).json({ success: true, data: rows[0] })
}

export async function deleteRecipeLine(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE recipe SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
       AND menu_item_id IN (SELECT mi.id FROM menu_item mi JOIN menu_category mc ON mc.id = mi.category_id
                            JOIN restaurant r ON r.id = mc.restaurant_id WHERE r.branch_id = $2)
     RETURNING id`,
    [req.params.id, req.auth!.branchId]
  )
  if (!rows[0]) return notFound(res, 'Recipe line')
  return res.json({ success: true })
}

// ── Public menu (for QR code page) ───────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Public (no login): the live menu behind a table's QR code.
export async function getPublicMenu(req: Request, res: Response) {
  let branchId = req.params.branchId

  // QR codes printed before branches were part of the link looked like /menu/<table number>.
  // That is only unambiguous when the business has a single restaurant.
  if (!UUID_RE.test(branchId)) {
    const { rows } = await query(`SELECT branch_id FROM restaurant WHERE deleted_at IS NULL`)
    if (rows.length !== 1) {
      return res.status(404).json({ success: false, message: 'This QR code is out of date — please ask a member of staff for the menu.' })
    }
    branchId = rows[0].branch_id
  }

  const { rows: [rest] } = await query(
    `SELECT r.name, r.cuisine_type, r.operating_hours, o.name AS org_name, o.logo_url
     FROM restaurant r JOIN branch b ON b.id = r.branch_id JOIN organization o ON o.id = b.organization_id
     WHERE r.branch_id = $1 AND r.deleted_at IS NULL AND b.deleted_at IS NULL`,
    [branchId]
  )
  if (!rest) return res.status(404).json({ success: false, message: 'Menu not found' })

  const { rows: cats } = await query(
    `SELECT mc.id, mc.name, mc.display_order
     FROM menu_category mc JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE r.branch_id = $1 AND mc.is_active = TRUE AND mc.deleted_at IS NULL
     ORDER BY mc.display_order, mc.name`,
    [branchId]
  )

  const { rows: items } = await query(
    `SELECT mi.id, mi.category_id, mi.name, mi.description, mi.price,
            mi.image_url, mi.prep_time_minutes, mi.is_halal, mi.is_vegetarian,
            mi.allergens, mi.item_type
     FROM menu_item mi
     JOIN menu_category mc ON mc.id = mi.category_id
     JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE r.branch_id = $1 AND mi.is_available = TRUE AND mi.deleted_at IS NULL
     ORDER BY mc.display_order, mi.display_order, mi.name`,
    [branchId]
  )

  return res.json({
    success: true,
    data: {
      restaurant: { name: rest.name, cuisine_type: rest.cuisine_type, operating_hours: rest.operating_hours },
      organization: { name: rest.org_name, logo_url: rest.logo_url || null },
      categories: cats.map(c => ({ ...c, items: items.filter(i => i.category_id === c.id) })),
    },
  })
}
