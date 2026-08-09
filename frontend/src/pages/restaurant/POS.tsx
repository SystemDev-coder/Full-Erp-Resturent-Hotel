import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search, Plus, Minus, Trash2, CreditCard, X,
  ShoppingCart, Banknote, Smartphone, Zap, RefreshCw,
  ChefHat, Lock, Delete, UserCircle2, UtensilsCrossed,
} from 'lucide-react'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@hooks/useAuth'
import { printHtml, esc, companyHeader, type OrgInfo } from '@utils/print'
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
}
interface PosGuest { id: string; first_name: string; last_name: string; phone?: string }
interface ActiveWaiter { id: string; name: string; role: string }
interface ApiAccount { id: string; name: string; account_type: string }

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
  const [note,       setNote]       = useState('')
  const [guestName,  setGuestName]  = useState('')
  const [roomNumber, setRoomNumber] = useState('')

  // Waiter PIN lock — nobody uses the POS anonymously
  const [posStaff, setPosStaff] = useState<PosStaff[]>([])
  const [waiter,   setWaiter]   = useState<ActiveWaiter | null>(null)
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, cRes, tRes, oRes, sRes, gRes, aRes] = await Promise.all([
        api.get('/restaurant/menu/items'),
        api.get('/restaurant/menu/categories'),
        api.get('/restaurant/tables'),
        api.get('/system/organization').catch(() => null), // header info for tickets
        api.get('/restaurant/pos/staff').catch(() => null),
        api.get('/hotel/guests').catch(() => null),
        api.get('/accounting/accounts').catch(() => null),
      ])
      setMenuItems(iRes.data.data)
      setMenuCats(cRes.data.data)
      setTables(tRes.data.data)
      if (oRes) setOrg(oRes.data.data)
      if (sRes) setPosStaff(sRes.data.data)
      if (gRes) setGuests(gRes.data.data)
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
      const r = await api.post('/restaurant/pos/verify-pin', { staff_id: pinFor.id, pin: pinInput })
      setWaiter(r.data.data)
      setPinFor(null); setPinInput('')
    } catch (e) {
      // Keep the PIN pad open with the digits still entered so the waiter can
      // see/correct their mistake — never clear the form, never sign anyone out.
      setPinError(getApiErrorMessage(e, 'Incorrect PIN. Please try to remember your PIN or contact your administrator to reset it.'))
    } finally { setPinBusy(false) }
  }

  const lockPos = () => { setWaiter(null); setPinFor(null); setPinInput(''); setPinError('') }

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

  // Create the order + its lines, tracked to the logged-in waiter
  const createOrderWithLines = async () => {
    const r = await api.post('/restaurant/orders', {
      dining_table_id: tableId || null,
      order_type: tableId ? 'dine_in' : 'takeaway',
      server_staff_id: waiter?.id,
      discount_amount: discountAmt,
    })
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
    try {
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
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSyncing(false) }
  }

  // ── Cashier flow: Bill & Pay — order → unpaid invoice → payment recorded
  const handlePay = async () => {
    if (cart.length === 0 || (payMethod !== 'room_charge' && !accountId)) return
    setSyncing(true); setError('')
    try {
      const { orderId, orderRef } = await createOrderWithLines()

      // 1. Generate the real invoice (starts unpaid/issued)
      const billRes = await api.post(`/restaurant/orders/${orderId}/bill`, {
        guest_id: guestId || undefined,
      })
      const invoice = billRes.data.data

      // 2. Record the payment against it → invoice becomes paid, shows in Receipts
      await api.post(`/accounting/invoices/${invoice.id}/payment`, {
        amount: Number(invoice.total_amount),
        payment_method: payMethod === 'mobile' ? 'mobile' : payMethod,
        account_id: payMethod === 'room_charge' ? undefined : accountId,
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
      setGuestId('')
    } catch (e) {
      setError(getApiErrorMessage(e))
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
                  <p className="text-[12px] text-neutral-400">Enter your PIN</p>
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
                  <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">Room Charge Details</p>
                  <input value={guestName} onChange={e => setGuestName(e.target.value)}
                    placeholder="Guest Name"
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[12px] outline-none dark:border-indigo-500/20 dark:bg-white/[0.04] dark:text-white"/>
                  <input value={roomNumber} onChange={e => setRoomNumber(e.target.value)}
                    placeholder="Room Number"
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[12px] outline-none dark:border-indigo-500/20 dark:bg-white/[0.04] dark:text-white"/>
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
                  (payMethod === 'room_charge' && (!guestName.trim() || !roomNumber.trim())) ||
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
