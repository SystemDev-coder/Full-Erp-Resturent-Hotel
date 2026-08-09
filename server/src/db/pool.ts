import { Pool, QueryResultRow } from 'pg'

export const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME     ?? 'hospitality_erp',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err)
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) =>
  pool.query<T>(text, params)