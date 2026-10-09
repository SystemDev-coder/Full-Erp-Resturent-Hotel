import { Response } from 'express'
import { PoolClient } from 'pg'
import { pool } from '../db/pool'

// Run `fn` inside one transaction: COMMIT on success, ROLLBACK on any throw.
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

// Throw inside a transaction to abort it and answer with a specific HTTP status.
export class HttpError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message) }
}

// Turn an HttpError into a JSON response; anything else is re-thrown so the
// global error handler (and safeRouter) deal with it.
export const handleHttp = (res: Response, err: unknown) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, message: err.message, ...(err.data ? { data: err.data } : {}) })
  }
  throw err
}

export const round2 = (n: number) => Math.round(n * 100) / 100

export const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message })
