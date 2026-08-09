import 'dotenv/config'
import { pool } from './pool'

/**
 * Adds a SECOND demo branch ("Lido Beach Restaurant") so the navbar
 * branch switcher has something to switch to. Idempotent — safe to re-run.
 *
 *   npm run seed:branch
 */
async function seedBranch() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [org] } = await client.query<{ id: string }>(
      `SELECT id FROM organization ORDER BY created_at LIMIT 1`
    )
    if (!org) throw new Error('No organization found — run the main seed first (npm run seed)')

    // ── Branch (unique on org + code) ─────────────────────────────────────────
    await client.query(
      `INSERT INTO branch (organization_id, name, code, branch_type, address, city, country, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [org.id, 'Lido Beach Restaurant', 'LIDO', 'restaurant', 'Lido Beach Road',
       'Mogadishu', 'Somalia', '+252612000002', 'lido@mogadishugrand.so']
    )
    const { rows: [branch] } = await client.query<{ id: string }>(
      `SELECT id FROM branch WHERE organization_id = $1 AND code = 'LIDO'`,
      [org.id]
    )
    const branchId = branch.id

    // ── Give every active user access to the new branch (keep their role) ────
    await client.query(
      `INSERT INTO user_branch (user_id, branch_id, role, is_primary)
       SELECT DISTINCT ON (ub.user_id) ub.user_id, $2, ub.role, FALSE
       FROM user_branch ub
       JOIN users u ON u.id = ub.user_id
       WHERE u.organization_id = $1
         AND ub.is_active = TRUE AND ub.deleted_at IS NULL
       ORDER BY ub.user_id, ub.is_primary DESC
       ON CONFLICT (user_id, branch_id) DO NOTHING`,
      [org.id, branchId]
    )

    // ── Enable modules for the branch ─────────────────────────────────────────
    for (const m of ['restaurant', 'inventory', 'accounting', 'hr', 'system']) {
      await client.query(
        `INSERT INTO module_config (organization_id, branch_id, module_key, is_enabled)
         SELECT $1::uuid, $2::uuid, $3::varchar, TRUE
         WHERE NOT EXISTS (
           SELECT 1 FROM module_config
           WHERE organization_id = $1::uuid AND branch_id = $2::uuid AND module_key = $3::varchar AND deleted_at IS NULL
         )`,
        [org.id, branchId, m]
      )
    }

    // ── Restaurant profile (unique on branch_id) ──────────────────────────────
    await client.query(
      `INSERT INTO restaurant (branch_id, name, cuisine_type, seating_capacity,
                               accepts_reservations, tax_rate, service_charge_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (branch_id) DO NOTHING`,
      [branchId, 'Lido Beach Grill', 'Seafood & Grill', 60, true, 5.00, 10.00]
    )
    const { rows: [restaurant] } = await client.query<{ id: string }>(
      `SELECT id FROM restaurant WHERE branch_id = $1`, [branchId]
    )

    // ── Table area + a few dining tables so the branch isn't empty ───────────
    await client.query(
      `INSERT INTO table_area (restaurant_id, name, area_type)
       VALUES ($1, 'Beachfront', 'outdoor')
       ON CONFLICT (restaurant_id, name) DO NOTHING`,
      [restaurant.id]
    )
    const { rows: [area] } = await client.query<{ id: string }>(
      `SELECT id FROM table_area WHERE restaurant_id = $1 AND name = 'Beachfront'`,
      [restaurant.id]
    )
    for (let i = 1; i <= 8; i++) {
      await client.query(
        `INSERT INTO dining_table (area_id, table_number, capacity)
         VALUES ($1, $2, $3)
         ON CONFLICT (area_id, table_number) DO NOTHING`,
        [area.id, `B${i}`, i <= 4 ? 4 : 6]
      )
    }

    // ── Warehouse for inventory ───────────────────────────────────────────────
    const { rows: existingWh } = await client.query(
      `SELECT 1 FROM warehouse WHERE branch_id = $1 LIMIT 1`, [branchId]
    )
    if (!existingWh[0]) {
      await client.query(
        `INSERT INTO warehouse (branch_id, name, location_note)
         VALUES ($1, 'Beach Store', 'Back of kitchen')`,
        [branchId]
      )
    }

    await client.query('COMMIT')
    console.log('✔ Second branch "Lido Beach Restaurant" (LIDO) is ready.')
    console.log('  All existing users were granted access — the navbar switcher is now live.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('seedBranch failed:', err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

seedBranch()
