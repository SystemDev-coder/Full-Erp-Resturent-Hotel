import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChefHat, Clock, Star, Wifi } from 'lucide-react'
import { MENU_CATEGORIES, MENU_ITEMS } from '@/data/menuData'

export default function MenuPage() {
  const { tableId } = useParams<{ tableId: string }>()
  const [activeCat, setActiveCat] = useState('all')

  const visible = activeCat === 'all'
    ? MENU_ITEMS.filter(i => i.available)
    : MENU_ITEMS.filter(i => i.categoryId === activeCat && i.available)

  return (
    <div className="min-h-screen bg-neutral-50 pb-10">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 shadow-sm">
            <ChefHat size={18} className="text-white"/>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-none text-neutral-900">Digital Menu</p>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">
              Table <span className="font-bold text-orange-500">{tableId}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1">
            <Wifi size={11} className="text-emerald-500"/>
            <span className="text-[10.5px] font-bold text-emerald-600">Online</span>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto border-t border-neutral-100 px-4 py-2.5 scrollbar-none">
          <button onClick={() => setActiveCat('all')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
              activeCat === 'all' ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}>
            All
          </button>
          {MENU_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCat(cat.id)}
              className={`shrink-0 flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                activeCat === cat.id ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}>
              <span>{cat.emoji}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Category Header ── */}
      {activeCat !== 'all' && (() => {
        const cat = MENU_CATEGORIES.find(c => c.id === activeCat)
        if (!cat) return null
        return (
          <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 p-4 text-white shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{cat.emoji}</span>
              <div>
                <p className="text-[16px] font-extrabold">{cat.name}</p>
                <p className="text-[12px] text-white/80">{cat.description}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Items ── */}
      <div className="mt-4 space-y-3 px-4">
        {visible.length === 0 && (
          <div className="flex h-40 items-center justify-center text-neutral-400">
            <p className="text-[13px]">No items available</p>
          </div>
        )}
        {visible.map(item => (
          <div key={item.id}
            className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-sm">
            <div className="flex gap-3 p-3">
              {/* Image */}
              <div className="relative h-[90px] w-[100px] shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                <img src={item.image} alt={item.name}
                  className="h-full w-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }}/>
                {item.isPopular && (
                  <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    <Star size={7} className="fill-white"/> Popular
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-[14px] font-extrabold leading-tight text-neutral-900">{item.name}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-500 line-clamp-2">{item.description}</p>

                {/* Tags */}
                {item.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium capitalize text-neutral-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Price row */}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[17px] font-extrabold text-orange-500">${item.price}</span>
                  <div className="flex items-center gap-1 text-neutral-400">
                    <Clock size={11}/>
                    <span className="text-[11px]">{item.preparationTime} min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="mt-8 px-4 text-center">
        <p className="text-[11px] text-neutral-400">
          Please inform your waiter to place your order.
        </p>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <div className="h-5 w-5 rounded-lg bg-orange-500 flex items-center justify-center">
            <ChefHat size={11} className="text-white"/>
          </div>
          <p className="text-[11px] font-semibold text-neutral-400">Powered by Hospitality ERP</p>
        </div>
      </div>
    </div>
  )
}