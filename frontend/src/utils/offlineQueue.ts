import axios from 'axios'
import type { AxiosInstance } from 'axios'

// POS offline mode — orders rung up while the internet is down wait here (this browser's storage) and are
// sent automatically when it comes back. Each order carries a `client_ref` made on this device, so a retry
// after a dropped connection can never create the order twice (the server answers with the first result).

export interface OutboxLine { menu_item_id: string; quantity: number; special_request?: string }
export interface OutboxEntry {
  id: string                         // = client_ref
  kind: 'kitchen' | 'pay'
  created_at: string
  label: string                      // "T-05 (Main hall)" / "Takeaway"
  waiter_id?: string
  waiter_name?: string
  total: number
  order: { dining_table_id: string | null; order_type: string; discount_amount: number; guest_id?: string; lines: OutboxLine[] }
  pay?: { method: string; account_id: string }
  status: 'pending' | 'error'
  error?: string
  receipt?: string                   // temporary receipt number printed offline (OFF-…)
  order_id?: string
  order_ref?: string
  invoice_id?: string
  invoice_total?: number
}

const KEY = 'pos_outbox_v1'
const EVT = 'pos-outbox-changed'

export const loadOutbox = (): OutboxEntry[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as OutboxEntry[] } catch { return [] }
}
const save = (list: OutboxEntry[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage full / blocked */ }
  window.dispatchEvent(new Event(EVT))
}
export const addToOutbox = (e: OutboxEntry) => save([...loadOutbox(), e])
export const removeFromOutbox = (id: string) => save(loadOutbox().filter(x => x.id !== id))
const patch = (id: string, p: Partial<OutboxEntry>) => save(loadOutbox().map(x => x.id === id ? { ...x, ...p } : x))
export const retryOutboxEntry = (id: string) => patch(id, { status: 'pending', error: undefined })

export function subscribeOutbox(cb: (list: OutboxEntry[]) => void) {
  const h = () => cb(loadOutbox())
  window.addEventListener(EVT, h); window.addEventListener('storage', h)
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h) }
}

export const newClientRef = () => 'pos-' + (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

/** true when the request never reached the server (no internet / server down) — as opposed to an answer like 400/409 */
export const isNetworkError = (e: unknown) => axios.isAxiosError(e) && !e.response

const msgOf = (e: unknown) => axios.isAxiosError(e) ? ((e.response?.data as { message?: string } | undefined)?.message ?? e.message) : String(e)

let running = false
export interface SyncResult { synced: number; failed: number; remaining: number; offline: boolean }

/** Send every waiting order. Stops quietly when the connection is still down; marks an order "error" when the server refuses it. */
export async function syncOutbox(api: AxiosInstance): Promise<SyncResult> {
  if (running) return { synced: 0, failed: 0, remaining: loadOutbox().length, offline: false }
  running = true
  let synced = 0, failed = 0, offline = false
  try {
    for (const entry of loadOutbox().filter(x => x.status === 'pending')) {
      try {
        // 1. the order itself (idempotent: the same client_ref returns the order made by an earlier, half-finished attempt)
        let orderId = entry.order_id
        if (!orderId) {
          const r = await api.post('/restaurant/orders/sync', {
            client_ref: entry.id, created_at: entry.created_at, send_to_kitchen: true,
            dining_table_id: entry.order.dining_table_id, order_type: entry.order.order_type,
            server_staff_id: entry.waiter_id, discount_amount: entry.order.discount_amount,
            lines: entry.order.lines,
          })
          orderId = r.data.data.id as string
          patch(entry.id, { order_id: orderId, order_ref: r.data.data.order_ref })
        }
        // 2. a paid-offline sale: invoice + payment
        if (entry.kind === 'pay' && entry.pay) {
          let invoiceId = entry.invoice_id, amount = entry.invoice_total ?? entry.total
          if (!invoiceId) {
            try {
              const b = await api.post(`/restaurant/orders/${orderId}/bill`, { guest_id: entry.order.guest_id })
              invoiceId = b.data.data.id as string; amount = Number(b.data.data.total_amount)
              patch(entry.id, { invoice_id: invoiceId, invoice_total: amount })
            } catch (e) {
              // already billed by an earlier attempt → the server tells us which invoice
              if (axios.isAxiosError(e) && e.response?.status === 409 && (e.response.data as { data?: { id?: string } })?.data?.id) invoiceId = (e.response.data as { data: { id: string } }).data.id
              else throw e
            }
          }
          try {
            await api.post(`/accounting/invoices/${invoiceId}/payment`, { amount, payment_method: entry.pay.method, account_id: entry.pay.account_id, staff_id: entry.waiter_id })
          } catch (e) {
            // "already fully paid" on a retry is success
            if (!(axios.isAxiosError(e) && e.response?.status === 409)) throw e
          }
          if (entry.order.dining_table_id) await api.patch(`/restaurant/tables/${entry.order.dining_table_id}/status`, { status: 'cleaning' }).catch(() => undefined)
        }
        removeFromOutbox(entry.id); synced++
      } catch (e) {
        if (isNetworkError(e)) { offline = true; break }       // still no connection — keep everything, try later
        patch(entry.id, { status: 'error', error: msgOf(e) }); failed++
      }
    }
  } finally { running = false }
  return { synced, failed, remaining: loadOutbox().filter(x => x.status === 'pending').length, offline }
}
