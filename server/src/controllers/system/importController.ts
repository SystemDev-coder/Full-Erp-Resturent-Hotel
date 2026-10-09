import { Request, Response } from 'express'
import { PoolClient } from 'pg'
import { withTx, HttpError, handleHttp, round2, fail } from '../../utils/tx'
import { logAudit } from '../../utils/audit'

// Bulk import (Systems → Import): guests, menu items and opening stock from an Excel/CSV file.
// The browser reads the file and sends rows as JSON. `dry_run: true` validates everything and writes nothing;
// the real run writes all valid rows in ONE transaction (invalid / duplicate rows are skipped and reported).

const MAX_ROWS = 2000
type Raw = Record<string, unknown>
export interface RowResult { row: number; status: 'ok' | 'duplicate' | 'error'; message: string }

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())
const num = (v: unknown) => { const t = s(v).replace(/[$,\s]/g, ''); return t === '' ? NaN : Number(t) }
const digits = (v: unknown) => s(v).replace(/\D/g, '')
const tail = (v: unknown) => digits(v).slice(-9)
const bool = (v: unknown, dflt: boolean) => { const t = s(v).toLowerCase(); return t === '' ? dflt : ['y', 'yes', 'true', '1', 'haa'].includes(t) }

const ID_TYPES = ['passport', 'national_id', 'driving_license', 'other']
const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'box', 'bag', 'can', 'bottle', 'pack']
const ITEM_TYPES = ['food', 'beverage', 'combo', 'addon']

type Handler = (c: PoolClient, rows: Raw[], ctx: { orgId: string; branchId: string; userId: string; commit: boolean }) => Promise<RowResult[]>

// ── Guests ────────────────────────────────────────────────────────────────────
const importGuests: Handler = async (c, rows, { orgId, userId, commit }) => {
  const { rows: existing } = await c.query(`SELECT lower(email) AS email, right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) AS ph FROM guest WHERE organization_id = $1 AND deleted_at IS NULL`, [orgId])
  const emails = new Set(existing.map((g: any) => g.email).filter(Boolean)), phones = new Set(existing.map((g: any) => g.ph).filter((p: string) => p.length >= 7))
  const out: RowResult[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], n = i + 2                        // +2 → spreadsheet row number (row 1 = headers)
    const first = s(r.first_name), last = s(r.last_name) || '-', email = s(r.email).toLowerCase(), phone = s(r.phone)
    const idType = s(r.id_type).toLowerCase().replace(/[\s-]+/g, '_'), gender = s(r.gender).toUpperCase().slice(0, 1)
    if (!first) { out.push({ row: n, status: 'error', message: 'first_name is required' }); continue }
    if (!email && !phone) { out.push({ row: n, status: 'error', message: 'a phone or an email is required' }); continue }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.push({ row: n, status: 'error', message: `"${email}" is not a valid email` }); continue }
    if (phone && digits(phone).length < 7) { out.push({ row: n, status: 'error', message: `"${phone}" is not a valid phone number` }); continue }
    if (idType && !ID_TYPES.includes(idType)) { out.push({ row: n, status: 'error', message: `id_type must be one of: ${ID_TYPES.join(', ')}` }); continue }
    if (gender && !['M', 'F', 'O'].includes(gender)) { out.push({ row: n, status: 'error', message: 'gender must be M, F or O' }); continue }
    if ((email && emails.has(email)) || (phone && phones.has(tail(phone)))) { out.push({ row: n, status: 'duplicate', message: 'a guest with this phone/email already exists' }); continue }
    if (email) emails.add(email); if (phone) phones.add(tail(phone))
    if (commit) {
      await c.query(
        `INSERT INTO guest (organization_id, first_name, last_name, email, phone, nationality, id_type, id_number, gender, address, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [orgId, first.slice(0, 100), last.slice(0, 100), email || null, phone.slice(0, 30) || null, s(r.nationality).slice(0, 100) || null,
         idType || null, s(r.id_number).slice(0, 60) || null, gender || null, s(r.address) || null, s(r.notes) || null])
    }
    out.push({ row: n, status: 'ok', message: `${first} ${last === '-' ? '' : last}`.trim() })
  }
  void userId
  return out
}

// ── Menu ──────────────────────────────────────────────────────────────────────
const importMenu: Handler = async (c, rows, { branchId, commit }) => {
  const { rows: [rest] } = await c.query(`SELECT id FROM restaurant WHERE branch_id = $1 AND deleted_at IS NULL`, [branchId])
  if (!rest) throw new HttpError(409, 'This branch has no restaurant set up yet')
  const { rows: cats } = await c.query(`SELECT id, lower(name) AS name, deleted_at IS NOT NULL AS deleted FROM menu_category WHERE restaurant_id = $1`, [rest.id])
  const catMap = new Map<string, { id: string; deleted: boolean }>(cats.map((x: any) => [x.name, { id: x.id, deleted: x.deleted }]))
  const { rows: items } = await c.query(
    `SELECT mi.category_id, lower(mi.name) AS name FROM menu_item mi JOIN menu_category mc ON mc.id = mi.category_id WHERE mc.restaurant_id = $1 AND mi.deleted_at IS NULL`, [rest.id])
  const seen = new Set(items.map((x: any) => `${x.category_id}|${x.name}`))
  const out: RowResult[] = []
  let order = cats.length
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], n = i + 2
    const cat = s(r.category), name = s(r.name), price = num(r.price), cost = s(r.cost_price) === '' ? 0 : num(r.cost_price)
    const type = (s(r.item_type) || 'food').toLowerCase()
    if (!cat) { out.push({ row: n, status: 'error', message: 'category is required' }); continue }
    if (!name) { out.push({ row: n, status: 'error', message: 'name is required' }); continue }
    if (!Number.isFinite(price) || price < 0) { out.push({ row: n, status: 'error', message: `price "${s(r.price)}" is not a valid number` }); continue }
    if (!Number.isFinite(cost) || cost < 0) { out.push({ row: n, status: 'error', message: `cost_price "${s(r.cost_price)}" is not a valid number` }); continue }
    if (!ITEM_TYPES.includes(type)) { out.push({ row: n, status: 'error', message: `item_type must be one of: ${ITEM_TYPES.join(', ')}` }); continue }
    let c0 = catMap.get(cat.toLowerCase())
    if (!c0) {
      c0 = { id: commit ? '' : `new:${cat.toLowerCase()}`, deleted: false }
      if (commit) {
        const { rows: [nc] } = await c.query(`INSERT INTO menu_category (restaurant_id, name, display_order) VALUES ($1,$2,$3) RETURNING id`, [rest.id, cat.slice(0, 100), ++order])
        c0.id = nc.id
      }
      catMap.set(cat.toLowerCase(), c0)
    } else if (c0.deleted && commit) {
      await c.query(`UPDATE menu_category SET deleted_at = NULL, deleted_by = NULL, is_active = TRUE WHERE id = $1`, [c0.id]); c0.deleted = false
    }
    const key = `${c0.id}|${name.toLowerCase()}`
    if (seen.has(key)) { out.push({ row: n, status: 'duplicate', message: `"${name}" already exists in ${cat}` }); continue }
    seen.add(key)
    if (commit) {
      await c.query(
        `INSERT INTO menu_item (category_id, name, description, price, cost_price, item_type, is_halal, is_vegetarian, prep_time_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [c0.id, name.slice(0, 200), s(r.description) || null, round2(price), round2(cost), type, bool(r.halal, true), bool(r.vegetarian, false),
         Math.min(240, Math.max(0, Math.round(num(r.prep_minutes)) || 0))])
    }
    out.push({ row: n, status: 'ok', message: `${name} — ${cat} — $${round2(price).toFixed(2)}` })
  }
  return out
}

// ── Opening stock ─────────────────────────────────────────────────────────────
const importStock: Handler = async (c, rows, { orgId, branchId, userId, commit }) => {
  const { rows: [wh] } = await c.query(`SELECT id FROM warehouse WHERE branch_id = $1 AND is_active = TRUE AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, [branchId])
  if (!wh) throw new HttpError(409, 'This branch has no warehouse yet — add one in Inventory → Warehouses first')
  const { rows: ex } = await c.query(
    `SELECT i.id, i.organization_id, upper(i.sku) AS sku, COALESCE(sb.quantity_on_hand, 0) AS qty
     FROM item i LEFT JOIN stock_balance sb ON sb.item_id = i.id AND sb.warehouse_id = $1 WHERE i.deleted_at IS NULL`, [wh.id])
  const bySku = new Map<string, any>(ex.map((x: any) => [x.sku, x]))
  const seen = new Set<string>()
  const out: RowResult[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], n = i + 2
    const sku = s(r.sku).toUpperCase(), name = s(r.name), unit = (s(r.unit) || 'piece').toLowerCase()
    const qty = num(r.quantity), cost = s(r.unit_cost) === '' ? 0 : num(r.unit_cost), reorder = s(r.reorder_level) === '' ? 0 : num(r.reorder_level)
    if (!sku) { out.push({ row: n, status: 'error', message: 'sku is required' }); continue }
    if (!UNITS.includes(unit)) { out.push({ row: n, status: 'error', message: `unit must be one of: ${UNITS.join(', ')}` }); continue }
    if (!Number.isFinite(qty) || qty < 0) { out.push({ row: n, status: 'error', message: `quantity "${s(r.quantity)}" is not a valid number` }); continue }
    if (!Number.isFinite(cost) || cost < 0) { out.push({ row: n, status: 'error', message: `unit_cost "${s(r.unit_cost)}" is not a valid number` }); continue }
    if (!Number.isFinite(reorder) || reorder < 0) { out.push({ row: n, status: 'error', message: 'reorder_level must be a number' }); continue }
    if (seen.has(sku)) { out.push({ row: n, status: 'duplicate', message: `${sku} appears twice in the file` }); continue }
    seen.add(sku)
    let item = bySku.get(sku)
    if (item && item.organization_id !== orgId) { out.push({ row: n, status: 'error', message: `SKU ${sku} is already used by another business` }); continue }
    if (item && Number(item.qty) > 0) { out.push({ row: n, status: 'duplicate', message: `${sku} already has ${Number(item.qty)} in stock — use Stock Control → Stock-take to correct it` }); continue }
    if (!item && !name) { out.push({ row: n, status: 'error', message: 'name is required for a new item' }); continue }
    if (commit) {
      if (!item) {
        const { rows: [ni] } = await c.query(
          `INSERT INTO item (organization_id, sku, name, category, item_type, unit_of_measure, reorder_level) VALUES ($1,$2,$3,$4,'ingredient',$5,$6) RETURNING id`,
          [orgId, sku, name.slice(0, 200), (s(r.category) || 'general').slice(0, 50), unit, reorder])
        item = { id: ni.id }
      } else if (reorder > 0) await c.query(`UPDATE item SET reorder_level = $2 WHERE id = $1`, [item.id, reorder])
      if (qty > 0) {
        await c.query(
          `INSERT INTO stock_balance (warehouse_id, item_id, quantity_on_hand, average_cost) VALUES ($1,$2,$3,$4)
           ON CONFLICT (warehouse_id, item_id) DO UPDATE SET quantity_on_hand = $3, average_cost = $4, last_updated = NOW()`, [wh.id, item.id, qty, cost])
        await c.query(
          `INSERT INTO stock_movement (warehouse_id, item_id, movement_type, quantity, unit_cost, reference_type, notes, moved_by_staff)
           VALUES ($1,$2,'adjustment',$3,$4,'import','Opening stock (Excel import)',$5)`, [wh.id, item.id, qty, cost, userId])
      }
    }
    out.push({ row: n, status: 'ok', message: `${name || sku} — ${qty} ${unit}${cost ? ` @ $${cost}` : ''}` })
  }
  return out
}

const HANDLERS: Record<string, Handler> = { guests: importGuests, menu: importMenu, stock: importStock }

export async function runImport(req: Request, res: Response) {
  const { orgId, branchId, userId } = req.auth!
  const kind = req.params.kind
  const allowed = kind === 'stock' ? ['org_admin', 'branch_manager', 'inventory_manager'] : ['org_admin', 'branch_manager']
  if (!allowed.includes(req.auth!.role)) return fail(res, 403, 'Insufficient permissions')
  const handler = HANDLERS[kind]
  if (!handler) return fail(res, 404, 'Unknown import type')
  const rows: Raw[] = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (rows.length === 0) return fail(res, 400, 'The file has no rows')
  if (rows.length > MAX_ROWS) return fail(res, 400, `A file can have at most ${MAX_ROWS} rows — split it into smaller files`)
  const commit = req.body?.dry_run !== true
  try {
    const results = await withTx(async (c) => handler(c, rows, { orgId, branchId, userId, commit }))
    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      duplicate: results.filter(r => r.status === 'duplicate').length,
      error: results.filter(r => r.status === 'error').length,
    }
    if (commit) logAudit({ userId, branchId, action: 'DATA_IMPORT', req, newValues: { kind, ...summary } })
    return res.json({ success: true, data: { committed: commit, summary, results } })
  } catch (err) { return handleHttp(res, err) }
}

