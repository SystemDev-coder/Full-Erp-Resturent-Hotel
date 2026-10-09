import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ChefHat, Clock, Leaf, Search, UtensilsCrossed, WifiOff } from 'lucide-react'

// Public digital menu opened from the table QR code — no login. It shows the REAL menu
// (live prices, availability, photos) of the branch printed in the QR link:
//   /menu/<branchId>?table=<tableNumber>

interface Item {
  id: string; category_id: string; name: string; description?: string; price: string
  image_url?: string; prep_time_minutes?: number; is_halal?: boolean; is_vegetarian?: boolean
  allergens?: string[]
}
interface Category { id: string; name: string; items: Item[] }
interface MenuData {
  restaurant: { name?: string; cuisine_type?: string }
  organization?: { name?: string; logo_url?: string }
  categories: Category[]
}

const API = import.meta.env.VITE_API_BASE_URL || '/api'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const money = (v: string | number) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function MenuPage() {
  const { branchId = '' } = useParams<{ branchId: string }>()
  const [params] = useSearchParams()
  // Older QR codes were printed as /menu/<table number>
  const table = params.get('table') ?? (UUID.test(branchId) ? '' : branchId)

  const [data, setData] = useState<MenuData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`${API}/public/menu/${encodeURIComponent(branchId)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.message ?? 'Could not load the menu')
        return j.data as MenuData
      })
      .then(d => { if (alive) { setData(d); setError('') } })
      .catch(e => { if (alive) setError(e.message || 'Could not load the menu') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [branchId])

  const categories = (data?.categories ?? []).filter(c => c.items.length > 0)
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return categories
      .filter(c => cat === 'all' || c.id === cat)
      .map(c => ({ ...c, items: c.items.filter(i => !needle || i.name.toLowerCase().includes(needle) || (i.description ?? '').toLowerCase().includes(needle)) }))
      .filter(c => c.items.length > 0)
  }, [categories, cat, q])

  const title = data?.restaurant.name ?? data?.organization?.name ?? 'Digital Menu'

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-orange-500" /></div>
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-500"><WifiOff size={26} /></span>
        <p className="text-[15px] font-bold text-neutral-800">The menu is not available right now</p>
        <p className="max-w-xs text-[13px] text-neutral-500">{error || 'Please ask a member of staff for the menu.'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3.5">
          {data.organization?.logo_url
            ? <img src={data.organization.logo_url} alt="" className="h-10 w-10 rounded-xl object-contain" />
            : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-sm"><ChefHat size={19} className="text-white" /></div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold leading-tight text-neutral-900">{title}</p>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">
              {data.restaurant.cuisine_type ? `${data.restaurant.cuisine_type} · ` : ''}
              {table ? <>Table <span className="font-bold text-orange-500">{table}</span></> : 'Digital menu'}
            </p>
          </div>
        </div>

        <div className="px-4 pb-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <Search size={14} className="text-neutral-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the menu…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-800 outline-none placeholder-neutral-400" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-t border-neutral-100 px-4 py-2.5">
          {[{ id: 'all', name: 'All' }, ...categories].map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                cat === c.id ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="mt-4 space-y-5 px-4">
        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-neutral-400">
            <UtensilsCrossed size={26} /><p className="text-[13px]">{q ? 'Nothing matches your search' : 'No items available right now'}</p>
          </div>
        )}
        {visible.map(c => (
          <section key={c.id}>
            {cat === 'all' && <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-neutral-400">{c.name}</h2>}
            <div className="space-y-3">
              {c.items.map(item => (
                <div key={item.id} className="flex gap-3 overflow-hidden rounded-2xl border border-neutral-200/60 bg-white p-3 shadow-sm">
                  <div className="relative h-[90px] w-[100px] shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      : <span className="flex h-full w-full items-center justify-center text-neutral-300"><UtensilsCrossed size={26} /></span>}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="text-[14px] font-extrabold leading-tight text-neutral-900">{item.name}</p>
                    {item.description && <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-neutral-500">{item.description}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.is_halal && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Halal</span>}
                      {item.is_vegetarian && <span className="flex items-center gap-0.5 rounded-full bg-lime-50 px-2 py-0.5 text-[10px] font-semibold text-lime-600"><Leaf size={9} />Vegetarian</span>}
                      {(item.allergens ?? []).slice(0, 2).map(a => <span key={a} className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-rose-500">{a}</span>)}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[17px] font-extrabold text-orange-500">{money(item.price)}</span>
                      {!!item.prep_time_minutes && <span className="flex items-center gap-1 text-[11px] text-neutral-400"><Clock size={11} />{item.prep_time_minutes} min</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 px-4 text-center">
        <p className="text-[11px] text-neutral-400">Please tell your waiter what you would like to order.</p>
      </div>
    </div>
  )
}
