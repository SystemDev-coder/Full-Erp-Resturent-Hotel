import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pool } from './pool'

async function migrate() {
  // __dirname = server/src/db  →  ../../migrations = server/migrations
  const sqlPath = join(__dirname, '..', '..', 'migrations', '001_schema.sql')
  console.log('SQL file path:', sqlPath)

  const sql = readFileSync(sqlPath, 'utf8')
  console.log(`SQL loaded (${sql.length} chars) — running migration…`)

  const client = await pool.connect()
  try {
    await client.query(sql)
    console.log('✅ Migration complete — all tables created')
  } catch (err) {
    console.error('❌ Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1) })
