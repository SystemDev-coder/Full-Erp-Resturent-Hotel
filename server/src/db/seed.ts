import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './pool'

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Organization ──────────────────────────────────────────────────────────
    const { rows: [org] } = await client.query<{ id: string }>(`
      INSERT INTO organization (name, legal_name, tax_id, default_timezone, phone, email)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, ['Mogadishu Grand Hotel & Restaurant', 'Mogadishu Grand LLC', 'TIN-0001',
        'Africa/Mogadishu', '+252612000000', 'info@mogadishugrand.so'])

    if (!org) {
      const { rows: [existing] } = await client.query<{ id: string }>(
        `SELECT id FROM organization LIMIT 1`
      )
      if (!existing) throw new Error('Organization upsert failed')
      console.log('Seed already applied, skipping.')
      await client.query('ROLLBACK')
      return
    }
    const orgId = org.id

    // ── Branch ────────────────────────────────────────────────────────────────
    const { rows: [branch] } = await client.query<{ id: string }>(`
      INSERT INTO branch (organization_id, name, code, branch_type, address, city, country, phone, email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `, [orgId, 'Main Branch', 'MAIN', 'both', 'KM5, Hodan District',
        'Mogadishu', 'Somalia', '+252612000001', 'main@mogadishugrand.so'])
    const branchId = branch.id

    // ── Fiscal Year ───────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO fiscal_year (organization_id, name, start_date, end_date)
      VALUES ($1,$2,$3,$4)
    `, [orgId, 'FY 2026', '2026-01-01', '2026-12-31'])

    // ── Admin User ────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('Admin@1234', 12)
    const { rows: [adminUser] } = await client.query<{ id: string }>(`
      INSERT INTO users (organization_id, full_name, email, phone, password_hash)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
    `, [orgId, 'System Admin', 'admin@mogadishugrand.so', '+252612000010', passwordHash])
    const adminId = adminUser.id

    // Demo staff user
    const staffHash = await bcrypt.hash('Staff@1234', 12)
    const { rows: [staffUser] } = await client.query<{ id: string }>(`
      INSERT INTO users (organization_id, full_name, email, phone, password_hash)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
    `, [orgId, 'Branch Manager', 'manager@mogadishugrand.so', '+252612000011', staffHash])
    const staffUserId = staffUser.id

    // ── User Branch Assignments ───────────────────────────────────────────────
    await client.query(`
      INSERT INTO user_branch (user_id, branch_id, role, is_primary)
      VALUES ($1,$2,$3,$4),($5,$6,$7,$8)
    `, [adminId, branchId, 'org_admin', true,
        staffUserId, branchId, 'branch_manager', true])

    // ── Module Config ─────────────────────────────────────────────────────────
    const modules = ['hotel','restaurant','inventory','accounting','hr','system']
    for (const m of modules) {
      await client.query(`
        INSERT INTO module_config (organization_id, branch_id, module_key, is_enabled)
        VALUES ($1,$2,$3,$4)
      `, [orgId, branchId, m, true])
    }

    // ── Hotel ─────────────────────────────────────────────────────────────────
    const { rows: [hotel] } = await client.query<{ id: string }>(`
      INSERT INTO hotel (branch_id, star_rating, check_in_time, check_out_time, late_checkout_fee)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
    `, [branchId, 4, '14:00', '11:00', 50])
    const hotelId = hotel.id

    // ── Room Types ────────────────────────────────────────────────────────────
    const roomTypes = [
      { name: 'Standard Single', maxAdults: 1, maxChildren: 0, bed: 'Single', area: 20 },
      { name: 'Standard Double', maxAdults: 2, maxChildren: 1, bed: 'Double', area: 28 },
      { name: 'Deluxe Double',   maxAdults: 2, maxChildren: 2, bed: 'King',   area: 36 },
      { name: 'Suite',           maxAdults: 3, maxChildren: 2, bed: 'King',   area: 55 },
      { name: 'Presidential',    maxAdults: 4, maxChildren: 2, bed: '2× King', area: 90 },
    ]
    const rtIds: Record<string, string> = {}
    for (const rt of roomTypes) {
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO room_type (hotel_id, name, max_adults, max_children, bed_configuration, area_sqm)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
      `, [hotelId, rt.name, rt.maxAdults, rt.maxChildren, rt.bed, rt.area])
      rtIds[rt.name] = row.id
    }

    // ── Rate Plans ────────────────────────────────────────────────────────────
    const rates: [string, number, boolean][] = [
      ['Standard Single', 80,   false],
      ['Standard Double', 120,  true],
      ['Deluxe Double',   180,  true],
      ['Suite',           280,  true],
      ['Presidential',    450,  true],
    ]
    for (const [rtName, price, breakfast] of rates) {
      await client.query(`
        INSERT INTO rate_plan (hotel_id, room_type_id, name, price_per_night, is_breakfast_included, valid_from)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [hotelId, rtIds[rtName], `${rtName} - Standard Rate`, price, breakfast, '2026-01-01'])
    }

    // ── Rooms ─────────────────────────────────────────────────────────────────
    const rooms: [string, string, number, string][] = [
      ['101', 'Standard Single', 1, 'available'],
      ['102', 'Standard Single', 1, 'available'],
      ['201', 'Standard Double', 2, 'available'],
      ['202', 'Standard Double', 2, 'occupied'],
      ['203', 'Standard Double', 2, 'available'],
      ['301', 'Deluxe Double',   3, 'available'],
      ['302', 'Deluxe Double',   3, 'cleaning'],
      ['303', 'Deluxe Double',   3, 'available'],
      ['401', 'Suite',           4, 'available'],
      ['402', 'Suite',           4, 'occupied'],
      ['501', 'Presidential',    5, 'available'],
    ]
    const roomIds: Record<string, string> = {}
    for (const [num, rtName, floor, status] of rooms) {
      const { rows: [r] } = await client.query<{ id: string }>(`
        INSERT INTO room (hotel_id, room_type_id, room_number, floor, status)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [hotelId, rtIds[rtName], num, floor, status])
      roomIds[num] = r.id
    }

    // ── Guests ────────────────────────────────────────────────────────────────
    const guestData: [string,string,string,string][] = [
      ['Ahmed',   'Hassan',   'ahmed.hassan@email.com',   '+252612100001'],
      ['Fatima',  'Ali',      'fatima.ali@email.com',     '+252612100002'],
      ['Mohamed', 'Ibrahim',  'mohamed.ibrahim@email.com','+252612100003'],
      ['Hibo',    'Nur',      'hibo.nur@email.com',       '+252612100004'],
      ['Omar',    'Farah',    'omar.farah@email.com',     '+252612100005'],
    ]
    const guestIds: string[] = []
    for (const [fn, ln, email, phone] of guestData) {
      const { rows: [g] } = await client.query<{ id: string }>(`
        INSERT INTO guest (organization_id, first_name, last_name, email, phone, nationality)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
      `, [orgId, fn, ln, email, phone, 'Somali'])
      guestIds.push(g.id)
    }

    // ── Restaurant ────────────────────────────────────────────────────────────
    const { rows: [rest] } = await client.query<{ id: string }>(`
      INSERT INTO restaurant (branch_id, name, cuisine_type, seating_capacity,
                              accepts_reservations, tax_rate, service_charge_pct)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [branchId, 'Grand Dining', 'Somali & International', 80, true, 5.00, 10.00])
    const restId = rest.id

    // ── Menu Categories ───────────────────────────────────────────────────────
    const catNames = ['Main Course','Beverages','Coffee','Tea','Soups','Salads','Pizza','Burgers','Desserts']
    const catIds: Record<string, string> = {}
    for (let i = 0; i < catNames.length; i++) {
      const { rows: [c] } = await client.query<{ id: string }>(`
        INSERT INTO menu_category (restaurant_id, name, display_order)
        VALUES ($1,$2,$3) RETURNING id
      `, [restId, catNames[i], i])
      catIds[catNames[i]] = c.id
    }

    // ── Menu Items (sample) ───────────────────────────────────────────────────
    const menuItems: [string, string, number, number, number, boolean][] = [
      ['Grilled Lamb Chops',    'Main Course', 18.00, 8.00,  25, true],
      ['Camel Meat Stew',       'Main Course', 15.00, 6.50,  30, true],
      ['Spiced Rice & Chicken', 'Main Course', 12.00, 4.50,  20, true],
      ['Fish Curry',            'Main Course', 14.00, 5.00,  25, false],
      ['Vegetable Biryani',     'Main Course', 10.00, 3.50,  20, false],
      ['Fresh Mango Juice',     'Beverages',    3.50, 0.80,   5, true],
      ['Somali Tea (Shaah)',    'Tea',          2.00, 0.40,   5, true],
      ['Cardamom Coffee',       'Coffee',       2.50, 0.60,   5, true],
      ['Lentil Soup',           'Soups',        5.00, 1.50,  15, false],
      ['Caesar Salad',          'Salads',       7.00, 2.00,  10, false],
      ['Margherita Pizza',      'Pizza',       11.00, 3.50,  20, false],
      ['Classic Burger',        'Burgers',      9.00, 3.00,  15, true],
      ['Chocolate Lava Cake',   'Desserts',     6.00, 2.00,  15, true],
    ]
    const menuItemIds: string[] = []
    for (const [name, cat, price, cost, prep, popular] of menuItems) {
      const { rows: [mi] } = await client.query<{ id: string }>(`
        INSERT INTO menu_item (category_id, name, price, cost_price, prep_time_minutes, is_available)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
      `, [catIds[cat], name, price, cost, prep, true])
      menuItemIds.push(mi.id)
      void popular
    }

    // ── Table Areas & Dining Tables ───────────────────────────────────────────
    const areas = [
      { name: 'Main Hall',  type: 'indoor', tables: ['T1','T2','T3','T4','T5','T6','T7','T8'] },
      { name: 'Outdoor',    type: 'outdoor',tables: ['T9','T10','T11','T12'] },
      { name: 'Rooftop',    type: 'rooftop',tables: ['T13','T14','T15'] },
      { name: 'Bar Lounge', type: 'bar',    tables: ['B1','B2'] },
    ]
    for (const area of areas) {
      const { rows: [a] } = await client.query<{ id: string }>(`
        INSERT INTO table_area (restaurant_id, name, area_type)
        VALUES ($1,$2,$3) RETURNING id
      `, [restId, area.name, area.type])
      for (const tNum of area.tables) {
        await client.query(`
          INSERT INTO dining_table (area_id, table_number, capacity, status)
          VALUES ($1,$2,$3,$4)
        `, [a.id, tNum, 4, 'available'])
      }
    }

    // ── Departments ───────────────────────────────────────────────────────────
    const deptNames = ['Front Desk','Housekeeping','Kitchen','Restaurant','Finance','Security','Management']
    const deptIds: Record<string, string> = {}
    for (const name of deptNames) {
      const { rows: [d] } = await client.query<{ id: string }>(`
        INSERT INTO department (branch_id, name) VALUES ($1,$2) RETURNING id
      `, [branchId, name])
      deptIds[name] = d.id
    }

    // ── Staff ─────────────────────────────────────────────────────────────────
    const staffData: [string,string,string,string,string,string,number][] = [
      ['E001','Mako Hassan',    'Housekeeping','Housekeeping','housekeeper',   'full_time',400],
      ['E002','Hawa Ahmed',     'Housekeeping','Housekeeping','housekeeper',   'full_time',400],
      ['E003','Cabdi Warsame',  'Restaurant',  'Restaurant',  'waiter',        'full_time',350],
      ['E004','Hibo Ali',       'Restaurant',  'Restaurant',  'cashier',       'full_time',450],
      ['E005','Yusuf Ibrahim',  'Restaurant',  'Restaurant',  'waiter',        'part_time',200],
      ['E006','Shamso Dahir',   'Kitchen',     'Kitchen',     'chef',          'full_time',650],
      ['E007','Ali Abdirahman', 'Front Desk',  'Front Desk',  'receptionist',  'full_time',480],
      ['E008','Faadumo Omar',   'Finance',     'Finance',     'accountant',    'full_time',700],
      ['E009','Bashir Farah',   'Security',    'Security',    'security',      'full_time',300],
    ]
    const staffIds: string[] = []
    for (const [empId, name, dept, _dept2, role, empType, salary] of staffData) {
      void _dept2
      const [fn, ...lnParts] = name.split(' ')
      const { rows: [s] } = await client.query<{ id: string }>(`
        INSERT INTO staff (branch_id, department_id, employee_id, first_name, last_name,
                           role, employment_type, basic_salary, joined_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
      `, [branchId, deptIds[dept], empId, fn, lnParts.join(' '),
          role, empType, salary, '2025-01-01'])
      staffIds.push(s.id)
    }

    // ── Warehouse ─────────────────────────────────────────────────────────────
    const { rows: [wh] } = await client.query<{ id: string }>(`
      INSERT INTO warehouse (branch_id, name, location_note)
      VALUES ($1,$2,$3) RETURNING id
    `, [branchId, 'Main Store', 'Ground floor, behind kitchen'])
    const warehouseId = wh.id

    // ── Inventory Items ───────────────────────────────────────────────────────
    const invItems: [string, string, string, string, number][] = [
      ['RICE-001',  'Basmati Rice',       'dry_goods',  'kg',    50],
      ['LAMB-001',  'Lamb Meat',          'meat',       'kg',    10],
      ['CHICK-001', 'Chicken Whole',      'meat',       'kg',    10],
      ['FISH-001',  'Fresh Fish (Tuna)',  'seafood',    'kg',     5],
      ['OIL-001',   'Cooking Oil',        'dry_goods',  'litre', 20],
      ['TOM-001',   'Tomatoes',           'vegetables', 'kg',    15],
      ['TEA-001',   'Black Tea Bags',     'beverages',  'box',    5],
      ['COFFEE-001','Cardamom Coffee',    'beverages',  'kg',     2],
      ['FLOUR-001', 'Wheat Flour',        'dry_goods',  'kg',    30],
      ['MILK-001',  'Fresh Milk',         'dairy',      'litre',  5],
    ]
    for (const [sku, name, cat, uom, reorder] of invItems) {
      const { rows: [itm] } = await client.query<{ id: string }>(`
        INSERT INTO item (organization_id, sku, name, category, item_type, unit_of_measure, reorder_level)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `, [orgId, sku, name, cat, 'ingredient', uom, reorder])

      await client.query(`
        INSERT INTO stock_balance (warehouse_id, item_id, quantity_on_hand, average_cost)
        VALUES ($1,$2,$3,$4)
      `, [warehouseId, itm.id, reorder * 3, 1.5])
    }

    // ── Supplier ──────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO supplier (organization_id, name, contact_name, phone, email)
      VALUES ($1,$2,$3,$4,$5)
    `, [orgId, 'Mogadishu Fresh Supplies', 'Hassan Ali', '+252615000001', 'supplies@mfs.so'])

    // ── Bank Account ──────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO account (organization_id, branch_id, account_type, name, institution)
      VALUES ($1,$2,$3,$4,$5),($1,$2,$6,$7,$8)
    `, [orgId, branchId,
        'cash',           'Front Desk Cash',     'On-Site',
        'bank',           'Premier Bank Current','Premier Bank Somalia'])

    // ── Housekeeping Tasks ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO housekeeping_task (room_id, assigned_to, task_type, status, scheduled_for)
      VALUES ($1,$2,$3,$4,$5),($6,$7,$3,$8,$5)
    `, [roomIds['302'], staffIds[0], 'stayover_clean', 'pending', new Date().toISOString().slice(0,10),
        roomIds['202'], staffIds[1], 'in_progress'])

    await client.query('COMMIT')
    console.log('✅ Seed complete')
    console.log('   Admin login: admin@mogadishugrand.so / Admin@1234')
    console.log('   Manager:     manager@mogadishugrand.so / Staff@1234')

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Seed failed:', err)
    throw err
  } finally {
    client.release()
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
