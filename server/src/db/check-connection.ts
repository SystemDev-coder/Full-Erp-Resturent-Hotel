import 'dotenv/config'
import { Pool } from 'pg'

async function checkConnection() {
  const cfg = {
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: 'postgres',
    user:     process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASSWORD || undefined,
    connectionTimeoutMillis: 3000,
  }

  console.log('\nConnection config:')
  console.log(`  Host     : ${cfg.host}:${cfg.port}`)
  console.log(`  User     : ${cfg.user}`)
  console.log(`  Password : ${cfg.password ? '(set)' : '(empty — will fail with SCRAM)'}`)
  console.log(`  Database : ${process.env.DB_NAME ?? 'hospitality_erp'}\n`)

  const pool = new Pool(cfg)
  try {
    const { rows } = await pool.query('SELECT current_user, version()')
    console.log('✅ Connected successfully!')
    console.log('   User   :', rows[0].current_user)
    console.log('   Version:', rows[0].version.split(',')[0])

    // Check if hospitality_erp exists
    const { rows: dbs } = await pool.query(
      `SELECT datname FROM pg_database WHERE datname = $1`, ['hospitality_erp']
    )
    if (dbs[0]) {
      console.log('\n✅ Database "hospitality_erp" exists')
    } else {
      console.log('\n⚠️  Database "hospitality_erp" does not exist yet')
      console.log('   Run: createdb -U postgres hospitality_erp')
    }
  } catch (err: any) {
    console.error('❌ Connection failed:', err.message)
    if (err.message.includes('SASL') || err.message.includes('password')) {
      console.error('\n   → Your DB_PASSWORD in .env is wrong or empty.')
      console.error('   → Open pgAdmin 4 or SQL Shell (psql) and run:')
      console.error('       ALTER USER postgres PASSWORD \'yourNewPassword\';')
      console.error('   → Then set DB_PASSWORD=yourNewPassword in server/.env')
    }
  } finally {
    await pool.end()
  }
}

checkConnection().then(() => process.exit(0)).catch(() => process.exit(1))
