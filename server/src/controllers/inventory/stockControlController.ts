import { Request, Response } from 'express'
import { PoolClient } from 'pg'
import { randomBytes } from 'crypto'
import { query } from '../../db/pool'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { logAudit } from '../../utils/audit'

// Stock control: waste log, physical stock-takes (count vs system) and recipe costing.

const WASTE_REASONS = ['spoilage', 'expired', 'breakage', 'spill', 'staff_meal', 'theft', 'other']
const n3 = (v: unknown) => Math.round(Number(v) * 1000) / 1000

async function branchWarehouse(c: Pick<PoolClient, 'query'>, branchId: string, warehouseId?: string) {
  const { rows } = await c.query(
    `SELECT id, name FROM warehouse WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL
       AND ($2::uuid IS NULL OR id = $2) ORDER BY created_at LIMIT 1`,
    [branchId, warehouseId ?? null])
  if (!rows[0]) throw new HttpError(404, warehouseId ? 'Warehouse not found in this branch' : 'No warehouse found for this branch — add one first')
  return rows[0] as { id: string; name: string }
}

// ── Waste ─────────────────────────────────────────────────────────────────────

export async function recordWaste(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const { item_id, reason = 'other', notes } = req.body
  const qty = n3(req.body.quantity)
  if (!item_id) return fail(res, 400, 'item_id is required')
  if (!(qty > 0)) return fail(res, 400, 'quantity must be greater than 0')
  if (!WASTE_REASONS.includes(reason)) return fail(res, 400, `reason must be one of: ${WASTE_REASONS.join(', ')}`)
  try {
    const out = await withTx(async (c) => {
      const wh = await branchWarehouse(c, branchId, req.body.warehouse_id)
      const { rows: [bal] } = await c.query(
        `SELECT sb.quantity_on_hand, sb.average_cost, i.name, i.unit_of_measure
         FROM stock_balance sb JOIN item i ON i.id = sb.item_id
         WHERE sb.warehouse_id = $1 AND sb.item_id = $2 AND i.deleted_at IS NULL FOR UPDATE OF sb`, [wh.id, item_id])
      if (!bal) throw new HttpError(404, 'This item has no stock in the warehouse')
      if (Number(bal.quantity_on_hand) < qty) {
        throw new HttpError(409, `Only ${Number(bal.quantity_on_hand)} ${bal.unit_of_measure} of ${bal.name} in stock — cannot write off ${qty}`)
      }
      await c.query(`UPDATE stock_balance SET quantity_on_hand = quantity_on_hand - $1, last_updated = NOW() WHERE warehouse_id = $2 AND item_id = $3`, [qty, wh.id, item_id])
      const { rows: [m] } = await c.query(
        `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost, reason, notes, moved_by_staff)
         VALUES ($1,$2,'waste',$3,$4,$5,$6,$7) RETURNING id, moved_at`,
        [wh.id, item_id, qty, bal.average_cost, reason, notes ? String(notes).slice(0, 300) : null, userId])
      return { id: m.id, item: bal.name, quantity: qty, unit: bal.unit_of_measure, cost: round2(qty * Number(bal.average_cost)), reason }
    })
    logAudit({ userId, branchId, action: 'STOCK_WASTE', tableName: 'stock_movement', recordId: out.id, req, newValues: out })
    return res.status(201).json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

export async function listWaste(req: Request, res: Response) {
  const { branchId } = req.auth!
  const from = req.query.from ? String(req.query.from) : new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const to = req.query.to ? String(req.query.to) : new Date().toISOString().slice(0, 10)
  const { rows } = await query(
    `SELECT sm.id, sm.moved_at, sm.quantity, sm.unit_cost, ROUND(sm.quantity * sm.unit_cost, 2) AS cost,
            COALESCE(sm.reason, 'other') AS reason, sm.notes, i.name AS item_name, i.unit_of_measure,
            u.full_name AS recorded_by
     FROM stock_movement sm
     JOIN item i ON i.id = sm.item_id JOIN warehouse w ON w.id = sm.warehouse_id
     LEFT JOIN users u ON u.id = sm.moved_by_staff
     WHERE w.branch_id = $1 AND sm.movement_type = 'waste' AND sm.deleted_at IS NULL
       AND sm.moved_at::date BETWEEN $2 AND $3
     ORDER BY sm.moved_at DESC LIMIT 500`, [branchId, from, to])
  const byReason: Record<string, { reason: string; cost: number; count: number }> = {}
  let total = 0
  for (const r of rows) {
    const b = (byReason[r.reason] ??= { reason: r.reason, cost: 0, count: 0 })
    b.cost = round2(b.cost + Number(r.cost)); b.count++; total += Number(r.cost)
  }
  return res.json({ success: true, data: { rows, total_cost: round2(total), by_reason: Object.values(byReason).sort((a, b) => b.cost - a.cost), from, to, reasons: WASTE_REASONS } })
}

// ── Stock-take ────────────────────────────────────────────────────────────────

export async function listStockTakes(req: Request, res: Response) {
  const { rows } = await query(
    `SELECT st.id, st.reference, st.note, st.status, st.created_at, st.completed_at, w.name AS warehouse_name,
            (SELECT COUNT(*) FROM stock_take_line l WHERE l.stock_take_id = st.id) AS item_count,
            (SELECT COUNT(*) FROM stock_take_line l WHERE l.stock_take_id = st.id AND l.counted_qty IS NOT NULL) AS counted_count,
            (SELECT COALESCE(SUM((l.counted_qty - l.system_qty) * l.unit_cost), 0) FROM stock_take_line l
              WHERE l.stock_take_id = st.id AND l.counted_qty IS NOT NULL) AS variance_value
     FROM stock_take st JOIN warehouse w ON w.id = st.warehouse_id
     WHERE st.branch_id = $1 ORDER BY st.created_at DESC LIMIT 100`, [req.auth!.branchId])
  return res.json({ success: true, data: rows })
}

export async function getStockTake(req: Request, res: Response) {
  const { rows: [st] } = await query(
    `SELECT st.*, w.name AS warehouse_name FROM stock_take st JOIN warehouse w ON w.id = st.warehouse_id
     WHERE st.id = $1 AND st.branch_id = $2`, [req.params.id, req.auth!.branchId])
  if (!st) return fail(res, 404, 'Stock-take not found')
  // While counting, show the live system quantity; once completed, the figures frozen at completion
  const { rows: lines } = await query(
    `SELECT l.item_id, i.name, i.sku, i.category, i.unit_of_measure,
            CASE WHEN st.status = 'counting' THEN COALESCE(sb.quantity_on_hand, 0) ELSE l.system_qty END AS system_qty,
            l.counted_qty, CASE WHEN st.status = 'counting' THEN COALESCE(sb.average_cost, 0) ELSE l.unit_cost END AS unit_cost
     FROM stock_take_line l JOIN stock_take st ON st.id = l.stock_take_id
     JOIN item i ON i.id = l.item_id
     LEFT JOIN stock_balance sb ON sb.item_id = l.item_id AND sb.warehouse_id = st.warehouse_id
     WHERE l.stock_take_id = $1 ORDER BY i.category, i.name`, [st.id])
  return res.json({ success: true, data: { ...st, lines } })
}

export async function startStockTake(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  try {
    const out = await withTx(async (c) => {
      const wh = await branchWarehouse(c, branchId, req.body?.warehouse_id)
      const { rows: open } = await c.query(`SELECT reference FROM stock_take WHERE warehouse_id = $1 AND status = 'counting'`, [wh.id])
      if (open[0]) throw new HttpError(409, `A stock-take (${open[0].reference}) is already in progress for ${wh.name} — finish or cancel it first`)
      const ref = 'ST-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + randomBytes(2).toString('hex').toUpperCase()
      const { rows: [st] } = await c.query(
        `INSERT INTO stock_take (branch_id, warehouse_id, reference, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, reference`,
        [branchId, wh.id, ref, req.body?.note ? String(req.body.note).slice(0, 300) : null, userId])
      // every active item that has a balance row in this warehouse
      await c.query(
        `INSERT INTO stock_take_line (stock_take_id, item_id, system_qty, unit_cost)
         SELECT $1, sb.item_id, sb.quantity_on_hand, sb.average_cost
         FROM stock_balance sb JOIN item i ON i.id = sb.item_id AND i.deleted_at IS NULL AND i.is_active = TRUE
         WHERE sb.warehouse_id = $2`, [st.id, wh.id])
      const { rows: [cnt] } = await c.query(`SELECT COUNT(*) AS n FROM stock_take_line WHERE stock_take_id = $1`, [st.id])
      if (Number(cnt.n) === 0) throw new HttpError(409, 'This warehouse has no stock items to count')
      return st
    })
    logAudit({ userId, branchId, action: 'STOCK_TAKE_STARTED', tableName: 'stock_take', recordId: out.id, req, newValues: { reference: out.reference } })
    return res.status(201).json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

// Save counted quantities (can be called many times while counting). counted_qty null/"" clears a line.
export async function saveCounts(req: Request, res: Response) {
  const counts: { item_id: string; counted_qty: number | string | null }[] = Array.isArray(req.body?.counts) ? req.body.counts : []
  if (counts.length === 0) return fail(res, 400, 'counts is required')
  for (const c of counts) {
    if (!c.item_id) return fail(res, 400, 'every count needs an item_id')
    if (c.counted_qty !== null && c.counted_qty !== '' && (!Number.isFinite(Number(c.counted_qty)) || Number(c.counted_qty) < 0)) {
      return fail(res, 400, 'counted quantities cannot be negative')
    }
  }
  try {
    await withTx(async (c) => {
      const { rows: [st] } = await c.query(`SELECT id, status FROM stock_take WHERE id = $1 AND branch_id = $2 FOR UPDATE`, [req.params.id, req.auth!.branchId])
      if (!st) throw new HttpError(404, 'Stock-take not found')
      if (st.status !== 'counting') throw new HttpError(409, `This stock-take is ${st.status}`)
      for (const x of counts) {
        await c.query(
          `UPDATE stock_take_line SET counted_qty = $3 WHERE stock_take_id = $1 AND item_id = $2`,
          [st.id, x.item_id, x.counted_qty === null || x.counted_qty === '' ? null : n3(x.counted_qty)])
      }
    })
    return res.json({ success: true })
  } catch (err) { return handleHttp(res, err) }
}

// Finish: every COUNTED line becomes the new on-hand quantity; the difference is posted as a stock movement
export async function completeStockTake(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  try {
    const out = await withTx(async (c) => {
      const { rows: [st] } = await c.query(`SELECT id, status, warehouse_id, reference FROM stock_take WHERE id = $1 AND branch_id = $2 FOR UPDATE`, [req.params.id, branchId])
      if (!st) throw new HttpError(404, 'Stock-take not found')
      if (st.status !== 'counting') throw new HttpError(409, `This stock-take is already ${st.status}`)
      const { rows: lines } = await c.query(`SELECT item_id, counted_qty FROM stock_take_line WHERE stock_take_id = $1 AND counted_qty IS NOT NULL`, [st.id])
      if (lines.length === 0) throw new HttpError(409, 'Nothing has been counted yet')

      let gains = 0, losses = 0, gainValue = 0, lossValue = 0, adjusted = 0
      for (const l of lines) {
        const { rows: [bal] } = await c.query(
          `SELECT quantity_on_hand, average_cost FROM stock_balance WHERE warehouse_id = $1 AND item_id = $2 FOR UPDATE`, [st.warehouse_id, l.item_id])
        const sys = Number(bal?.quantity_on_hand ?? 0), counted = Number(l.counted_qty), cost = Number(bal?.average_cost ?? 0)
        const diff = n3(counted - sys)
        // freeze what the system believed at the moment of completion
        await c.query(`UPDATE stock_take_line SET system_qty = $3, unit_cost = $4 WHERE stock_take_id = $1 AND item_id = $2`, [st.id, l.item_id, sys, cost])
        if (diff === 0) continue
        adjusted++
        await c.query(`UPDATE stock_balance SET quantity_on_hand = $3, last_updated = NOW() WHERE warehouse_id = $1 AND item_id = $2`, [st.warehouse_id, l.item_id, counted])
        await c.query(
          `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, moved_by_staff)
           VALUES ($1,$2,$3,$4,$5,'stock_take',$6,$7,$8)`,
          [st.warehouse_id, l.item_id, diff > 0 ? 'count_gain' : 'count_loss', Math.abs(diff), cost, st.id, `Stock-take ${st.reference}: counted ${counted}, system had ${sys}`, userId])
        if (diff > 0) { gains++; gainValue += diff * cost } else { losses++; lossValue += -diff * cost }
      }
      await c.query(`UPDATE stock_take SET status = 'completed', completed_by = $2, completed_at = NOW() WHERE id = $1`, [st.id, userId])
      return { reference: st.reference, counted: lines.length, adjusted, gains, losses, gain_value: round2(gainValue), loss_value: round2(lossValue), net_value: round2(gainValue - lossValue) }
    })
    logAudit({ userId, branchId, action: 'STOCK_TAKE_COMPLETED', tableName: 'stock_take', recordId: req.params.id, req, newValues: out })
    return res.json({ success: true, data: out })
  } catch (err) { return handleHttp(res, err) }
}

export async function cancelStockTake(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE stock_take SET status = 'cancelled' WHERE id = $1 AND branch_id = $2 AND status = 'counting' RETURNING id`, [req.params.id, req.auth!.branchId])
  if (!rows[0]) return fail(res, 409, 'Only a stock-take that is still counting can be cancelled')
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: 'STOCK_TAKE_CANCELLED', tableName: 'stock_take', recordId: rows[0].id, req })
  return res.json({ success: true })
}

// ── Recipe costing ────────────────────────────────────────────────────────────
// What each dish costs to make (recipe × current average cost of every ingredient) and what is left of the price.

const FACTOR: Record<string, Record<string, number>> = {
  kg: { kg: 1, g: 0.001 }, g: { g: 1, kg: 1000 },
  litre: { litre: 1, ml: 0.001 }, ml: { ml: 1, litre: 1000 },
}
// cost of 1 `recipeUnit` given the stock unit's price — null when the units cannot be compared
const unitFactor = (stockUnit: string, recipeUnit: string): number | null => {
  const r = String(recipeUnit).toLowerCase().trim(), s = String(stockUnit).toLowerCase().trim()
  if (r === s) return 1
  const f = FACTOR[s]?.[r]
  return f ?? null
}

async function computeCosting(branchId: string) {
  const { rows: dishes } = await query(
    `SELECT mi.id, mi.name, mi.price, mi.cost_price, mc.name AS category
     FROM menu_item mi JOIN menu_category mc ON mc.id = mi.category_id JOIN restaurant r ON r.id = mc.restaurant_id
     WHERE r.branch_id = $1 AND mi.deleted_at IS NULL ORDER BY mc.name, mi.name`, [branchId])
  const { rows: parts } = await query(
    `SELECT rc.menu_item_id, rc.item_id, rc.quantity_used, rc.unit, i.name AS ingredient, i.unit_of_measure,
            COALESCE((SELECT AVG(NULLIF(sb.average_cost, 0)) FROM stock_balance sb JOIN warehouse w ON w.id = sb.warehouse_id
                      WHERE sb.item_id = i.id AND w.branch_id = $1), 0) AS unit_cost
     FROM recipe rc JOIN item i ON i.id = rc.item_id
     WHERE rc.deleted_at IS NULL AND rc.menu_item_id IN (
       SELECT mi.id FROM menu_item mi JOIN menu_category mc ON mc.id = mi.category_id JOIN restaurant r ON r.id = mc.restaurant_id WHERE r.branch_id = $1)`, [branchId])

  const byDish = new Map<string, any[]>()
  for (const p of parts) (byDish.get(p.menu_item_id) ?? byDish.set(p.menu_item_id, []).get(p.menu_item_id)!).push(p)

  const data = dishes.map((d: any) => {
    const ing = (byDish.get(d.id) ?? []).map(p => {
      const f = unitFactor(p.unit_of_measure, p.unit)
      const unitCost = Number(p.unit_cost)
      const cost = f === null || unitCost === 0 ? null : round2(Number(p.quantity_used) * f * unitCost)
      return { item_id: p.item_id, name: p.ingredient, quantity: Number(p.quantity_used), unit: p.unit, stock_unit: p.unit_of_measure, cost,
               problem: f === null ? 'unit_mismatch' : unitCost === 0 ? 'no_cost' : null }
    })
    const complete = ing.length > 0 && ing.every(i => i.cost !== null)
    const recipeCost = complete ? round2(ing.reduce((s, i) => s + (i.cost ?? 0), 0)) : null
    const price = Number(d.price)
    return {
      id: d.id, name: d.name, category: d.category, price, saved_cost: Number(d.cost_price),
      has_recipe: ing.length > 0, complete, recipe_cost: recipeCost, ingredients: ing,
      margin: recipeCost === null ? null : round2(price - recipeCost),
      food_cost_pct: recipeCost === null || price === 0 ? null : round2((recipeCost / price) * 100),
    }
  })
  const costed = data.filter(d => d.recipe_cost !== null)
  return {
    dishes: data,
    summary: {
      dishes: data.length, costed: costed.length, no_recipe: data.filter(d => !d.has_recipe).length,
      incomplete: data.filter(d => d.has_recipe && !d.complete).length,
      avg_food_cost_pct: costed.length ? round2(costed.reduce((s, d) => s + (d.food_cost_pct ?? 0), 0) / costed.length) : null,
      low_margin: costed.filter(d => (d.food_cost_pct ?? 0) > 40).length,
    },
  }
}

export async function getCosting(req: Request, res: Response) {
  return res.json({ success: true, data: await computeCosting(req.auth!.branchId) })
}

// Copy the calculated recipe cost into menu_item.cost_price (used by profit figures). Only fully costed dishes.
export async function applyCosting(req: Request, res: Response) {
  const { branchId, userId } = req.auth!
  const ids: string[] | null = Array.isArray(req.body?.menu_item_ids) ? req.body.menu_item_ids : null
  const rows = (await computeCosting(branchId)).dishes.filter(d => d.recipe_cost !== null && (!ids || ids.includes(d.id)))
  let updated = 0
  for (const d of rows) {
    if (Number(d.saved_cost) === d.recipe_cost) continue
    await query(`UPDATE menu_item SET cost_price = $2, updated_at = NOW() WHERE id = $1`, [d.id, d.recipe_cost]); updated++
  }
  logAudit({ userId, branchId, action: 'RECIPE_COSTS_APPLIED', req, newValues: { updated } })
  return res.json({ success: true, data: { updated, considered: rows.length } })
}
