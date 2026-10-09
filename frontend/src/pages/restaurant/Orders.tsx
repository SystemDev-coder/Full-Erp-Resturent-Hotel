import { useEffect, useState } from 'react'
import { Plus, UtensilsCrossed, LayoutGrid, Table2, RefreshCw, Printer, Eye } from 'lucide-react'
import { OrderViewModal } from '@/components/restaurant/OrderViewModal'
import { printBillFor } from '@utils/billSlip'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import { LoadMoreBar } from '@/components/ui/LoadMoreBar'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useLoadMore } from '@hooks/useLoadMore'
import { withApproval, isApprovalCancelled } from '@utils/approval'
import { printReadySlipFor } from '@utils/readySlip'

// Mirrors what GET /restaurant/orders actually returns
interface Order {
  id: string; order_ref: string; call_no?: number | null; order_type: string; status: string
  table_number: string | null; waiter_name: string | null
  total_amount: string; item_count: string; opened_at: string
}

const STATUS_BADGE: Record<string,string> = {
  open:            'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  preparing:       'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  ready:           'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  served:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  billed:          'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  paid:            'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  cancelled:       'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}

const TYPE_BADGE: Record<string,string> = {
  dine_in:      'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
  takeaway:     'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  delivery:     'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  room_service: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
}

export default function Orders() {
  const { items: orders, loading, loadingMore, hasMore, loadMore, reload: load, error: loadError } =
    useLoadMore<Order>('/restaurant/orders', { pageSize: 50 })
  const [error,        setError]        = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [view,         setView]         = useState<'grid'|'table'>('grid')
  const [acting,       setActing]       = useState<string | null>(null)

  const [billed, setBilled] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)

  // keep statuses live (kitchen marks things ready, waiters serve) without pressing refresh
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden && !acting) load() }, 10_000)
    return () => clearInterval(t)
  }, [load, acting])

  const doAction = async (id: string, action: 'close' | 'cancel') => {
    setActing(id)
    try {
      // Cancelling an order that has items asks for a reason + manager approval (the server decides)
      await withApproval(body => api.patch(`/restaurant/orders/${id}/${action}`, body))
      load()
    } catch (e) { if (!isApprovalCancelled(e)) setError(getApiErrorMessage(e)) }
    finally { setActing(null) }
  }

  // Kitchen workflow: sent_to_kitchen → ready → served
  const setStatus = async (id: string, status: string) => {
    setActing(id)
    try {
      await api.patch(`/restaurant/orders/${id}/status`, { status })
      load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setActing(null) }
  }

  // Billing generates a real UNPAID invoice — payment is collected later
  // (POS cash now, EVC Plus/Sahal integration in the future)
  const doBill = async (id: string) => {
    setActing(id)
    try {
      const r = await withApproval(body => api.post(`/restaurant/orders/${id}/bill`, body))
      // the customer's bill comes out of the thermal printer straight away
      printBillFor(id).catch(e => setError(getApiErrorMessage(e)))
      setBilled(`Bill ${r.data.data.invoice_number} printed — the customer pays at the cashier`)
      setTimeout(() => setBilled(''), 6000)
      load()
    } catch (e) { if (!isApprovalCancelled(e)) setError(getApiErrorMessage(e)) }
    finally { setActing(null) }
  }

  // Which action comes next for each status
  const nextAction = (o: Order): { label: string; run: () => void; cls: string } | null => {
    switch (o.status) {
      case 'open':            return { label: 'To Kitchen', run: () => setStatus(o.id, 'preparing'), cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300' }
      case 'preparing':       return { label: 'Ready',      run: () => setStatus(o.id, 'ready'),           cls: 'bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-500/20 dark:text-violet-300' }
      case 'ready':           return { label: 'Served',     run: () => setStatus(o.id, 'served'),          cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300' }
      case 'served':          return { label: 'Bill',       run: () => doBill(o.id),                       cls: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300' }
      default:                return null
    }
  }

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })

  const active   = orders.filter(o => !['paid','cancelled'].includes(o.status))
  const filtered = orders.filter(o => statusFilter === 'all' || o.status === statusFilter)

  const COLS: DTColumn<Order>[] = [
    { key:'order_ref',    label:'Order #',  render:r=><span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.call_no ? <b className="mr-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">#{r.call_no}</b> : null}{r.order_ref}</span> },
    { key:'opened_at',    label:'Time',     render:r=><span className="text-neutral-500 dark:text-neutral-400">{fmt(r.opened_at)}</span> },
    { key:'table_number', label:'Table',    render:r=><span className="font-semibold text-neutral-700 dark:text-neutral-300">{r.table_number ?? '—'}</span> },
    { key:'order_type',   label:'Type',     render:r=><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize ${TYPE_BADGE[r.order_type]??''}`}>{r.order_type.replace('_',' ')}</span> },
    { key:'waiter_name',  label:'Server',   render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.waiter_name ?? '—'}</span> },
    { key:'item_count',   label:'Items',    render:r=><span className="font-semibold text-neutral-700 dark:text-neutral-300">{Number(r.item_count)}</span>, exportValue:r=>Number(r.item_count) },
    { key:'total_amount', label:'Total',    render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.total_amount).toFixed(2)}</span>, exportValue:r=>Number(r.total_amount) },
    { key:'status',       label:'Status',   render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_BADGE[r.status]??''}`}>{r.status.replace('_',' ')}</span> },
    { key:'_actions', label:'', sortable:false, render:r=>{
      const next = nextAction(r)
      return (
        <div className="flex gap-1.5">
          <button onClick={()=>setViewId(r.id)} title="View this order" className="rounded-lg bg-neutral-100 px-2 py-1 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300"><Eye size={12}/></button>
          {next && (
            <button onClick={next.run} disabled={acting===r.id}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${next.cls}`}>
              {next.label}
            </button>
          )}
          {['open','preparing','ready','served'].includes(r.status) && (
            <button onClick={()=>doAction(r.id,'cancel')} disabled={acting===r.id}
              className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 transition-colors disabled:opacity-50">Cancel</button>
          )}
        </div>
      )
    }},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Orders</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{active.length} active · {orders.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-amber-300 hover:text-amber-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <div className="flex rounded-xl border border-neutral-200/60 bg-white dark:border-white/[0.06] dark:bg-[#1c2333] overflow-hidden">
            <button onClick={()=>setView('grid')} className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition-colors ${view==='grid'?'bg-indigo-600 text-white':'text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-white/[0.04]'}`}>
              <LayoutGrid size={13}/> Grid
            </button>
            <button onClick={()=>setView('table')} className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition-colors ${view==='table'?'bg-indigo-600 text-white':'text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-white/[0.04]'}`}>
              <Table2 size={13}/> Table
            </button>
          </div>
          <a href="/restaurant/operations"
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-amber-600 transition-colors">
            <Plus size={15}/> New Order
          </a>
        </div>
      </div>

      {(error || loadError) && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error || loadError}</p>}
      {billed && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{billed}</p>}

      <div className="flex flex-wrap gap-2">
        {['all','open','preparing','ready','served','billed','paid','cancelled'].map(s=>(
          <button key={s} onClick={()=>setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors ${
              statusFilter===s ? 'bg-indigo-600 text-white' : 'bg-white border border-neutral-200/60 text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-[#1c2333] dark:text-neutral-300'
            }`}>{s==='all'?'All':s.replace('_',' ')}
          </button>
        ))}
      </div>

      {loading ? (
        view === 'table'
          ? <div className="space-y-2">{[...Array(5)].map((_,i)=><div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100 dark:bg-white/[0.05]"/>)}</div>
          : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[...Array(8)].map((_,i)=><div key={i} className="h-36 animate-pulse rounded-2xl bg-neutral-100 dark:bg-white/[0.05]"/>)}</div>
      ) : view === 'table' ? (
        <DataTable columns={COLS} data={filtered} title="Orders" filename="orders" rowKey={r=>r.id} searchPlaceholder="Search order, table, server…"
          onLoadMore={loadMore} hasMore={hasMore} loadingMore={loadingMore}/>
      ) : (
        <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.length === 0
            ? <div className="col-span-full py-12 text-center text-neutral-400">No orders match this filter.</div>
            : filtered.map(o=>(
              <div key={o.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-[#1c2333] ${o.status === 'ready' ? 'border-emerald-300 ring-2 ring-emerald-200 dark:border-emerald-500/40 dark:ring-emerald-500/20' : 'border-neutral-200/60 dark:border-white/[0.06]'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[13.5px] font-bold text-neutral-800 dark:text-white">{o.call_no ? <span className="mr-1.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[12px] text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">#{o.call_no}</span> : null}{o.order_ref}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{fmt(o.opened_at)} · {o.waiter_name ?? 'No server'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={()=>setViewId(o.id)} title="View this order" className="rounded-lg bg-neutral-100 p-1.5 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300"><Eye size={12}/></button>
                    {o.status === 'ready' && <button onClick={() => printReadySlipFor(o.id).catch(e => setError(getApiErrorMessage(e)))} title="Print the ready slip (call number)" className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10"><Printer size={12}/></button>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold capitalize ${STATUS_BADGE[o.status]??''}`}>{o.status === 'ready' ? 'READY — serve' : o.status.replace('_',' ')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15">
                    <UtensilsCrossed size={13} className="text-amber-600 dark:text-amber-400"/>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">{o.table_number ?? '—'}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize ${TYPE_BADGE[o.order_type]??''}`}>{o.order_type.replace('_',' ')}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-white/[0.05]">
                  <p className="text-[12px] text-neutral-400">{Number(o.item_count)} item{Number(o.item_count) !== 1 ? 's' : ''}</p>
                  <p className="text-[15px] font-extrabold text-neutral-900 dark:text-white">${Number(o.total_amount).toFixed(2)}</p>
                </div>
                {['open','preparing','ready','served'].includes(o.status) && (() => {
                  const next = nextAction(o)
                  return (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {next && (
                        <button onClick={next.run} disabled={acting===o.id}
                          className={`rounded-lg py-1.5 text-[11.5px] font-bold transition-colors disabled:opacity-50 ${next.cls}`}>
                          {next.label}
                        </button>
                      )}
                      <button onClick={()=>doAction(o.id,'cancel')} disabled={acting===o.id}
                        className="rounded-lg bg-rose-50 py-1.5 text-[11.5px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors disabled:opacity-50">Cancel</button>
                    </div>
                  )
                })()}
              </div>
          ))}
        </div>
        <LoadMoreBar hasMore={hasMore} loading={loading} loadingMore={loadingMore} onLoadMore={loadMore} count={orders.length}/>
        </>
      )}
      {viewId && <OrderViewModal orderId={viewId} onClose={() => setViewId(null)} />}
    </div>
  )
}
