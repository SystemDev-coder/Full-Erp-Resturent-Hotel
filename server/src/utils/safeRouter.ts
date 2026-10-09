import { Router, RequestHandler } from 'express'

// Express 4 does not forward a rejected promise from an async handler to the
// error middleware — the request just hangs until the client times out (the
// process-level 'unhandledRejection' hook only logs it). safeRouter() returns a
// normal Router whose verb methods wrap every handler so a thrown/rejected
// error reaches next(err) and becomes a proper JSON error response.
const wrap = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  try {
    const out = fn(req, res, next) as unknown
    if (out && typeof (out as Promise<unknown>).catch === 'function') {
      (out as Promise<unknown>).catch(next)
    }
  } catch (err) {
    next(err)
  }
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const

export function safeRouter(): Router {
  const router = Router()
  for (const verb of VERBS) {
    const original = router[verb].bind(router) as (...args: unknown[]) => Router
    ;(router as any)[verb] = (path: unknown, ...handlers: RequestHandler[]) =>
      original(path, ...handlers.map(wrap))
  }
  return router
}

// Postgres error codes that mean "the client sent bad data", not "the server
// broke" — mapped to 4xx by the global error handler instead of a generic 500.
export const PG_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  '22P02': { status: 400, message: 'Invalid value or ID format' },
  '22003': { status: 400, message: 'A number is out of the allowed range' },
  '22007': { status: 400, message: 'Invalid date format' },
  '22008': { status: 400, message: 'Invalid date value' },
  '23502': { status: 400, message: 'A required field is missing' },
  '23503': { status: 409, message: 'Referenced record does not exist or is still in use' },
  '23505': { status: 409, message: 'A record with the same unique value already exists' },
  '23514': { status: 400, message: 'A value is not allowed for this field' },
  '23P01': { status: 409, message: 'This conflicts with an existing record (e.g. room already booked)' },
}
