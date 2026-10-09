import { pool } from './pool'

// Schema additions for the newer features (manager approvals, kitchen display, stock control,
// notifications, 2FA, online booking, offline sync). Idempotent — safe to run on every start.
// Runs to completion BEFORE the server starts listening, so no request ever sees a half-migrated schema.

const STEPS: string[] = [
  // ── Manager approval (discount / void) ──────────────────────────────────────
  `ALTER TABLE order_header ADD COLUMN IF NOT EXISTS discount_approved_by VARCHAR(200)`,
  `ALTER TABLE order_line   ADD COLUMN IF NOT EXISTS void_reason TEXT`,
  `ALTER TABLE order_line   ADD COLUMN IF NOT EXISTS void_approved_by VARCHAR(200)`,

  // ── Kitchen display ─────────────────────────────────────────────────────────
  `ALTER TABLE order_line ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ`,

  // ── Two-factor sign-in (authenticator app) ──
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery JSONB NOT NULL DEFAULT '[]'::jsonb`,

  // ── Offline POS: an order rung up with no internet is sent later with a client-made reference (no duplicates) ──
  `ALTER TABLE order_header ADD COLUMN IF NOT EXISTS client_ref VARCHAR(60)`,
  // Who took each restaurant payment: the cashier/waiter who collected it (POS PIN) — defaults to the order's waiter
  `CREATE TABLE IF NOT EXISTS payment_collection (
     id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
     branch_id     UUID          NOT NULL REFERENCES branch(id),
     invoice_id    UUID          NOT NULL REFERENCES invoice(id),
     order_id      UUID          REFERENCES order_header(id),
     staff_id      UUID,
     waiter_id     UUID,
     method        VARCHAR(20)   NOT NULL,
     amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
     created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_pc_branch_time ON payment_collection(branch_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pc_staff ON payment_collection(staff_id)`,
  // Call number: 1, 2, 3… restarting every day — what the waiter shouts / the customer waits for
  `ALTER TABLE order_header ADD COLUMN IF NOT EXISTS call_no INT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_client_ref ON order_header(branch_id, client_ref) WHERE client_ref IS NOT NULL`,

  // ── Stock control: stock-take + waste reason ────────────────────────────────
  `ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check`,
  `ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_movement_type_check CHECK (movement_type IN (
     'purchase','issue_kitchen','adjustment','transfer_in','transfer_out','waste','return','count_gain','count_loss'))`,
  `ALTER TABLE stock_movement ADD COLUMN IF NOT EXISTS reason VARCHAR(40)`,
  `CREATE TABLE IF NOT EXISTS notification_log (
     id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID         NOT NULL REFERENCES organization(id),
     branch_id       UUID,
     event           VARCHAR(40)  NOT NULL,
     channel         VARCHAR(20)  NOT NULL DEFAULT 'whatsapp',
     to_phone        VARCHAR(30),
     message         TEXT         NOT NULL,
     status          VARCHAR(20)  NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','manual','sent','failed')),
     error           TEXT,
     reference_type  VARCHAR(30),
     reference_id    UUID,
     created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
     sent_at         TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notif_ref ON notification_log(event, reference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_org ON notification_log(organization_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS stock_take (
     id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
     branch_id     UUID         NOT NULL REFERENCES branch(id),
     warehouse_id  UUID         NOT NULL REFERENCES warehouse(id),
     reference     VARCHAR(30)  NOT NULL UNIQUE,
     note          TEXT,
     status        VARCHAR(20)  NOT NULL DEFAULT 'counting' CHECK (status IN ('counting','completed','cancelled')),
     created_by    UUID,
     created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
     completed_by  UUID,
     completed_at  TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS stock_take_line (
     id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
     stock_take_id UUID          NOT NULL REFERENCES stock_take(id) ON DELETE CASCADE,
     item_id       UUID          NOT NULL REFERENCES item(id),
     system_qty    NUMERIC(12,3) NOT NULL,
     counted_qty   NUMERIC(12,3),
     unit_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
     UNIQUE (stock_take_id, item_id)
   )`,
]

export async function runExtraMigrations() {
  for (const sql of STEPS) {
    try { await pool.query(sql) }
    catch (e) { console.error('[migrate] step failed:', sql.slice(0, 80).replace(/\s+/g, ' '), '→', (e as Error).message) }
  }
}
