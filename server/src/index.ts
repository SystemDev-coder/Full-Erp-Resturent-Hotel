import 'dotenv/config'
import path from 'path'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'

import { authRouter }        from './routes/auth'
import { getPublicMenu } from './controllers/restaurant/modifierController'
import { usersRouter }       from './routes/users'
import { branchRouter }      from './routes/branches'
import { hotelRouter }       from './routes/hotel'
import { restaurantRouter }  from './routes/restaurant'
import { inventoryRouter }   from './routes/inventory'
import { accountingRouter }  from './routes/accounting'
import { hrRouter }          from './routes/hr'
import { systemRouter }      from './routes/system'
import { dashboardRouter }   from './routes/dashboard'
import { uploadRouter }      from './routes/upload'
import { pool }              from './db/pool'

const app  = express()
const PORT = process.env.PORT ?? 4000

// Keep the server alive if an async route handler rejects without a catch —
// log it instead of letting Node terminate the whole process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  console.error('Uncaught exception:', err)
  // A port conflict means another instance is already running — exit instead
  // of lingering as a zombie process that serves nothing.
  if (err.code === 'EADDRINUSE') process.exit(1)
})

// ── Run lightweight migrations on startup ─────────────────────────────────────
pool.query(`ALTER TABLE guest ADD COLUMN IF NOT EXISTS id_document_image TEXT`).catch(console.error)
pool.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS pos_pin VARCHAR(100)`).catch(console.error)
// Manual admin-triggered lock — distinct from the auto-lock (locked_until)
// that kicks in after repeated failed login attempts.
pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE`).catch(console.error)
// Org-wide VAT rate (%) — applied when a restaurant order is billed.
// Default 5 to match what the POS screen has always displayed.
pool.query(`ALTER TABLE organization ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5`).catch(console.error)
// Company branding — shown on the login/landing page and printed documents.
pool.query(`ALTER TABLE organization ADD COLUMN IF NOT EXISTS logo_url   TEXT`).catch(console.error)
pool.query(`ALTER TABLE organization ADD COLUMN IF NOT EXISTS banner_url TEXT`).catch(console.error)
// Per-user module permission overrides (no row = full access via role).
// view/edit/delete are independent flags so an admin can grant e.g.
// "can create & edit but never delete".
pool.query(`
  CREATE TABLE IF NOT EXISTS user_permission (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key  VARCHAR(30) NOT NULL,
    permission  VARCHAR(10) NOT NULL DEFAULT 'full' CHECK (permission IN ('full','view','none')),
    can_view    BOOLEAN     NOT NULL DEFAULT TRUE,
    can_edit    BOOLEAN     NOT NULL DEFAULT TRUE,
    can_delete  BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by  UUID,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, module_key)
  )
`).then(() => Promise.all([
  pool.query(`ALTER TABLE user_permission ADD COLUMN IF NOT EXISTS can_view   BOOLEAN NOT NULL DEFAULT TRUE`),
  pool.query(`ALTER TABLE user_permission ADD COLUMN IF NOT EXISTS can_edit   BOOLEAN NOT NULL DEFAULT TRUE`),
  pool.query(`ALTER TABLE user_permission ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT TRUE`),
])).catch(console.error)
// Sub-page permission overrides — a module (Hotel) expands into its own pages
// (Bookings, Rooms, Guests, Housekeeping) that can each be independently
// hidden/allowed, on top of the module-level check above (no row = full access).
pool.query(`
  CREATE TABLE IF NOT EXISTS user_submodule_permission (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key    VARCHAR(30) NOT NULL,
    submodule_key VARCHAR(30) NOT NULL,
    can_view      BOOLEAN     NOT NULL DEFAULT TRUE,
    can_edit      BOOLEAN     NOT NULL DEFAULT TRUE,
    can_delete    BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by    UUID,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, module_key, submodule_key)
  )
`).catch(console.error)
// General receipt documents (Receipts → General Receipts) now post a real
// ledger transaction when issued, so 'receipt' needs to be an allowed
// transaction.reference_type — it wasn't in the original CHECK list.
pool.query(`
  ALTER TABLE transaction DROP CONSTRAINT IF EXISTS transaction_reference_type_check
`).then(() => pool.query(`
  ALTER TABLE transaction ADD CONSTRAINT transaction_reference_type_check CHECK (reference_type IN (
    'booking','order','invoice','ap_invoice','purchase_order',
    'payroll_run','expense_payment','refund_payment',
    'adjustment_entry','transfer_entry','account_transfer',
    'salary_payment','other_income','receipt'
  ))
`)).catch(console.error)
// Room Exchange swaps two active bookings' room_id in one transaction. The
// booking table's room/date exclusion constraint is checked per-statement by
// default, which would reject the swap mid-transaction (both bookings
// briefly point at the same room between the two UPDATEs) — making it
// DEFERRABLE INITIALLY DEFERRED delays the check to COMMIT, by which point
// the swap is consistent. Postgres has no "ALTER CONSTRAINT ... DEFERRABLE"
// for exclusion constraints, so it must be dropped and recreated.
pool.query(`
  ALTER TABLE booking DROP CONSTRAINT IF EXISTS booking_room_id_daterange_excl
`).then(() => pool.query(`
  ALTER TABLE booking ADD CONSTRAINT booking_room_id_daterange_excl
    EXCLUDE USING gist (
      room_id WITH =,
      daterange(check_in_date, check_out_date, '[)') WITH &&
    ) WHERE (status NOT IN ('cancelled','no_show') AND deleted_at IS NULL)
    DEFERRABLE INITIALLY DEFERRED
`)).catch(console.error)
pool.query(`
  CREATE TABLE IF NOT EXISTS receipt (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    receipt_number  VARCHAR(40)   NOT NULL UNIQUE,
    receipt_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    guest_id        UUID          REFERENCES guest(id),
    customer_name   VARCHAR(200),
    reference       VARCHAR(120),
    payment_method  VARCHAR(30)   NOT NULL DEFAULT 'cash',
    currency        VARCHAR(10)   NOT NULL DEFAULT 'USD',
    notes           TEXT,
    subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),
    created_by      UUID,
    updated_by      UUID,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
  )
`).catch(console.error)
pool.query(`
  CREATE TABLE IF NOT EXISTS receipt_line (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id   UUID          NOT NULL REFERENCES receipt(id) ON DELETE CASCADE,
    description  VARCHAR(300)  NOT NULL,
    quantity     NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    sort_order   INT           NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
  )
`).catch(console.error)
pool.query(`CREATE INDEX IF NOT EXISTS idx_receipt_branch ON receipt(branch_id)`).catch(console.error)
pool.query(`
  CREATE TABLE IF NOT EXISTS profit_sharing (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organization(id),
    branch_id       UUID          REFERENCES branch(id),
    partner_name    VARCHAR(200)  NOT NULL,
    share_percent   NUMERIC(5,2)  NOT NULL DEFAULT 0,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    share_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    account_id      UUID          REFERENCES account(id),
    period_note     VARCHAR(100),
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
  )
`).catch(console.error)

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin:      process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }))

// ── Static files (document uploads) ──────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(morgan('dev'))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/uploads',     uploadRouter)
app.use('/api/auth',        authRouter)
app.use('/api/users',       usersRouter)
app.use('/api/branches',    branchRouter)
app.use('/api/dashboard',   dashboardRouter)
app.use('/api/hotel',       hotelRouter)
app.use('/api/restaurant',  restaurantRouter)
app.use('/api/inventory',   inventoryRouter)
app.use('/api/accounting',  accountingRouter)
app.use('/api/hr',          hrRouter)
app.use('/api/system',      systemRouter)

// ── Public (no auth) ─────────────────────────────────────────────────────────
app.get('/api/public/menu/:branchId', getPublicMenu)

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  const status = err.status ?? err.statusCode ?? 500
  res.status(status).json({ success: false, message: err.message ?? 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`\n  Hospitality ERP Server`)
  console.log(`  ─────────────────────────`)
  console.log(`  Running : http://localhost:${PORT}`)
  console.log(`  Health  : http://localhost:${PORT}/api/health`)
  console.log(`  Env     : ${process.env.NODE_ENV ?? 'development'}\n`)
})

export default app