import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Search, Plus, Minus, Trash2, CreditCard, X,
  ShoppingCart, Banknote, Smartphone, Zap, RefreshCw,
  ChefHat, Lock, Delete, UserCircle2, UtensilsCrossed, WifiOff, UploadCloud, AlertTriangle,
} from 'lucide-react'
import axios from 'axios'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@hooks/useAuth'
import { withApproval, isApprovalCancelled, type ApprovalBody } from '@utils/approval'
import {
  addToOutbox, loadOutbox, newClientRef, isNetworkError, removeFromOutbox, retryOutboxEntry, subscribeOutbox, syncOutbox,
  type OutboxEntry,
} from '@utils/offlineQueue'
import { rememberPin, forgetPin, verifyLocalPin } from '@utils/localPin'
import { ReadyAlerts } from '@/components/ReadyAlerts'
import { printHtml, esc, companyHeader, setFooterOrg, type OrgInfo } from '@utils/print'
import type { PaymentMethod } from '@/types/restaurant'

// ─── Types ────────────────────────────────────────────────────────────────────

type CartItem = { id: string; name: string; price: number; qty: number; image_url?: string }

interface ApiMenuItem {
  id: string; name: string; category_id: string; category_name: string
  price: number; cost_price: number; image_url?: string; is_available: boolean
}
interface ApiCategory { id: string; name: string; display_order: number }
interface ApiTable    { id: string; table_number: string; area_name: string; capacity: number; status: string }

interface PosStaff {
  id: string; first_name: string; last_name: string; role: string
  employee_id: string; has_pin: boolean
  is_me?: boolean        // this staff profile belongs to the person signed in to the system
}
interface PosGuest { id: string; first_name: string; last_name: string; phone?: string }
interface ActiveWaiter { id: string; name: string; role: string }
interface ApiAccount { id: string; name: string; account_type: string }

// ─── Per-waiter order drafts ──────────────────────────────────────────────────
// Each waiter's unfinished order is kept in localStorage under their own staff id.
// Locking the POS, leaving via "Exit POS", closing the tab or even a session
// timeout therefore never loses an order — it is restored when that same waiter
// unlocks again, and never shown to a different waiter.

interface Draft { cart: CartItem[]; tableId: string; discount: number; note: string; guestId: string }
const draftKey = (staffId: string) => `pos_draft_${staffId}`

const loadDraft = (staffId: string): Draft | null => {
  try {
    const raw = localStorage.getItem(draftKey(staffId))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch { return null }
}
const saveDraft = (staffId: string, d: Draft) => {
  try { localStorage.setItem(draftKey(staffId), JSON.stringify(d)) } catch { /* storage unavailable */ }
}
const clearDraft = (staffId: string) => {
  try { localStorage.removeItem(draftKey(staffId)) } catch { /* storage unavailable */ }
}

// ─── POS Page ─────────────────────────────────────────────────────────────────

export default function POS() {
  const { user } = useAuth()
  const [menuItems, setMenuItems] = useState<ApiMenuItem[]>([])
  const [menuCats,  setMenuCats]  = useState<ApiCategory[]>([])
  const [tables,    setTables]    = useState<ApiTable[]>([])
  const [org,       setOrg]       = useState<OrgInfo | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [syncing,   setSyncing]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')

  const [cat,        setCat]        = useState('all')
  const [search,     setSearch]     = useState('')
  const [cart,       setCart]       = useState<CartItem[]>([])
  const [tableId,    setTableId]    = useState('')
  const [orderNum,   setOrderNum]   = useState(201)
  const [payOpen,    setPayOpen]    = useState(false)
  const [payMethod,  setPayMethod]  = useState<PaymentMethod>('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [discount,   setDiscount]   = useState(0)
  // Manager-approval limit for discounts (a manager signed in approves themselves)
  const [approvalPolicy, setApprovalPolicy] = useState<{ limit: number; self: boolean }>({ limit: 10, self: false })
  const [note,       setNote]       = useState('')
  const [guestName,  setGuestName]  = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  // Room charge is tied to a real checked-in booking so the bill lands on that guest's statement
  const [inHouse,    setInHouse]    = useState<{ id: string; guest_id: string; guest_name: string; room_number: string; booking_ref: string }[]>([])
  const [bookingId,  setBookingId]  = useState('')

  // Waiter PIN lock — nobody uses the POS anonymously
  const [posStaff, setPosStaff] = useState<PosStaff[]>([])
  const [waiter,   setWaiter]   = useState<ActiveWaiter | null>(null)
  // Staff id whose draft has been loaded — auto-save only runs after restore, so an
  // empty cart can never overwrite a saved draft during unlock.
  const restoredFor = useRef<string | null>(null)
  const [pinFor,   setPinFor]   = useState<PosStaff | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinBusy,  setPinBusy]  = useState(false)
  const [pinError, setPinError] = useState('')

  // Optional customer on the order (for billing / receipt)
  const [guests,  setGuests]  = useState<PosGuest[]>([])
  const [guestId, setGuestId] = useState('')

  // Which cash/bank account the payment is deposited into
  const [accounts,  setAccounts]  = useState<ApiAccount[]>([])
  const [accountId, setAccountId] = useState('')

  // ── Offline mode ───────────────────────────────────────────────────────────
  // No internet → the POS keeps working: orders wait in this browser's outbox and are sent automatically.
  const [online, setOnline] = useState(() => navigator.onLine)
  const [outbox, setOutbox] = useState<OutboxEntry[]>(() => loadOutbox())
  const [sending, setSending] = useState(false)
  const [showOutbox, setShowOutbox] = useState(false)

  const flushOutbox = useCallback(async (quiet = false) => {
    if (loadOutbox().filter(x => x.status === 'pending').length === 0) return
    setSending(true)
    const r = await syncOutbox(api)
    setSending(false)
    if (r.synced > 0) { setSuccess(`${r.synced} offline order${r.synced === 1 ? '' : 's'} sent to the server`); setTimeout(() => setSuccess(''), 4000) }
    else if (!quiet && r.offline) setError('Still no connection — your orders are safe and will be sent automatically.')
    if (r.failed > 0) setShowOutbox(true)
  }, [])

  useEffect(() => {
    const up = () => { setOnline(true); flushOutbox(true) }
    const down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    const off = subscribeOutbox(setOutbox)
    flushOutbox(true)                                        // orders left from an earlier session
    const tick = setInterval(() => { if (navigator.onLine) flushOutbox(true) }, 30_000)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); off(); clearInterval(tick) }
  }, [flushOutbox])

  useEffect(() => {
    if (payMethod !== 'room_charge') return
    api.get('/restaurant/pos/in-house')
      .then(r => setInHouse(r.data.data))
      .catch(e => setError(getApiErrorMessage(e)))
  }, [payMethod])

  const pickBooking = (id: string) => {
    setBookingId(id)
    const b = inHouse.find(x => x.id === id)
    setGuestName(b?.guest_name ?? '')
    setRoomNumber(b?.room_number ?? '')
    setGuestId(b?.guest_id ?? '')
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, cRes, tRes, oRes, sRes, gRes, aRes, pRes] = await Promise.all([
        api.get('/restaurant/menu/items'),
        api.get('/restaurant/menu/categories'),
        api.get('/restaurant/tables'),
        api.get('/system/organization').catch(() => null), // header info for tickets
        api.get('/restaurant/pos/staff').catch(() => null),
        api.get('/hotel/guests').catch(() => null),
        api.get('/accounting/accounts').catch(() => null),
        api.get('/restaurant/approvals/policy').catch(() => null),
      ])
      setMenuItems(iRes.data.data)
      setMenuCats(cRes.data.data)
      setTables(tRes.data.data)
      if (oRes) { setOrg(oRes.data.data); setFooterOrg(oRes.data.data?.name) }
      if (sRes) setPosStaff(sRes.data.data)
      if (gRes) setGuests(gRes.data.data)
      if (pRes) setApprovalPolicy({ limit: Number(pRes.data.data.policy.discount_over_pct), self: !!pRes.data.data.self_approves })
      if (tRes.data.data.length > 0) setTableId(tRes.data.data[0].id)
      if (aRes) {
        const accs: ApiAccount[] = aRes.data.data
        setAccounts(accs)
        setAccountId(accs.find(a => a.account_type === 'cash')?.id ?? accs[0]?.id ?? '')
      }
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── PIN pad ────────────────────────────────────────────────────────────────
  const tapPin = (d: string) => {
    setPinError('')
    if (pinInput.length < 6) setPinInput(p => p + d)
  }

  const submitPin = async () => {
    if (!pinFor || pinInput.length < 4) return
    setPinBusy(true); setPinError('')
    try {
      // Offline: check against the hash this device remembered from the last online unlock
      const unlockOffline = async (): Promise<ActiveWaiter> => {
        const res = await verifyLocalPin(pinFor.id, pinInput)
        if (!res.ok) throw new Error(res.message)
        return { id: pinFor.id, name: `${pinFor.first_name} ${pinFor.last_name}`, role: pinFor.role }
      }
      let who: ActiveWaiter
      if (!navigator.onLine) who = await unlockOffline()
      else {
        try {
          const r = await api.post('/restaurant/pos/verify-pin', { staff_id: pinFor.id, pin: pinInput })
          who = r.data.data
          void rememberPin(who.id, pinInput)
        } catch (e) {
          if (isNetworkError(e)) who = await unlockOffline()
          else { if (axios.isAxiosError(e) && (e.response?.status === 400 || e.response?.status === 409)) forgetPin(pinFor.id); throw e }
        }
      }

      // Bring back this waiter's unfinished order (prices/availability refreshed from the live menu)
      const draft = loadDraft(who.id)
      restoredFor.current = who.id
      if (draft && draft.cart.length > 0) {
        const live = new Map(menuItems.map(m => [m.id, m]))
        setCart(draft.cart
          .filter(i => live.get(i.id)?.is_available)
          .map(i => ({ ...i, price: Number(live.get(i.id)!.price) })))
        setTableId(draft.tableId)
        setDiscount(draft.discount)
        setNote(draft.note)
        setGuestId(draft.guestId)
        setSuccess('Welcome back — your open order was restored')
        setTimeout(() => setSuccess(''), 3000)
      }
      setWaiter(who)
      setPinFor(null); setPinInput('')
    } catch (e) {
      // Keep the PIN pad open with the digits still entered so the waiter can
      // see/correct their mistake — never clear the form, never sign anyone out.
      setPinError(getApiErrorMessage(e, 'Incorrect PIN. Please try to remember your PIN or contact your administrator to reset it.'))
    } finally { setPinBusy(false) }
  }

  // Lock = sign the waiter out of the POS only (the app session stays). Their open
  // order is already saved; the screen is cleared so the next waiter starts fresh.
  const lockPos = () => {
    restoredFor.current = null
    setWaiter(null); setPinFor(null); setPinInput(''); setPinError('')
    setCart([]); setDiscount(0); setNote(''); setGuestId('')
    setBookingId(''); setGuestName(''); setRoomNumber('')
    setPayOpen(false); setAmountPaid('')
  }

  // Auto-save the active waiter's draft on every change
  useEffect(() => {
    if (!waiter || restoredFor.current !== waiter.id) return
    if (cart.length === 0) clearDraft(waiter.id)
    else saveDraft(waiter.id, { cart, tableId, discount, note, guestId })
  }, [waiter, cart, tableId, discount, note, guestId])

  // Physical keyboard on the PIN pad: 0-9, Backspace, Enter = unlock, Esc = back
  useEffect(() => {
    if (!pinFor || waiter) return
    const onKey = (e: KeyboardEvent) => {
      if (pinBusy) return
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tapPin(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); setPinInput(p => p.slice(0, -1)); setPinError('') }
      else if (e.key === 'Enter') { e.preventDefault(); submitPin() }
      else if (e.key === 'Escape') { setPinFor(null); setPinInput(''); setPinError('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinFor, waiter, pinBusy, pinInput])

  // The person who is signed in to the system is the one at the till: open straight on THEIR PIN pad
  // (one time per visit; "Back" still lets another waiter choose their own name).
  const autoPicked = useRef(false)
  useEffect(() => {
    if (autoPicked.current || waiter || pinFor || posStaff.length === 0) return
    const me = posStaff.find(s => s.is_me && s.has_pin)
    if (me) { autoPicked.current = true; setPinFor(me); setPinInput(''); setPinError('') }
  }, [posStaff, waiter, pinFor])

  // "My sales today" — what this waiter has collected so far
  const [mySales, setMySales] = useState<{ collected: number; orders: number } | null>(null)
  const loadMySales = useCallback(() => {
    if (!waiter) { setMySales(null); return }
    api.get('/restaurant/pos/my-sales', { params: { staff_id: waiter.id } }).then(r => setMySales(r.data.data)).catch(() => undefined)
  }, [waiter])
  useEffect(() => { loadMySales() }, [loadMySales, success])

  const filtered = useMemo(() => {
    let items = cat === 'all' ? menuItems : menuItems.filter(i => i.category_id === cat)
    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    return items.filter(i => i.is_available)
  }, [menuItems, cat, search])

  const addItem = (item: ApiMenuItem) =>
    setCart(c => {
      const found = c.find(i => i.id === item.id)
      if (found) return c.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i)
      return [...c, { id: item.id, name: item.name, price: Number(item.price), qty: 1, image_url: item.image_url }]
    })

  const updateQty  = (id: string, delta: number) =>
    setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))

  const removeItem = (id: string) => setCart(c => c.filter(i => i.id !== id))
  const clearCart  = () => { setCart([]); setDiscount(0); setNote('') }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt = (subtotal * discount) / 100
  // VAT rate comes from Systems → Company Info — same rate the server applies at billing
  const vatRate     = Number(org?.vat_rate ?? 5)
  const tax         = Math.round((subtotal - discountAmt) * (vatRate / 100) * 100) / 100
  const total       = subtotal - discountAmt + tax
  const totalQty    = cart.reduce((s, i) => s + i.qty, 0)
  const paid        = parseFloat(amountPaid || '0')
  const change      = paid - total

  const selectedTable = tables.find(t => t.id === tableId)
  const cashierName   = user?.full_name ?? user?.email ?? 'Cashier'
  const tableLabel    = selectedTable
    ? `${selectedTable.table_number} (${selectedTable.area_name})`
    : 'Takeaway'

  const stamp = () => new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  // ── KOT: kitchen ticket — items + qty only, no prices ──────────────────────
  const printKOT = () => {
    if (cart.length === 0) return
    const rows = cart.map(i =>
      `<tr><td class="qty lg">${i.qty}×</td><td class="lg">${esc(i.name)}</td></tr>`
    ).join('')

    printHtml(`
      <div class="center bold xl">*** KITCHEN ORDER ***</div>
      <div class="center sm mt">${esc(org?.name ?? '')}</div>
      <hr/>
      <table class="md">
        <tr><td>Order</td><td class="right bold">#${String(orderNum).padStart(3, '0')}</td></tr>
        <tr><td>Table</td><td class="right bold">${esc(tableLabel)}</td></tr>
        <tr><td>Waiter</td><td class="right bold">${esc(waiter?.name ?? cashierName)}</td></tr>
        <tr><td>Time</td><td class="right">${stamp()}</td></tr>
      </table>
      <hr/>
      <table>${rows}</table>
      ${note ? `<div class="note bold">NOTE: ${esc(note)}</div>` : ''}
      <hr/>
      <div class="xs">Printed by: ${esc(waiter?.name ?? cashierName)} · ${stamp()}</div>
    `)

    // Track who printed — visible in Settings → Activity Logs
    api.post('/system/audit/print', {
      action: 'PRINT_KOT',
      details: { order: orderNum, table: tableLabel, items: totalQty, printed_by: waiter?.name ?? cashierName },
    }).catch(() => {})

    setSuccess('KOT sent to printer')
    setTimeout(() => setSuccess(''), 2500)
  }

  // ── Receipt: full customer invoice with company header ─────────────────────
  const printReceipt = (data: {
    orderRef: string; items: CartItem[]; subtotal: number; discount: number
    discountAmt: number; tax: number; total: number; method: PaymentMethod
    paid: number; change: number; guest?: string; room?: string
  }) => {
    const rows = data.items.map(i => `
      <tr>
        <td class="qty">${i.qty}×</td>
        <td>${esc(i.name)}<div class="xs">@ $${i.price.toFixed(2)}</div></td>
        <td class="amt">$${(i.price * i.qty).toFixed(2)}</td>
      </tr>`).join('')

    const methodLabel: Partial<Record<PaymentMethod, string>> = {
      cash: 'Cash', card: 'Card', mobile: 'Mobile Money', room_charge: 'Room Charge',
    }

    printHtml(`
      ${companyHeader(org)}
      <hr/>
      <div class="center bold lg">SALES RECEIPT</div>
      <table class="sm mt">
        <tr><td>Receipt</td><td class="right bold">${esc(data.orderRef)}</td></tr>
        <tr><td>Table</td><td class="right">${esc(tableLabel)}</td></tr>
        <tr><td>Date</td><td class="right">${stamp()}</td></tr>
        <tr><td>Cashier</td><td class="right">${esc(cashierName)}</td></tr>
        ${data.guest ? `<tr><td>Guest</td><td class="right">${esc(data.guest)}${data.room ? ` · Room ${esc(data.room)}` : ''}</td></tr>` : ''}
      </table>
      <hr/>
      <table>${rows}</table>
      <hr/>
      <table class="md">
        <tr><td>Subtotal</td><td class="right">$${data.subtotal.toFixed(2)}</td></tr>
        ${data.discount > 0 ? `<tr><td>Discount (${data.discount}%)</td><td class="right">-$${data.discountAmt.toFixed(2)}</td></tr>` : ''}
        <tr><td>VAT (${vatRate}%)</td><td class="right">$${data.tax.toFixed(2)}</td></tr>
        <tr class="bold lg"><td>TOTAL</td><td class="right">$${data.total.toFixed(2)}</td></tr>
      </table>
      <hr/>
      <table class="md">
        <tr><td>Paid by</td><td class="right bold">${methodLabel[data.method] ?? data.method}</td></tr>
        ${data.method === 'cash' ? `
          <tr><td>Received</td><td class="right">$${data.paid.toFixed(2)}</td></tr>
          <tr><td>Change</td><td class="right bold">$${Math.max(0, data.change).toFixed(2)}</td></tr>` : ''}
      </table>
      <hr/>
      <div class="center sm bold mt">Thank you — welcome again!</div>
      <div class="center xs mt">Printed by ${esc(cashierName)} · ${stamp()}</div>
    `)

    api.post('/system/audit/print', {
      action: 'PRINT_RECEIPT',
      details: {
        receipt: data.orderRef, table: tableLabel, total: data.total,
        method: data.method, printed_by: cashierName,
      },
    }).catch(() => {})
  }

  // True once the server has accepted the first call for the current attempt — after that, a dropped
  // connection must NOT fall back to the offline outbox (the order would exist twice).
  const serverHasOrder = useRef(false)

  // Keep the order on this device (outbox) — it is sent automatically when the internet is back
  const saveOffline = (kind: 'kitchen' | 'pay') => {
    const entry: OutboxEntry = {
      id: newClientRef(), kind, created_at: new Date().toISOString(), label: tableLabel,
      waiter_id: waiter?.id, waiter_name: waiter?.name, total: Math.round(total * 100) / 100,
      order: {
        dining_table_id: tableId || null, order_type: tableId ? 'dine_in' : 'takeaway',
        discount_amount: Math.round(discountAmt * 100) / 100, guest_id: guestId || undefined,
        lines: cart.map(i => ({ menu_item_id: i.id, quantity: i.qty, special_request: note || undefined })),
      },
      pay: kind === 'pay' ? { method: payMethod === 'mobile' ? 'mobile' : payMethod, account_id: accountId } : undefined,
      status: 'pending',
      receipt: kind === 'pay' ? 'OFF-' + Date.now().toString(36).toUpperCase().slice(-6) : undefined,
    }
    addToOutbox(entry)
    if (kind === 'kitchen') {
      printKOT()
      setSuccess('No internet — order saved on this device and KOT printed. It will reach the kitchen screen when the connection returns.')
    } else {
      printReceipt({
        orderRef: entry.receipt!, items: [...cart], subtotal, discount, discountAmt, tax, total, method: payMethod, paid, change,
        guest: guests.find(g => g.id === guestId) ? `${guests.find(g => g.id === guestId)!.first_name} ${guests.find(g => g.id === guestId)!.last_name}` : (guestName || undefined),
        room: roomNumber || undefined,
      })
      setPayOpen(false); setAmountPaid(''); setGuestName(''); setRoomNumber(''); setBookingId('')
      setSuccess('No internet — sale saved on this device and receipt printed. The payment will be recorded when the connection returns.')
    }
    setTimeout(() => setSuccess(''), 6000)
    setOrderNum(n => n + 1)
    clearCart(); setGuestId('')
  }

  // Create the order + its lines, tracked to the logged-in waiter
  const createOrderWithLines = async (approval: ApprovalBody = {}) => {
    const r = await api.post('/restaurant/orders', {
      ...approval,
      dining_table_id: tableId || null,
      order_type: tableId ? 'dine_in' : 'takeaway',
      server_staff_id: waiter?.id,
      discount_amount: discountAmt,
      booking_id: payMethod === 'room_charge' && bookingId ? bookingId : undefined,
    })
    serverHasOrder.current = true
    const orderId: string = r.data.data.id
    await Promise.all(cart.map(item =>
      api.post(`/restaurant/orders/${orderId}/lines`, {
        menu_item_id: item.id,
        quantity: item.qty,
        special_request: note || undefined,
      })
    ))
    return { orderId, orderRef: r.data.data.order_ref as string }
  }

  // ── Waiter flow: Send to Kitchen — KOT prints, kitchen (Orders page) takes over
  const sendToKitchen = async () => {
    if (cart.length === 0 || syncing) return
    setSyncing(true); setError('')
    serverHasOrder.current = false
    try {
      if (!navigator.onLine) { saveOffline('kitchen'); return }
      const { orderId, orderRef } = await createOrderWithLines()
      await api.patch(`/restaurant/orders/${orderId}/status`, {
        status: 'sent_to_kitchen', staff_id: waiter?.id,
      })
      if (tableId) {
        await api.patch(`/restaurant/tables/${tableId}/status`, { status: 'occupied' }).catch(() => {})
      }
      printKOT()
      setOrderNum(n => n + 1)
      setSuccess(`${orderRef} sent to kitchen — KOT printed`)
      setTimeout(() => setSuccess(''), 3000)
      clearCart()
      setGuestId('')
    } catch (e) {
      // connection dropped before the server saw anything → keep the order on this device
      if (isNetworkError(e) && !serverHasOrder.current) saveOffline('kitchen')
      else setError(getApiErrorMessage(e))
    }
    finally { setSyncing(false) }
  }

  // ── Cashier flow: Bill & Pay — order → unpaid invoice → payment recorded
  const handlePay = async () => {
    if (cart.length === 0 || (payMethod !== 'room_charge' && !accountId)) return
    setSyncing(true); setError('')
    serverHasOrder.current = false
    try {
      // A discount above the limit needs a manager's PIN BEFORE the order is created
      const needsApproval = !approvalPolicy.self && discount > 0 && discount > approvalPolicy.limit
      if (!navigator.onLine) {
        // Offline: cash/card/mobile sales can wait for the connection; a room charge and a manager-approved discount cannot
        if (payMethod === 'room_charge') { setError('Room charge needs the internet (it must find the guest in the hotel). Take cash/mobile payment, or wait for the connection.'); return }
        if (needsApproval) { setError(`A ${discount}% discount needs a manager's PIN, which cannot be checked offline. Lower the discount to ${approvalPolicy.limit}% or less, or wait for the connection.`); return }
        saveOffline('pay'); return
      }
      const { orderId, orderRef } = needsApproval
        ? await withApproval(body => createOrderWithLines(body), { label: `${discount}% discount (limit without a manager: ${approvalPolicy.limit}%)`, needsPin: true })
        : await createOrderWithLines()

      // 1. Generate the real invoice (starts unpaid/issued)
      const billRes = await withApproval(body => api.post(`/restaurant/orders/${orderId}/bill`, {
        guest_id: guestId || undefined, ...body,
      }))
      const invoice = billRes.data.data

      // 2. Record the payment against it → invoice becomes paid, shows in Receipts
      await api.post(`/accounting/invoices/${invoice.id}/payment`, {
        amount: Number(invoice.total_amount),
        payment_method: payMethod === 'mobile' ? 'mobile' : payMethod,
        account_id: payMethod === 'room_charge' ? undefined : accountId,
        staff_id: waiter?.id,          // the money is recorded under the waiter who collected it
      })

      if (tableId) {
        await api.patch(`/restaurant/tables/${tableId}/status`, { status: 'cleaning' })
      }

      const guestRec = guests.find(g => g.id === guestId)

      // Snapshot BEFORE clearing the cart, then print the customer receipt
      printReceipt({
        orderRef: invoice.invoice_number ?? orderRef,
        items: [...cart], subtotal, discount, discountAmt, tax, total,
        method: payMethod, paid, change,
        guest: guestRec ? `${guestRec.first_name} ${guestRec.last_name}` : (guestName || undefined),
        room: roomNumber || undefined,
      })

      setOrderNum(n => n + 1)
      setSuccess(`${invoice.invoice_number} paid — receipt printed!`)
      setTimeout(() => setSuccess(''), 3000)
      setPayOpen(false)
      clearCart()
      setAmountPaid('')
      setGuestName('')
      setRoomNumber('')
      setBookingId('')
      setGuestId('')
    } catch (e) {
      if (isApprovalCancelled(e)) { /* dialog dismissed */ }
      else if (isNetworkError(e) && !serverHasOrder.current && payMethod !== 'room_charge' && !(!approvalPolicy.self && discount > approvalPolicy.limit)) saveOffline('pay')
      else setError(getApiErrorMessage(e))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={22} className="animate-spin text-neutral-400"/>
      </div>
    )
  }

  return (
    <div className="relative flex h-full overflow-hidden bg-neutral-50 dark:bg-[#0f1117]">
      {waiter && <ReadyAlerts waiterId={waiter.id} />}

      {/* ══ WAITER LOCK SCREEN — pick your name, enter your PIN ══ */}
      {!waiter && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-100/95 backdrop-blur-sm dark:bg-[#0f1117]/95">
          <div className="w-full max-w-[560px] p-6">
            {!pinFor ? (
              <>
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/30">
                    <Lock size={24} className="text-white"/>
                  </div>
                  <h2 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Who is working?</h2>
                  <p className="mt-1 text-[13px] text-neutral-500">Select your name, then enter your PIN</p>
                </div>
                {posStaff.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-[13px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    No POS staff found — add waiters/cashiers in HR → Staff and set their PIN.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {posStaff.map(s => (
                      <button key={s.id}
                        onClick={() => { setPinFor(s); setPinInput(''); setPinError('') }}
                        className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-md dark:border-white/[0.08] dark:bg-[#1c2333]">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-[15px] font-black text-white">
                          {(s.first_name[0] + (s.last_name[0] ?? '')).toUpperCase()}
                        </div>
                        <p className="text-[13px] font-bold text-neutral-800 dark:text-white">{s.first_name} {s.last_name}</p>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold capitalize text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                          {s.role.replace(/_/g,' ')}
                        </span>
                        {!s.has_pin && <span className="text-[9.5px] font-semibold text-rose-500">No PIN set</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="mx-auto w-full max-w-[300px]">
                <div className="mb-5 text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-[14px] font-black text-white">
                    {(pinFor.first_name[0] + (pinFor.last_name[0] ?? '')).toUpperCase()}
                  </div>
                  <p className="text-[15px] font-extrabold text-neutral-900 dark:text-white">{pinFor.first_name} {pinFor.last_name}</p>
                  <p className="text-[12px] text-neutral-400">Enter your PIN <span className="text-neutral-300">· keyboard works too</span></p>
                </div>

                {/* PIN dots */}
                <div className="mb-4 flex justify-center gap-2.5">
                  {[...Array(6)].map((_, i) => (
                    <span key={i} className={`h-3 w-3 rounded-full transition-colors ${
                      i < pinInput.length ? 'bg-orange-500' : 'bg-neutral-200 dark:bg-white/[0.1]'
                    }`}/>
                  ))}
                </div>
                {pinError && <p className="mb-3 text-center text-[12px] font-bold text-rose-500">{pinError}</p>}

                {/* PIN pad */}
                <div className="grid grid-cols-3 gap-2">
                  {['1','2','3','4','5','6','7','8','9'].map(d => (
                    <button key={d} onClick={() => tapPin(d)}
                      className="h-14 rounded-xl bg-white text-[18px] font-extrabold text-neutral-800 shadow-sm hover:bg-orange-50 active:scale-95 transition-all dark:bg-[#1c2333] dark:text-white dark:hover:bg-white/[0.08]">
                      {d}
                    </button>
                  ))}
                  <button onClick={() => { setPinFor(null); setPinInput(''); setPinError('') }}
                    className="h-14 rounded-xl bg-neutral-200 text-[12px] font-bold text-neutral-600 hover:bg-neutral-300 active:scale-95 transition-all dark:bg-white/[0.06] dark:text-neutral-300">
                    Back
                  </button>
                  <button onClick={() => tapPin('0')}
                    className="h-14 rounded-xl bg-white text-[18px] font-extrabold text-neutral-800 shadow-sm hover:bg-orange-50 active:scale-95 transition-all dark:bg-[#1c2333] dark:text-white dark:hover:bg-white/[0.08]">
                    0
                  </button>
                  <button onClick={() => setPinInput(p => p.slice(0, -1))}
                    className="flex h-14 items-center justify-center rounded-xl bg-neutral-200 text-neutral-600 hover:bg-neutral-300 active:scale-95 transition-all dark:bg-white/[0.06] dark:text-neutral-300">
                    <Delete size={18}/>
                  </button>
                </div>

                <button onClick={submitPin} disabled={pinInput.length < 4 || pinBusy}
                  className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-[15px] font-extrabold text-white shadow-lg shadow-orange-500/25 hover:bg-orange-600 disabled:opacity-40 active:scale-[0.99] transition-all">
                  {pinBusy ? <RefreshCw size={16} className="animate-spin"/> : <Lock size={15}/>} Unlock POS
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ LEFT: Products ══ */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Connection / offline outbox status */}
        {(!online || outbox.length > 0) && (
          <div className={`shrink-0 border-b px-4 py-2 ${!online ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10' : 'border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10'}`}>
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              {!online
                ? <span className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300"><WifiOff size={14}/> Offline — you can keep taking orders</span>
                : <span className="flex items-center gap-1.5 font-bold text-sky-700 dark:text-sky-300"><UploadCloud size={14}/> {sending ? 'Sending saved orders…' : 'Saved orders waiting to be sent'}</span>}
              {outbox.length > 0 && (
                <button onClick={() => setShowOutbox(s => !s)} className="rounded-full bg-white/70 px-2.5 py-0.5 font-bold text-neutral-700 hover:bg-white dark:bg-white/10 dark:text-neutral-200">
                  {outbox.length} saved on this device {outbox.some(o => o.status === 'error') && '· needs attention'}
                </button>)}
              <div className="flex-1"/>
              {online && outbox.some(o => o.status === 'pending') && !sending && (
                <button onClick={() => flushOutbox()} className="rounded-lg bg-sky-600 px-3 py-1 text-[11.5px] font-bold text-white hover:bg-sky-700">Send now</button>)}
            </div>
            {showOutbox && outbox.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {outbox.map(o => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-[12px] dark:bg-white/[0.06]">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${o.kind === 'pay' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{o.kind === 'pay' ? 'Sale' : 'Kitchen'}</span>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-200">{o.label}</span>
                    <span className="text-neutral-500">{o.order.lines.reduce((s, l) => s + l.quantity, 0)} items · ${o.total.toFixed(2)} · {new Date(o.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{o.waiter_name ? ` · ${o.waiter_name}` : ''}</span>
                    {o.receipt && <span className="font-mono text-[10.5px] text-neutral-400">{o.receipt}</span>}
                    {o.status === 'error' && (
                      <span className="flex flex-1 items-center gap-1.5 text-rose-600"><AlertTriangle size={12}/> {o.error}
                        <button onClick={() => { retryOutboxEntry(o.id); flushOutbox() }} className="ml-auto rounded-md bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">Retry</button>
                        <button onClick={() => { if (window.confirm('Discard this saved order? It will NOT reach the server.')) removeFromOutbox(o.id) }} className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Discard</button>
                      </span>)}
                  </li>))}
              </ul>)}
          </div>
        )}

        {/* Top bar */}
        <div className="shrink-0 border-b border-neutral-200/60 bg-white dark:border-white/[0.06] dark:bg-[#1c2333]">
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Table selector */}
            <div className="w-[190px] shrink-0">
              <Select value={tableId} onChange={setTableId} placeholder="Takeaway"
                options={tables.map(t => ({ value: t.id, label: `${t.table_number} (${t.area_name})` }))}/>
            </div>

            {/* Search */}
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <Search size={14} className="shrink-0 text-neutral-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="flex-1 bg-transparent text-[13px] text-neutral-800 dark:text-white placeholder-neutral-400 outline-none min-w-0"/>
              {search && <button onClick={() => setSearch('')}><X size={12} className="text-neutral-400"/></button>}
            </div>

            {/* My sales today */}
            {waiter && mySales && (
              <div title="Money you have collected today" className="hidden shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/25 dark:bg-emerald-500/10 md:flex">
                <Banknote size={14} className="text-emerald-600"/>
                <span className="text-[12.5px] font-bold text-emerald-700 dark:text-emerald-300">${mySales.collected.toFixed(2)}</span>
                <span className="text-[10.5px] text-emerald-600/80">today · {mySales.orders} order{mySales.orders === 1 ? '' : 's'}</span>
              </div>
            )}

            {/* Active waiter — tap to lock / switch */}
            {waiter && (
              <button onClick={lockPos} title="Lock / switch waiter"
                className="flex shrink-0 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 hover:bg-orange-100 transition-colors dark:border-orange-500/25 dark:bg-orange-500/10">
                <UserCircle2 size={15} className="text-orange-500"/>
                <span className="text-[12.5px] font-bold text-orange-700 dark:text-orange-300">{waiter.name}</span>
                <Lock size={11} className="text-orange-400"/>
              </button>
            )}

            {/* Cart badge */}
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">
                <ShoppingCart size={16}/>
              </div>
              {totalQty > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white ring-2 ring-white dark:ring-[#0f1117]">
                  {totalQty}
                </span>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5">
            <button onClick={() => setCat('all')}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
                cat === 'all' ? 'bg-orange-500 text-white shadow-sm' : 'bg-neutral-100 text-neutral-500 hover:bg-orange-50 hover:text-orange-600 dark:bg-white/[0.05] dark:text-neutral-400'
              }`}>
              All
            </button>
            {menuCats.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
                  cat === c.id ? 'bg-orange-500 text-white shadow-sm' : 'bg-neutral-100 text-neutral-500 hover:bg-orange-50 hover:text-orange-600 dark:bg-white/[0.05] dark:text-neutral-400'
                }`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Error/Success banners */}
        {error && (
          <div className="mx-4 mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>
        )}
        {success && (
          <div className="mx-4 mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{success}</div>
        )}

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <Search size={28} className="text-neutral-300"/>
              <p className="text-[13px] text-neutral-400">
                {search ? `No items match "${search}"` : 'No menu items found'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map(item => {
                const inCart = cart.find(i => i.id === item.id)
                return (
                  <button key={item.id} onClick={() => addItem(item)}
                    className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200/60 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/[0.06] dark:bg-[#1c2333]">
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
                        : <div className="flex h-full flex-col items-center justify-center gap-1.5 text-neutral-300 dark:text-neutral-600">
                            <UtensilsCrossed size={26} strokeWidth={1.5}/>
                            <span className="text-[9.5px] font-semibold uppercase tracking-wide">No photo</span>
                          </div>
                      }
                      {inCart && (
                        <span className="absolute right-2 top-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-black text-white shadow">
                          {inCart.qty}
                        </span>
                      )}
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                        {item.category_name}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-[12.5px] font-bold leading-tight text-neutral-800 dark:text-white">{item.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[14px] font-extrabold text-orange-500">${Number(item.price).toFixed(2)}</span>
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                          <Plus size={12}/>
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ RIGHT: Order Panel ══ */}
      <div className="flex w-[340px] shrink-0 flex-col border-l border-neutral-200/60 bg-white dark:border-white/[0.06] dark:bg-[#1c2333]">

        {/* Order header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3.5 dark:border-white/[0.05]">
          <div>
            <p className="text-[15px] font-extrabold text-neutral-900 dark:text-white">
              Order <span className="text-orange-500">#{String(orderNum).padStart(3, '0')}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-400">
              {selectedTable ? `${selectedTable.table_number} · ${selectedTable.area_name}` : 'Takeaway'}
              {totalQty > 0 && <> · {totalQty} item{totalQty !== 1 ? 's' : ''}</>}
            </p>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart}
              className="rounded-lg bg-rose-50 p-1.5 text-rose-500 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
              <Trash2 size={13}/>
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.05]">
                <ShoppingCart size={26} className="text-neutral-300 dark:text-neutral-600"/>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">No items yet</p>
                <p className="mt-0.5 text-[12px] text-neutral-400">Click a product to add it</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 p-3">
              {cart.map((item, idx) => (
                <div key={item.id}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-black text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                    {idx + 1}
                  </span>
                  {item.image_url
                    ? <img src={item.image_url} alt=""
                        className="h-10 w-10 shrink-0 rounded-xl object-cover bg-neutral-200 dark:bg-white/[0.06]"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
                    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-[18px] dark:bg-white/[0.06]">🍽️</div>
                  }
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-neutral-800 dark:text-neutral-100">{item.name}</p>
                    <p className="text-[11px] font-semibold text-orange-500">
                      ${item.price.toFixed(2)} × {item.qty} = <span className="text-neutral-700 dark:text-neutral-200">${(item.price * item.qty).toFixed(2)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateQty(item.id, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 hover:bg-rose-100 hover:text-rose-600 dark:bg-white/[0.06] dark:text-neutral-400 transition-colors">
                      <Minus size={10}/>
                    </button>
                    <span className="w-5 text-center text-[12px] font-bold text-neutral-800 dark:text-white">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                      <Plus size={10}/>
                    </button>
                  </div>
                  <button onClick={() => removeItem(item.id)}
                    className="shrink-0 text-neutral-300 hover:text-rose-500 dark:text-neutral-600 transition-colors">
                    <X size={13}/>
                  </button>
                </div>
              ))}

              {/* Customer (optional — attaches to the invoice) */}
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Customer (optional)</p>
                <Select value={guestId} onChange={setGuestId} placeholder="Walk-in customer"
                  options={guests.map(g => ({ value: g.id, label: `${g.first_name} ${g.last_name}${g.phone ? ` · ${g.phone}` : ''}` }))}/>
              </div>

              {/* Note */}
              <div className="mt-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Order Note</p>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Add note for kitchen…"
                  className="w-full bg-transparent text-[12px] text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 outline-none"/>
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        {cart.length > 0 && (
          <div className="border-t border-neutral-100 dark:border-white/[0.05] px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-neutral-500">Subtotal</span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-neutral-500">Discount</span>
              <div className="flex items-center gap-1.5">
                <select value={discount} onChange={e => setDiscount(Number(e.target.value))}
                  className="rounded-lg border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-neutral-700 outline-none dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-neutral-300 dark:[color-scheme:dark]">
                  {[0,5,10,15,20].map(v => <option key={v} value={v}>{v}%</option>)}
                </select>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">-${discountAmt.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-neutral-500">VAT ({vatRate}%)</span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">${tax.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-orange-50 px-3 py-2.5 dark:bg-orange-500/10">
              <span className="text-[14px] font-extrabold text-neutral-900 dark:text-white">Total</span>
              <span className="text-[20px] font-extrabold text-orange-500">${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="border-t border-neutral-100 dark:border-white/[0.05] p-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={sendToKitchen} disabled={cart.length === 0 || syncing}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-100 py-2.5 text-[12.5px] font-bold text-amber-800 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
              {syncing ? <RefreshCw size={14} className="animate-spin"/> : <ChefHat size={14}/>} Send to Kitchen
            </button>
            <button onClick={() => cart.length > 0 && setPayOpen(true)} disabled={cart.length === 0 || syncing}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-[12.5px] font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors shadow-sm">
              {syncing ? <RefreshCw size={14} className="animate-spin"/> : <CreditCard size={14}/>} Bill & Pay
            </button>
          </div>
          <p className="text-center text-[10.5px] text-neutral-400">
            {cart.length > 0
              ? `${totalQty} items · ${selectedTable ? selectedTable.table_number : 'Takeaway'}`
              : 'Add items to place an order'}
          </p>
        </div>
      </div>

      {/* Payment Modal */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1c2333]">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-white/[0.05]">
              <div>
                <p className="text-[15px] font-extrabold text-neutral-900 dark:text-white">Collect Payment</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Order #{String(orderNum).padStart(3,'0')} · {selectedTable ? selectedTable.table_number : 'Takeaway'} · {totalQty} items
                </p>
              </div>
              <button onClick={() => setPayOpen(false)}
                className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] transition-colors">
                <X size={16}/>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Total banner */}
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 shadow-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Total Amount</p>
                  <p className="mt-0.5 text-[28px] font-extrabold text-white leading-none">${total.toFixed(2)}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                  <CreditCard size={22} className="text-white"/>
                </div>
              </div>

              {/* Payment methods */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Payment Method</p>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { key: 'cash',        label: 'Cash',   Icon: Banknote   },
                    { key: 'card',        label: 'Card',   Icon: CreditCard },
                    { key: 'mobile',      label: 'Mobile', Icon: Smartphone },
                    { key: 'room_charge', label: 'Room',   Icon: Zap        },
                  ] as { key: PaymentMethod; label: string; Icon: React.ComponentType<{size?:number}> }[]).map(m => (
                    <button key={m.key} onClick={() => setPayMethod(m.key)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 text-[11px] font-bold transition-all ${
                        payMethod === m.key
                          ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400'
                          : 'border-neutral-200 text-neutral-500 hover:border-orange-300 dark:border-white/[0.08] dark:text-neutral-400'
                      }`}>
                      <m.Icon size={18}/>{m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deposit account — every method except room charge lands the
                  money in one of the business's own cash/bank accounts */}
              {payMethod !== 'room_charge' && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Deposit To</p>
                  <Select value={accountId} onChange={setAccountId} placeholder="— Select account —"
                    options={accounts.map(a => ({ value: a.id, label: `${a.name} (${a.account_type.replace(/_/g,' ')})` }))}/>
                </div>
              )}

              {/* Room charge fields */}
              {payMethod === 'room_charge' && (
                <div className="space-y-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 p-3">
                  <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">Charge to a checked-in guest</p>
                  <select value={bookingId} onChange={e => pickBooking(e.target.value)}
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[12px] outline-none dark:border-indigo-500/20 dark:bg-[#1c2333] dark:text-white">
                    <option value="">— Select room / guest —</option>
                    {inHouse.map(b => (
                      <option key={b.id} value={b.id}>Room {b.room_number} · {b.guest_name} ({b.booking_ref})</option>
                    ))}
                  </select>
                  {inHouse.length === 0 && (
                    <p className="text-[11px] text-indigo-600/80 dark:text-indigo-300/70">No guests are checked in right now.</p>
                  )}
                </div>
              )}

              {/* Bill breakdown */}
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/60 dark:divide-white/[0.05] dark:border-white/[0.06]">
                {[
                  { label: 'Subtotal',               value: `$${subtotal.toFixed(2)}`,     cls: '' },
                  { label: `Discount (${discount}%)`, value: `-$${discountAmt.toFixed(2)}`, cls: 'text-emerald-600 dark:text-emerald-400' },
                  { label: `VAT (${vatRate}%)`,       value: `$${tax.toFixed(2)}`,           cls: '' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
                    <span className="text-neutral-500">{r.label}</span>
                    <span className={`font-semibold text-neutral-800 dark:text-neutral-200 ${r.cls}`}>{r.value}</span>
                  </div>
                ))}
              </div>

              {/* Cash input */}
              {payMethod === 'cash' && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Amount Received
                  </label>
                  <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                    placeholder={`Min. $${total.toFixed(2)}`}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[15px] font-bold text-neutral-800 outline-none transition-colors focus:border-orange-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white"/>
                  {amountPaid && (
                    <p className={`mt-1.5 text-[12px] font-bold ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                      {change >= 0 ? `Change: $${change.toFixed(2)}` : `Need $${Math.abs(change).toFixed(2)} more`}
                    </p>
                  )}
                </div>
              )}

              {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

              <button
                onClick={handlePay}
                disabled={
                  syncing ||
                  (payMethod === 'cash' && paid < total) ||
                  (payMethod === 'room_charge' && !bookingId) ||
                  (payMethod !== 'room_charge' && !accountId)
                }
                className="w-full rounded-xl bg-orange-500 py-3.5 text-[14px] font-extrabold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors">
                {syncing
                  ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin"/> Processing…</span>
                  : `Collect $${total.toFixed(2)}`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
