import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Plus, QrCode, Users, Clock, CheckCircle2, Loader2, X,
  Utensils, ChefHat, Printer, Pause, CreditCard, Minus,
  Search, LayoutGrid, List, Banknote, Smartphone, Zap, Info, RefreshCw,
} from 'lucide-react'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { printHtml, esc, companyHeader, type OrgInfo } from '@utils/print'
import { useAuthContext } from '@/contexts/AuthContext'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { withApproval, isApprovalCancelled } from '@utils/approval'
import type { TableOrder, OrderItem, PaymentMethod } from '@/types/restaurant'

// ─── Types ────────────────────────────────────────────────────────────────────

type TStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'inactive'

interface TableRow {
  id: string; number: string; area: string; capacity: number
  status: TStatus; order: string | null; since: string | null; waiter: string | null
}

interface ApiMenuItem {
  id: string; name: string; category_id: string; category_name: string
  price: number; cost_price: number; image_url?: string; is_available: boolean
}
interface ApiCategory { id: string; name: string; display_order: number }

// ─── Static ───────────────────────────────────────────────────────────────────

const WAITERS = ['Ahmed', 'Fatima', 'Hassan', 'Sara', 'Cabdi', 'Mako']

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS: Record<TStatus, { label: string; dot: string; bg: string; border: string; text: string; badge: string }> = {
  available: { label:'Available', dot:'bg-emerald-500', bg:'bg-emerald-50 dark:bg-emerald-500/[0.07]', border:'border-emerald-200/80 dark:border-emerald-500/20', text:'text-emerald-700 dark:text-emerald-400', badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  occupied:  { label:'Occupied',  dot:'bg-rose-500',    bg:'bg-rose-50 dark:bg-rose-500/[0.07]',       border:'border-rose-200/80 dark:border-rose-500/20',       text:'text-rose-700 dark:text-rose-400',       badge:'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'       },
  reserved:  { label:'Reserved',  dot:'bg-amber-500',   bg:'bg-amber-50 dark:bg-amber-500/[0.07]',     border:'border-amber-200/80 dark:border-amber-500/20',     text:'text-amber-700 dark:text-amber-400',     badge:'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'   },
  cleaning:  { label:'Cleaning',  dot:'bg-sky-400',     bg:'bg-sky-50 dark:bg-sky-500/[0.07]',         border:'border-sky-200/80 dark:border-sky-500/20',         text:'text-sky-700 dark:text-sky-400',         badge:'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'           },
  inactive:  { label:'Inactive',  dot:'bg-neutral-400', bg:'bg-neutral-100 dark:bg-neutral-800/50',    border:'border-neutral-200 dark:border-neutral-700',       text:'text-neutral-500 dark:text-neutral-400', badge:'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const recalc = (order: TableOrder): TableOrder => {
  const subtotal    = order.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const discountAmt = subtotal * (order.discountPct / 100)
  const taxAmt      = (subtotal - discountAmt) * (order.taxPct / 100)
  return { ...order, subtotal, taxAmt, total: subtotal - discountAmt + taxAmt }
}

let _orderCounter = 100
const nextOrderNum = () => ++_orderCounter

const makeOrder = (t: TableRow, vatPct = 5): TableOrder => recalc({
  id: `ord-${Date.now()}`, orderNumber: nextOrderNum(),
  tableId: t.id, tableNumber: t.number,
  type: 'dine_in', status: 'open',
  items: [], subtotal: 0, discountPct: 0, taxPct: vatPct, taxAmt: 0, total: 0,
  notes: '', waiterName: '',
  createdAt: new Date().toISOString(),
})

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({ table, onClose }: { table: TableRow; onClose: () => void }) {
  const [org, setOrg] = useState<OrgInfo | null>(null)
  useEffect(() => { api.get('/system/organization').then(r => setOrg(r.data.data)).catch(() => {}) }, [])
  const { user } = useAuthContext()
  const branchId = user?.current_branch?.branch_id ?? user?.current_branch?.id ?? ''
  // The link carries the BRANCH (so the page shows this restaurant's real menu) and the table number
  const menuUrl = `${window.location.origin}/menu/${branchId}?table=${encodeURIComponent(table.number)}`
  const qrSrc   = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(menuUrl)}&size=260x260&bgcolor=ffffff&color=1a1a2e&margin=12`
  // Prints just the QR card with the company branding — window.print() printed the whole app page
  const printQr = () => printHtml(`
    ${companyHeader(org)}
    <hr/>
    <div class="center bold lg mt">Scan to view our menu</div>
    <div class="center mt"><img src="${esc(qrSrc)}" alt="QR" style="width:62mm;height:62mm"/></div>
    <div class="center bold xl mt">Table ${esc(table.number)}</div>
    <div class="center xs mt">${esc(menuUrl)}</div>
  `, 100)

  return (
    <Modal open onClose={onClose} title={`QR Code — ${table.number}`} size="sm"
      footer={
        <div className="flex w-full items-center gap-2">
          <button onClick={() => window.open(menuUrl, '_blank')}
            className="flex-1 rounded-xl border border-neutral-200/60 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-400 transition-colors">
            Open Menu ↗
          </button>
          <button onClick={printQr}
            className="flex-1 rounded-xl bg-orange-500 py-2 text-[13px] font-semibold text-white hover:bg-orange-600 transition-colors">
            Print QR
          </button>
        </div>
      }>
      <div className="flex flex-col items-center gap-4 py-2">
        <img src={qrSrc} alt="QR Code" className="h-[180px] w-[180px] rounded-2xl border border-neutral-200 dark:border-white/[0.08]"/>
        <div className="text-center">
          <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-200">Table {table.number}</p>
          <p className="mt-0.5 text-[11px] text-neutral-400 break-all">{menuUrl}</p>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-4 py-2.5 text-center">
          <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
            Guests scan this code to browse the digital menu on their phone.
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ─── Order Panel ─────────────────────────────────────────────────────────────

interface PanelProps {
  table: TableRow
  order: TableOrder
  menuItems: ApiMenuItem[]
  menuCats: ApiCategory[]
  syncing: boolean
  onClose: () => void
  onAddItem: (item: ApiMenuItem) => void
  onUpdateQty: (itemId: string, delta: number) => void
  onRemoveItem: (itemId: string) => void
  onSendToKitchen: () => void
  onHold: () => void
  onBill: (method: PaymentMethod, amountPaid: number, guestName?: string, roomNumber?: string) => void
  onUpdateNote: (note: string) => void
}

function OrderPanel({
  table, order, menuItems, menuCats, syncing,
  onClose, onAddItem, onUpdateQty, onRemoveItem,
  onSendToKitchen, onHold, onBill, onUpdateNote,
}: PanelProps) {
  const [view,       setView]       = useState<'menu' | 'order'>('menu')
  const [activeCat,  setActiveCat]  = useState('all')
  const [itemSearch, setItemSearch] = useState('')
  const [showPay,    setShowPay]    = useState(false)
  const [payMethod,  setPayMethod]  = useState<PaymentMethod>('cash')
  const [amountPaid, setAmountPaid] = useState('')

  const visibleItems = useMemo(() => {
    let items = activeCat === 'all' ? menuItems : menuItems.filter(i => i.category_id === activeCat)
    if (itemSearch) items = items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    return items.filter(i => i.is_available)
  }, [menuItems, activeCat, itemSearch])

  const cartCount = order.items.reduce((s, i) => s + i.quantity, 0)
  const paid      = parseFloat(amountPaid || '0')
  const change    = paid - order.total

  const statusColor: Record<string, string> = {
    open:            'text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-500/10',
    sent_to_kitchen: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10',
    ready:           'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10',
    held:            'text-neutral-500 bg-neutral-100 dark:text-neutral-400 dark:bg-neutral-700',
    billed:          'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10',
  }

  const itemStatusDot: Record<string, string> = {
    pending:   'bg-neutral-400',
    preparing: 'bg-amber-500',
    ready:     'bg-emerald-500',
    served:    'bg-sky-500',
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#1c2333]">

      {/* Panel header */}
      <div className="shrink-0 border-b border-neutral-100 dark:border-white/[0.05] px-4 py-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-extrabold text-neutral-900 dark:text-white">{table.number}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusColor[order.status] ?? ''}`}>
                {order.status.replace(/_/g, ' ')}
              </span>
              {syncing && <RefreshCw size={12} className="animate-spin text-orange-400"/>}
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-400">
              {table.area} · {table.capacity} seats
              {order.waiterName && <> · <span className="font-medium">{order.waiterName}</span></>}
              {table.since && <> · Since {table.since}</>}
            </p>
          </div>
          <button onClick={onClose}
            className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] transition-colors">
            <X size={15}/>
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
            ORD-{String(order.orderNumber).padStart(4, '0')}
          </span>
          <span className="h-1 w-1 rounded-full bg-neutral-300"/>
          <span className="text-[11px] text-neutral-400">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
          {order.total > 0 && <>
            <span className="h-1 w-1 rounded-full bg-neutral-300"/>
            <span className="text-[11px] font-bold text-orange-500">${order.total.toFixed(2)}</span>
          </>}
        </div>

        <div className="mt-3 flex items-center gap-1 rounded-xl border border-neutral-200/60 bg-neutral-50 p-1 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <button onClick={() => setView('menu')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition-all ${
              view === 'menu' ? 'bg-white text-neutral-800 shadow-sm dark:bg-white/[0.08] dark:text-white' : 'text-neutral-400 hover:text-neutral-600'
            }`}>
            <Utensils size={12}/> Menu
          </button>
          <button onClick={() => setView('order')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition-all ${
              view === 'order' ? 'bg-white text-neutral-800 shadow-sm dark:bg-white/[0.08] dark:text-white' : 'text-neutral-400 hover:text-neutral-600'
            }`}>
            <ChefHat size={12}/> Order
            {cartCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-white">{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Menu View */}
      {view === 'menu' && (
        <>
          <div className="shrink-0 border-b border-neutral-100 dark:border-white/[0.05]">
            <div className="flex gap-1 overflow-x-auto px-3 py-2">
              <button onClick={() => setActiveCat('all')}
                className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all ${
                  activeCat === 'all' ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-orange-50 hover:text-orange-600 dark:bg-white/[0.05] dark:text-neutral-400'
                }`}>
                All
              </button>
              {menuCats.map(cat => (
                <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all ${
                    activeCat === cat.id ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-orange-50 hover:text-orange-600 dark:bg-white/[0.05] dark:text-neutral-400'
                  }`}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
              <Search size={12} className="shrink-0 text-neutral-400"/>
              <input value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                placeholder="Search items…"
                className="flex-1 bg-transparent text-[12px] text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 outline-none"/>
              {itemSearch && <button onClick={() => setItemSearch('')}><X size={11} className="text-neutral-400"/></button>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {visibleItems.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[12px] text-neutral-400">
                {menuItems.length === 0 ? 'Loading menu…' : 'No items found'}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {visibleItems.map(item => {
                  const inCart = order.items.find(i => i.menuItemId === item.id)
                  return (
                    <button key={item.id} onClick={() => onAddItem(item)}
                      className="group relative overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
                      <div className="relative h-[80px] overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }}/>
                          : <div className="flex h-full items-center justify-center text-[24px]">🍽️</div>
                        }
                        {inCart && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-black text-white shadow">
                            {inCart.quantity}
                          </span>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="line-clamp-1 text-[11.5px] font-bold text-neutral-800 dark:text-neutral-100">{item.name}</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[13px] font-extrabold text-orange-500">${Number(item.price).toFixed(2)}</span>
                          <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-orange-500 text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <Plus size={10}/>
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Order View */}
      {view === 'order' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {order.items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.05]">
                <ChefHat size={22} className="text-neutral-300"/>
              </div>
              <p className="text-[13px] font-semibold text-neutral-500">No items yet</p>
              <button onClick={() => setView('menu')}
                className="rounded-xl bg-orange-500 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-orange-600 transition-colors">
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-3 border-b border-neutral-100 dark:border-white/[0.05] px-3 py-2">
                {(['pending','preparing','ready','served'] as const).map(s => (
                  <div key={s} className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${itemStatusDot[s]}`}/>
                    <span className="text-[10px] capitalize text-neutral-400">{s}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 p-3">
                {order.items.map((item, idx) => (
                  <div key={item.id}
                    className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50/50 p-2 dark:border-white/[0.04] dark:bg-white/[0.02]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[9.5px] font-black text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[12px] font-bold text-neutral-800 dark:text-neutral-100">{item.name}</p>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${itemStatusDot[item.status] ?? 'bg-neutral-300'}`}/>
                      </div>
                      <p className="text-[11px] text-neutral-400">${item.price} × {item.quantity} = <span className="font-semibold text-neutral-600 dark:text-neutral-300">${(item.price * item.quantity).toFixed(2)}</span></p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onUpdateQty(item.id, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 hover:bg-rose-100 hover:text-rose-600 dark:bg-white/[0.06] dark:text-neutral-300 transition-colors">
                        <Minus size={9}/>
                      </button>
                      <span className="w-5 text-center text-[12px] font-bold">{item.quantity}</span>
                      <button onClick={() => onUpdateQty(item.id, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                        <Plus size={9}/>
                      </button>
                    </div>
                    <button onClick={() => onRemoveItem(item.id)}
                      className="shrink-0 rounded-lg p-1 text-neutral-300 hover:text-rose-500 dark:text-neutral-600 transition-colors">
                      <X size={12}/>
                    </button>
                  </div>
                ))}

                <div className="mt-2 rounded-xl border border-dashed border-neutral-200/80 px-3 py-2 dark:border-white/[0.08]">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Order Note</p>
                  <input value={order.notes} onChange={e => onUpdateNote(e.target.value)}
                    placeholder="Special instructions for kitchen…"
                    className="w-full bg-transparent text-[11.5px] text-neutral-600 dark:text-neutral-300 placeholder-neutral-400 outline-none"/>
                </div>
              </div>
            </div>
          )}

          {order.items.length > 0 && (
            <div className="shrink-0 border-t border-neutral-100 dark:border-white/[0.05] px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">${order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-neutral-500">Tax (5%)</span>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">${order.taxAmt.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-orange-50 dark:bg-orange-500/10 px-3 py-2">
                <span className="text-[14px] font-extrabold text-neutral-900 dark:text-white">Total</span>
                <span className="text-[18px] font-extrabold text-orange-500">${order.total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="shrink-0 border-t border-neutral-100 dark:border-white/[0.05] p-3 space-y-2">
        <div className="grid grid-cols-4 gap-1.5">
          <button onClick={onSendToKitchen}
            disabled={order.items.length === 0 || order.status === 'billed' || syncing}
            className="flex flex-col items-center gap-1 rounded-xl bg-neutral-900 py-2.5 text-[10px] font-bold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:bg-white/[0.08] dark:hover:bg-white/[0.12]">
            {syncing ? <RefreshCw size={14} className="animate-spin"/> : <ChefHat size={14}/>} Kitchen
          </button>
          <button disabled={order.items.length === 0}
            className="flex flex-col items-center gap-1 rounded-xl bg-neutral-100 py-2.5 text-[10px] font-bold text-neutral-700 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:bg-white/[0.06] dark:text-neutral-300">
            <Printer size={14}/> KOT
          </button>
          <button onClick={onHold}
            disabled={order.items.length === 0 || order.status === 'billed' || syncing}
            className="flex flex-col items-center gap-1 rounded-xl bg-amber-100 py-2.5 text-[10px] font-bold text-amber-700 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:bg-amber-500/15 dark:text-amber-400">
            <Pause size={14}/> Hold
          </button>
          <button onClick={() => order.items.length > 0 && setShowPay(true)}
            disabled={order.items.length === 0 || syncing}
            className="flex flex-col items-center gap-1 rounded-xl bg-orange-500 py-2.5 text-[10px] font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors shadow-sm">
            <CreditCard size={14}/> Bill
          </button>
        </div>
      </div>

      {/* Payment modal */}
      {showPay && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1c2333] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/[0.05] px-4 py-3.5">
              <p className="text-[14px] font-extrabold text-neutral-900 dark:text-white">Generate Bill</p>
              <button onClick={() => setShowPay(false)} className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors">
                <X size={15}/>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-3.5 shadow-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Total</p>
                  <p className="text-[24px] font-extrabold text-white">${order.total.toFixed(2)}</p>
                </div>
                <p className="text-[11px] font-bold text-white/80 text-right">
                  ORD-{String(order.orderNumber).padStart(4,'0')}<br/>
                  Table {table.number}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {([
                  { key:'cash',        label:'Cash',   Icon: Banknote    },
                  { key:'card',        label:'Card',   Icon: CreditCard  },
                  { key:'mobile',      label:'Mobile', Icon: Smartphone  },
                  { key:'room_charge', label:'Room',   Icon: Zap         },
                ] as { key: PaymentMethod; label: string; Icon: React.ComponentType<{size?:number}> }[]).map(m => (
                  <button key={m.key} onClick={() => setPayMethod(m.key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[10px] font-bold transition-all ${
                      payMethod === m.key
                        ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400'
                        : 'border-neutral-200 text-neutral-500 hover:border-orange-300 dark:border-white/[0.08] dark:text-neutral-400'
                    }`}>
                    <m.Icon size={16}/>
                    {m.label}
                  </button>
                ))}
              </div>

              {payMethod === 'room_charge' && (
                <div className="flex items-start gap-1.5 rounded-xl bg-indigo-50 p-3 text-[11.5px] font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                  <Info size={13} className="mt-px shrink-0"/>
                  Room charge is done from the POS screen — it lists the checked-in guests so the bill lands on their statement.
                </div>
              )}

              {payMethod === 'cash' && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Amount Received</p>
                  <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                    placeholder={`Min. $${order.total.toFixed(2)}`}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[15px] font-bold outline-none focus:border-orange-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white transition-colors"/>
                  {amountPaid && (
                    <p className={`mt-1 text-[12px] font-bold ${change >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {change >= 0 ? `Change: $${change.toFixed(2)}` : `Need $${Math.abs(change).toFixed(2)} more`}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => { onBill(payMethod, paid); setShowPay(false); setAmountPaid('') }}
                disabled={(payMethod === 'cash' && paid < order.total) || payMethod === 'room_charge'}
                className="w-full rounded-xl bg-orange-500 py-3 text-[13px] font-extrabold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors shadow-sm">
                Collect ${order.total.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Table Card ───────────────────────────────────────────────────────────────

function TableCard({ t, isActive, onSelect, onQR }: { t: TableRow; isActive: boolean; onSelect: () => void; onQR: () => void }) {
  const s = STATUS[t.status]
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
        isActive
          ? 'border-orange-400 bg-orange-50 dark:bg-orange-500/10 shadow-md ring-2 ring-orange-200 dark:ring-orange-500/20'
          : `${s.bg} ${s.border}`
      }`}
      onClick={onSelect}>

      <div className="flex items-start justify-between p-3 pb-1.5">
        <div>
          <p className="text-[17px] font-extrabold leading-none text-neutral-900 dark:text-white">{t.number}</p>
          <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-neutral-400">{t.area}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#1c2333] ${isActive ? 'bg-orange-500' : s.dot}`}/>
          <button
            onClick={e => { e.stopPropagation(); onQR() }}
            className="text-neutral-300 hover:text-indigo-500 dark:text-neutral-600 transition-colors">
            <QrCode size={12}/>
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isActive ? 'bg-orange-100 dark:bg-orange-500/20 border border-orange-200 dark:border-orange-500/20' : `${s.bg} border ${s.border}`}`}>
          <Users size={15} className={isActive ? 'text-orange-600 dark:text-orange-400' : s.text}/>
        </div>
        <p className={`mt-1 text-[10px] font-bold ${isActive ? 'text-orange-600 dark:text-orange-400' : s.text}`}>
          {t.capacity} Seats
        </p>
      </div>

      <div className={`border-t px-2.5 py-2 ${isActive ? 'border-orange-200/60 dark:border-orange-500/20' : 'border-neutral-200/40 dark:border-white/[0.04]'}`}>
        {t.status === 'occupied' ? (
          <div>
            <p className="truncate text-[10px] font-bold text-neutral-700 dark:text-neutral-200">{t.order ?? 'Order open'}</p>
            {t.since && (
              <div className="flex items-center gap-1 mt-0.5">
                <Clock size={8} className="text-neutral-400"/>
                <p className="text-[9.5px] text-neutral-400">Since {t.since}</p>
              </div>
            )}
          </div>
        ) : t.status === 'reserved' ? (
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Reserved {t.since ?? ''}</p>
        ) : t.status === 'cleaning' ? (
          <div className="flex items-center gap-1">
            <Loader2 size={9} className="animate-spin text-sky-500"/>
            <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400">Cleaning</p>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <CheckCircle2 size={9} className="text-emerald-500"/>
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Ready</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode  = 'grid' | 'list'
type ModalMode = 'add' | 'edit' | null
interface TableForm { number: string; area: string; capacity: string; status: TStatus; waiter: string; reservedTime: string }
const EMPTY_FORM: TableForm = { number: '', area: 'Indoor', capacity: '4', status: 'available', waiter: '', reservedTime: '' }

export default function Tables() {
  const [tables,         setTables]         = useState<TableRow[]>([])
  const [tableOrders,    setTableOrders]    = useState<Record<string, TableOrder>>({})
  const [backendOrderIds,setBackendOrderIds]= useState<Record<string, string>>({})
  const [menuItems,      setMenuItems]      = useState<ApiMenuItem[]>([])
  const [menuCats,       setMenuCats]       = useState<ApiCategory[]>([])
  const [loadingTables,  setLoadingTables]  = useState(true)
  const [syncing,        setSyncing]        = useState(false)
  const [error,          setError]          = useState('')
  const [activeTableId,  setActiveTableId]  = useState<string | null>(null)
  const [activeOrder,    setActiveOrder]    = useState<TableOrder | null>(null)
  const [areaFilter,     setAreaFilter]     = useState('All')
  const [viewMode,       setViewMode]       = useState<ViewMode>('grid')
  const [modalMode,      setModalMode]      = useState<ModalMode>(null)
  const [selectedTable,  setSelectedTable]  = useState<TableRow | null>(null)
  const [form,           setForm]           = useState<TableForm>(EMPTY_FORM)
  const [qrTable,        setQrTable]        = useState<TableRow | null>(null)
  // Company VAT rate and the account payments are deposited into (same sources the POS uses)
  const [vatRate,   setVatRate]   = useState(5)
  const [accountId, setAccountId] = useState('')

  const loadTables = useCallback(async () => {
    setLoadingTables(true)
    try {
      const r = await api.get('/restaurant/tables')
      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      setTables(r.data.data.map((t: any) => ({
        id:       t.id,
        number:   t.table_number,
        area:     t.area_name,
        capacity: t.capacity,
        status:   t.status as TStatus,
        order:    null,
        since:    t.status === 'occupied' ? now : null,
        waiter:   null,
      })))
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoadingTables(false) }
  }, [])

  const loadMenu = useCallback(async () => {
    try {
      const [iRes, cRes] = await Promise.all([
        api.get('/restaurant/menu/items'),
        api.get('/restaurant/menu/categories'),
      ])
      setMenuItems(iRes.data.data)
      setMenuCats(cRes.data.data)
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { loadTables(); loadMenu() }, [loadTables, loadMenu])

  useEffect(() => {
    api.get('/system/organization')
      .then(r => { const v = Number(r.data.data?.vat_rate); if (Number.isFinite(v)) setVatRate(v) })
      .catch(() => {})
    api.get('/accounting/accounts')
      .then(r => {
        const accs: { id: string; account_type: string }[] = r.data.data
        setAccountId(accs.find(a => a.account_type === 'cash')?.id ?? accs[0]?.id ?? '')
      })
      .catch(() => {})
  }, [])

  const areas = useMemo(() => {
    const set = new Set(tables.map(t => t.area))
    return ['All', ...Array.from(set).sort()]
  }, [tables])

  const activeTable = tables.find(t => t.id === activeTableId) ?? null
  const visible     = areaFilter === 'All' ? tables : tables.filter(t => t.area === areaFilter)
  const areaGroups  = areaFilter === 'All'
    ? Array.from(new Set(tables.map(t => t.area))).sort()
    : [areaFilter]

  const summary = [
    { label: 'Available', count: tables.filter(t => t.status === 'available').length, color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
    { label: 'Occupied',  count: tables.filter(t => t.status === 'occupied').length,  color: 'text-rose-600 dark:text-rose-400',       dot: 'bg-rose-500'    },
    { label: 'Reserved',  count: tables.filter(t => t.status === 'reserved').length,  color: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500'   },
    { label: 'Cleaning',  count: tables.filter(t => t.status === 'cleaning').length,  color: 'text-sky-600 dark:text-sky-400',         dot: 'bg-sky-400'     },
  ]

  // ── Table click ──────────────────────────────────────────────────────────────
  const handleTableClick = (t: TableRow) => {
    setActiveTableId(t.id)
    const existing = tableOrders[t.id]
    setActiveOrder(existing ? { ...existing } : makeOrder(t, vatRate))
  }

  const closePanel = () => { setActiveTableId(null); setActiveOrder(null) }

  // ── Order mutations ──────────────────────────────────────────────────────────
  const handleAddItem = (item: ApiMenuItem) => {
    if (!activeOrder) return
    setActiveOrder(prev => {
      if (!prev) return prev
      const ex = prev.items.find(i => i.menuItemId === item.id)
      const newItems: OrderItem[] = ex
        ? prev.items.map(i => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev.items, {
            id: `oi-${Date.now()}-${Math.random()}`,
            menuItemId: item.id,
            categoryId: item.category_id,
            name: item.name,
            price: Number(item.price),
            cost: Number(item.cost_price),
            quantity: 1, notes: '', status: 'pending',
          }]
      return recalc({ ...prev, items: newItems })
    })
  }

  const handleUpdateQty = (itemId: string, delta: number) => {
    if (!activeOrder) return
    setActiveOrder(prev => {
      if (!prev) return prev
      const newItems = prev.items
        .map(i => i.id === itemId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
      return recalc({ ...prev, items: newItems })
    })
  }

  const handleRemoveItem = (itemId: string) => {
    if (!activeOrder) return
    setActiveOrder(prev => prev ? recalc({ ...prev, items: prev.items.filter(i => i.id !== itemId) }) : prev)
  }

  const handleUpdateNote = (note: string) => {
    if (!activeOrder) return
    setActiveOrder(prev => prev ? { ...prev, notes: note } : prev)
  }

  // ── Send to Kitchen ──────────────────────────────────────────────────────────
  // Items still marked "pending" have not reached the server yet. The first send
  // creates the order; every later send posts only the NEW items, so dishes added
  // after the first round are no longer silently lost.
  const handleSendToKitchen = async () => {
    if (!activeOrder || !activeTableId || activeOrder.items.length === 0) return
    const fresh = activeOrder.items.filter(i => i.status === 'pending')
    if (fresh.length === 0) return
    setSyncing(true); setError('')
    try {
      let backendId = backendOrderIds[activeTableId]
      if (!backendId) {
        const r = await api.post('/restaurant/orders', {
          dining_table_id: activeTableId,
          order_type: 'dine_in',
          discount_amount: activeOrder.subtotal * (activeOrder.discountPct / 100),
        })
        backendId = r.data.data.id
        setBackendOrderIds(p => ({ ...p, [activeTableId]: backendId }))
      }
      for (const item of fresh) {
        await api.post(`/restaurant/orders/${backendId}/lines`, {
          menu_item_id: item.menuItemId,
          quantity:     item.quantity,
        })
      }
      // Hand the order to the kitchen (stamps every pending line) — previously the order stayed "open" forever
      await api.patch(`/restaurant/orders/${backendId}/status`, { status: 'preparing' })
      await api.patch(`/restaurant/tables/${activeTableId}/status`, { status: 'occupied' })

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const updated: TableOrder = {
        ...activeOrder,
        status: 'sent_to_kitchen',
        sentToKitchenAt: new Date().toISOString(),
        items: activeOrder.items.map(i => ({ ...i, status: i.status === 'pending' ? 'preparing' : i.status })),
      }
      setTableOrders(p => ({ ...p, [activeTableId]: updated }))
      setActiveOrder(updated)
      setTables(p => p.map(t => t.id === activeTableId
        ? { ...t, status: 'occupied', order: `ORD-${String(updated.orderNumber).padStart(4,'0')}`, since: t.since ?? now }
        : t))
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSyncing(false) }
  }

  // ── Hold ─────────────────────────────────────────────────────────────────────
  const handleHold = () => {
    if (!activeOrder || !activeTableId) return
    const updated = { ...activeOrder, status: 'held' as const, heldAt: new Date().toISOString() }
    setTableOrders(p => ({ ...p, [activeTableId]: updated }))
    setActiveOrder(updated)
  }

  // ── Bill ─────────────────────────────────────────────────────────────────────
  // Creates the invoice AND records the payment into the cash account. This used to
  // only "close" the order — the sale was never invoiced and no money reached the
  // books. The server finishes the order and frees the table once it is fully paid.
  const handleBill = async (method: string, _paid: number, _guestName?: string, _roomNumber?: string) => {
    if (!activeOrder || !activeTableId) return
    setSyncing(true); setError('')
    try {
      const backendId = backendOrderIds[activeTableId]
      if (!backendId) throw new Error('Send the order to the kitchen first — there is nothing to bill yet.')
      if (method === 'room_charge') {
        throw new Error('Room charge must be started from the POS screen, where you pick the checked-in guest.')
      }
      if (!accountId) throw new Error('No cash/bank account is set up — add one in Finance → Accounts before taking payments.')

      // A discount above the manager-approval limit asks for a manager's PIN before the bill is made
      const bill = await withApproval(body => api.post(`/restaurant/orders/${backendId}/bill`, {
        discount_amount: activeOrder.subtotal * (activeOrder.discountPct / 100), ...body,
      }))
      const invoice = bill.data.data
      await api.post(`/accounting/invoices/${invoice.id}/payment`, {
        amount: Number(invoice.total_amount),
        payment_method: method,
        account_id: accountId,
      })
      await api.patch(`/restaurant/tables/${activeTableId}/status`, { status: 'cleaning' }).catch(() => {})

      setTableOrders(p => { const n = { ...p }; delete n[activeTableId]; return n })
      setBackendOrderIds(p => { const n = { ...p }; delete n[activeTableId]; return n })
      setTables(p => p.map(t => t.id === activeTableId
        ? { ...t, status: 'cleaning', order: null, since: null }
        : t))
      setActiveTableId(null)
      setActiveOrder(null)
    } catch (e) { if (!isApprovalCancelled(e)) setError(getApiErrorMessage(e)) }
    finally { setSyncing(false) }
  }

  // ── Add/Edit table modal ─────────────────────────────────────────────────────
  const openAdd  = () => { setForm(EMPTY_FORM); setSelectedTable(null); setModalMode('add') }
  const openEdit = (t: TableRow) => {
    setForm({ number: t.number, area: t.area, capacity: String(t.capacity), status: t.status, waiter: t.waiter ?? '', reservedTime: t.since ?? '' })
    setSelectedTable(t); setModalMode('edit')
  }
  const closeModal = () => { setModalMode(null); setSelectedTable(null) }
  const f = (k: keyof TableForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const saveTable = () => {
    if (modalMode === 'add') {
      const newT: TableRow = {
        id: `local-${Date.now()}`,
        number:   form.number || `T-${String(tables.length + 1).padStart(2,'0')}`,
        area:     form.area,
        capacity: parseInt(form.capacity) || 4,
        status:   form.status,
        order:    null,
        since:    form.status === 'reserved' ? form.reservedTime || null : null,
        waiter:   form.waiter || null,
      }
      setTables(p => [...p, newT])
    } else if (selectedTable) {
      setTables(p => p.map(t => t.id === selectedTable.id ? {
        ...t,
        number:   form.number || t.number,
        area:     form.area,
        capacity: parseInt(form.capacity) || t.capacity,
        status:   form.status,
        since:    form.status === 'reserved' ? form.reservedTime || t.since : form.status === 'occupied' ? t.since : null,
        waiter:   form.waiter || null,
      } : t))
    }
    closeModal()
  }

  const removeTable = () => {
    if (selectedTable) { setTables(p => p.filter(t => t.id !== selectedTable.id)); closeModal() }
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="-m-6 flex h-[calc(100vh-64px)] overflow-hidden">

      {/* Left: Floor plan */}
      <div className={`overflow-y-auto transition-all duration-200 ${activeTable ? 'hidden lg:block lg:flex-1' : 'flex-1'}`}>
        <div className="p-6 space-y-5">

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Restaurant Tables</h1>
              <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
                {tables.length} tables · {areas.length - 1} areas
                {activeTable && <> · <span className="font-semibold text-orange-500">{activeTable.number} selected</span></>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadTables}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-orange-300 hover:text-orange-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
                <RefreshCw size={15} className={loadingTables ? 'animate-spin' : ''}/>
              </button>
              <div className="flex items-center gap-1 rounded-xl border border-neutral-200/60 bg-white p-1 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
                {([['grid', LayoutGrid], ['list', List]] as const).map(([m, Icon]) => (
                  <button key={m} onClick={() => setViewMode(m as ViewMode)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
                      viewMode === m ? 'bg-neutral-100 text-neutral-800 dark:bg-white/[0.08] dark:text-white' : 'text-neutral-400 hover:text-neutral-600'
                    }`}>
                    <Icon size={13}/>
                  </button>
                ))}
              </div>
              <button onClick={openAdd}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
                <Plus size={14}/> Add Table
              </button>
            </div>
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map(s => (
              <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
                <span className={`h-3 w-3 shrink-0 rounded-full ${s.dot}`}/>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">{s.label}</p>
                  <p className={`text-[22px] font-extrabold leading-none ${s.color}`}>{s.count}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Area tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {areas.map(a => (
              <button key={a} onClick={() => setAreaFilter(a)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
                  areaFilter === a
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                    : 'border border-neutral-200/60 bg-white text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:bg-[#1c2333] dark:text-neutral-400'
                }`}>
                {a}
                <span className="ml-1.5 text-[10px] opacity-60">
                  ({a === 'All' ? tables.length : tables.filter(t => t.area === a).length})
                </span>
              </button>
            ))}
          </div>

          {/* Loading skeleton */}
          {loadingTables ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-[140px] animate-pulse rounded-2xl bg-neutral-100 dark:bg-white/[0.05]"/>
              ))}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="space-y-6">
              {areaGroups.map(area => {
                const areaT = visible.filter(t => t.area === area)
                if (!areaT.length) return null
                return (
                  <div key={area}>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-[12px] font-extrabold uppercase tracking-widest text-neutral-600 dark:text-neutral-400">{area}</h3>
                      <span className="h-px flex-1 bg-neutral-200/60 dark:bg-white/[0.06]"/>
                      <span className="text-[11px] text-neutral-400">
                        {areaT.filter(t => t.status === 'occupied').length}/{areaT.length} occupied
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {areaT.map(t => (
                        <TableCard key={t.id} t={t}
                          isActive={t.id === activeTableId}
                          onSelect={() => handleTableClick(t)}
                          onQR={() => setQrTable(t)}/>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                    {['Table','Area','Seats','Status','Order','Since','Waiter',''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.03]">
                  {visible.map(t => {
                    const s = STATUS[t.status]
                    return (
                      <tr key={t.id}
                        className={`cursor-pointer transition-colors ${t.id === activeTableId ? 'bg-orange-50 dark:bg-orange-500/[0.06]' : 'hover:bg-neutral-50/60 dark:hover:bg-white/[0.02]'}`}
                        onClick={() => handleTableClick(t)}>
                        <td className="px-4 py-3 font-extrabold text-neutral-900 dark:text-white">{t.number}</td>
                        <td className="px-4 py-3 text-neutral-500">{t.area}</td>
                        <td className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">{t.capacity}</td>
                        <td className="px-4 py-3">
                          <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`}/>{s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{t.order ?? '—'}</td>
                        <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">{t.since ?? '—'}</td>
                        <td className="px-4 py-3 text-neutral-500">{t.waiter ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={e => { e.stopPropagation(); openEdit(t) }}
                            className="rounded-lg border border-neutral-200/60 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-white/[0.08] dark:bg-white/[0.04] transition-colors">
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200/60 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-[#1c2333]">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">Legend</p>
            {Object.entries(STATUS).filter(([k]) => k !== 'inactive').map(([key, s]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`}/>
                <span className="text-[12px] text-neutral-500 dark:text-neutral-400">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Order panel */}
      {activeTable && activeOrder && (
        <div className="relative w-full lg:w-[420px] shrink-0 flex flex-col border-l border-neutral-200/60 dark:border-white/[0.06] overflow-hidden">
          <OrderPanel
            table={activeTable}
            order={activeOrder}
            menuItems={menuItems}
            menuCats={menuCats}
            syncing={syncing}
            onClose={closePanel}
            onAddItem={handleAddItem}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onSendToKitchen={handleSendToKitchen}
            onHold={handleHold}
            onBill={handleBill}
            onUpdateNote={handleUpdateNote}
          />
        </div>
      )}

      {/* Add/Edit Table Modal */}
      <Modal open={modalMode !== null} onClose={closeModal}
        title={modalMode === 'add' ? 'Add New Table' : `Edit ${selectedTable?.number ?? 'Table'}`}
        size="md"
        footer={
          <div className="flex w-full items-center gap-2">
            {modalMode === 'edit' && (
              <button onClick={removeTable}
                className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-4 py-2 text-[12.5px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
                <X size={13}/> Remove
              </button>
            )}
            <div className="flex-1"/>
            <CancelBtn onClick={closeModal}/>
            <button onClick={saveTable}
              className="rounded-xl bg-orange-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-orange-600 transition-colors shadow-sm">
              {modalMode === 'add' ? 'Add Table' : 'Save Changes'}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Table Number">
              <input value={form.number} onChange={e => f('number', e.target.value)} placeholder="e.g. T-09" className={INPUT} autoFocus/>
            </Field>
            <Field label="Capacity (seats)">
              <select value={form.capacity} onChange={e => f('capacity', e.target.value)} className={INPUT}>
                {[1,2,3,4,5,6,7,8,10,12].map(n => <option key={n} value={n}>{n} seats</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area">
              <select value={form.area} onChange={e => f('area', e.target.value)} className={INPUT}>
                {areas.filter(a => a !== 'All').map(a => <option key={a}>{a}</option>)}
                <option value="Custom">Custom…</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => f('status', e.target.value as TStatus)} className={INPUT}>
                {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          {form.status === 'reserved' && (
            <Field label="Reserved Time">
              <input type="time" value={form.reservedTime} onChange={e => f('reservedTime', e.target.value)} className={INPUT}/>
            </Field>
          )}
          <Field label="Assigned Waiter">
            <select value={form.waiter} onChange={e => f('waiter', e.target.value)} className={INPUT}>
              <option value="">— None —</option>
              {WAITERS.map(w => <option key={w}>{w}</option>)}
            </select>
          </Field>
          <div className={`flex items-center gap-2.5 rounded-xl border p-3 ${STATUS[form.status].bg} ${STATUS[form.status].border}`}>
            <span className={`h-3 w-3 rounded-full ${STATUS[form.status].dot}`}/>
            <div>
              <p className={`text-[12px] font-bold ${STATUS[form.status].text}`}>{STATUS[form.status].label}</p>
              <p className="text-[11px] text-neutral-400">
                {form.status === 'available' ? 'Ready to seat guests'
                  : form.status === 'occupied' ? 'Currently serving an order'
                  : form.status === 'reserved' ? `Reserved${form.reservedTime ? ' at ' + form.reservedTime : ''}`
                  : form.status === 'cleaning' ? 'Being cleaned'
                  : 'Out of service'}
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* QR Modal */}
      {qrTable && <QRModal table={qrTable} onClose={() => setQrTable(null)}/>}
    </div>
  )
}
