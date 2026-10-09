import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, ToggleLeft, ToggleRight, LayoutGrid, Table2, Pencil, Trash2, RefreshCw, ImagePlus, X, UtensilsCrossed, Expand } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { ImageThumb } from '@/components/ui/ImageThumb'
import ImageModal from '@/components/ui/ImageModal'
import { isImageFile } from '@utils/imageFile'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; description?: string; sort_order: number }
interface MenuItem {
  id: string; name: string; category_id: string; category_name: string
  price: number; cost: number; is_available: boolean; is_popular: boolean
  preparation_time_minutes: number; image_url?: string; description?: string
}
interface Form { name: string; category_id: string; price: string; cost: string; is_available: boolean; description: string }

const EMPTY: Form = { name: '', category_id: '', price: '', cost: '', is_available: true, description: '' }
const margin = (p: number, c: number) => Math.round(((p - c) / p) * 100)
const toForm = (i: MenuItem): Form => ({
  name: i.name, category_id: i.category_id,
  price: String(i.price), cost: String(i.cost),
  is_available: i.is_available, description: i.description ?? '',
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Menu() {
  const [items,     setItems]     = useState<MenuItem[]>([])
  const [cats,      setCats]      = useState<Category[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [search,    setSearch]    = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [view,      setView]      = useState<'grid'|'table'>('grid')
  const [mode,      setMode]      = useState<null|'add'|'edit'|'delete'>(null)
  const [selected,  setSelected]  = useState<MenuItem|null>(null)
  const [form,      setForm]      = useState<Form>(EMPTY)

  // Item photo upload
  const [imgFile,    setImgFile]    = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState('')
  const [viewImage,  setViewImage]  = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const MAX_IMAGE_BYTES = 15 * 1024 * 1024

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isImageFile(file)) {
      setError('Unsupported image format — please use JPG, PNG, or WebP.'); return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image is too large — please use a file under 15MB.'); return
    }
    setError('')
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }
  const clearImage = () => { setImgFile(null); setImgPreview('') }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, cRes] = await Promise.all([
        api.get('/restaurant/menu/items'),
        api.get('/restaurant/menu/categories'),
      ])
      // API returns cost_price — normalise to the `cost` field this page uses
      setItems((iRes.data.data as (MenuItem & { cost_price?: number })[])
        .map(i => ({ ...i, cost: Number(i.cost ?? i.cost_price ?? 0) })))
      setCats(cRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i =>
    (catFilter === 'all' || i.category_id === catFilter) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd  = ()         => { setForm({ ...EMPTY, category_id: cats[0]?.id ?? '' }); setSelected(null); setMode('add'); setError(''); clearImage() }
  const openEdit = (i: MenuItem) => {
    setForm(toForm(i)); setSelected(i); setMode('edit'); setError('')
    setImgFile(null); setImgPreview(i.image_url ?? '')
  }
  const openDel  = (i: MenuItem) => { setSelected(i); setMode('delete'); setError('') }
  const close    = ()         => { setMode(null); setSelected(null); setError(''); clearImage() }
  const f        = (k: keyof Form, v: string|boolean) => setForm(p => ({ ...p, [k]: v }))

  const saveItem = async () => {
    if (!form.name.trim() || !parseFloat(form.price)) { setError('Name and price are required'); return }
    setSaving(true); setError('')
    try {
      // Upload the item photo first (if a new one was chosen)
      let imageUrl: string | undefined
      if (imgFile) {
        const fd = new FormData()
        fd.append('file', imgFile)
        const up = await api.post('/uploads/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        imageUrl = up.data.url
      }

      const payload = {
        name:               form.name.trim(),
        category_id:        form.category_id,
        price:              parseFloat(form.price),
        cost_price:         parseFloat(form.cost) || 0,
        is_available:       form.is_available,
        description:        form.description || undefined,
        image_url:          imageUrl,
      }
      if (mode === 'add')     await api.post('/restaurant/menu/items', payload)
      else if (selected)      await api.put(`/restaurant/menu/items/${selected.id}`, payload)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const deleteItem   = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.delete(`/restaurant/menu/items/${selected.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
  }

  const toggleAvail = async (i: MenuItem) => {
    try {
      await api.patch(`/restaurant/menu/items/${i.id}/toggle`)
      setItems(p => p.map(x => x.id === i.id ? { ...x, is_available: !x.is_available } : x))
    } catch (e) { setError(getApiErrorMessage(e)) }
  }

  const isValid = form.name.trim().length > 0 && parseFloat(form.price) > 0
  const pF = parseFloat(form.price) || 0
  const cF = parseFloat(form.cost)  || 0

  const COLS: DTColumn<MenuItem>[] = [
    { key:'name',        label:'Item',      render:r=>(
      <div className="flex items-center gap-2.5">
        <ImageThumb src={r.image_url} alt={r.name} className="h-9 w-14 rounded-lg"
          onClick={r.image_url ? () => setViewImage(r.image_url!) : undefined}
          fallback={<UtensilsCrossed size={13} strokeWidth={1.5} className="text-neutral-300 dark:text-neutral-600"/>}/>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{r.name}</span>
      </div>
    )},
    { key:'category_name', label:'Category', render:r=><span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{r.category_name}</span> },
    { key:'price',       label:'Price',     render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.price).toFixed(2)}</span>, exportValue:r=>r.price },
    { key:'cost',        label:'Cost',      render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.cost).toFixed(2)}</span>, exportValue:r=>r.cost },
    { key:'margin',      label:'Margin',    render:r=>{const m=margin(r.price,r.cost);return<span className={`font-semibold ${m>=60?'text-emerald-600 dark:text-emerald-400':'text-amber-600 dark:text-amber-400'}`}>{m}%</span>}, exportValue:r=>margin(r.price,r.cost) },
    { key:'is_available',label:'Status',    render:r=>(
      r.is_available
        ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><ToggleRight size={14}/>Available</span>
        : <span className="flex items-center gap-1 text-[11px] font-bold text-rose-500 dark:text-rose-400"><ToggleLeft size={14}/>Off Menu</span>
    )},
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEdit(r)} className="flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-neutral-700 dark:text-neutral-300 transition-colors">
          <Pencil size={11}/> Edit
        </button>
        <button onClick={()=>openDel(r)} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={11}/> Del
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Menu Management</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{items.length} items · {cats.length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-amber-300 hover:text-amber-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <div className="flex overflow-hidden rounded-xl border border-neutral-200/60 bg-white dark:border-white/[0.06] dark:bg-[#1c2333]">
            <button onClick={()=>setView('grid')} className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition-colors ${view==='grid'?'bg-amber-500 text-white':'text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-white/[0.04]'}`}><LayoutGrid size={13}/> Grid</button>
            <button onClick={()=>setView('table')} className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition-colors ${view==='table'?'bg-amber-500 text-white':'text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-white/[0.04]'}`}><Table2 size={13}/> Table</button>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-amber-600 transition-colors">
            <Plus size={15}/> Add Item
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={()=>setCatFilter('all')}
          className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${catFilter==='all'?'bg-amber-500 text-white':'bg-white border border-neutral-200/60 text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-[#1c2333] dark:text-neutral-300'}`}>
          All
        </button>
        {cats.map(c=>(
          <button key={c.id} onClick={()=>setCatFilter(c.id)}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${catFilter===c.id?'bg-amber-500 text-white':'bg-white border border-neutral-200/60 text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-[#1c2333] dark:text-neutral-300'}`}>
            {c.name}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu…"
            className="w-44 rounded-lg border border-neutral-200/60 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-amber-300 dark:border-white/[0.08] dark:bg-[#1c2333] dark:text-white dark:placeholder-neutral-500"/>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_,i)=><div key={i} className="h-56 animate-pulse rounded-2xl bg-neutral-100 dark:bg-white/[0.05]"/>)}
        </div>
      ) : view === 'table' ? (
        <DataTable columns={COLS} data={filtered} title="Menu Items" filename="menu_items" rowKey={r=>r.id} searchPlaceholder="Search menu item…"/>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(item=>(
            <div key={item.id} className={`group rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all dark:bg-[#1c2333] ${!item.is_available?'opacity-70 border-rose-200 dark:border-rose-500/20':'border-neutral-200/60 dark:border-white/[0.06]'}`}>
              {/* Image / Placeholder */}
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-2xl">
                <div className="h-full w-full transition-transform duration-300 group-hover:scale-105">
                  <ImageThumb src={item.image_url} alt={item.name} className="h-full w-full"
                    fallback={
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-amber-50 to-orange-100 text-amber-300 dark:from-amber-900/20 dark:to-orange-900/20 dark:text-amber-800">
                        <UtensilsCrossed size={28} strokeWidth={1.5}/>
                        <span className="text-[9.5px] font-semibold uppercase tracking-wide">No photo</span>
                      </div>
                    }/>
                </div>
                {item.image_url && (
                  <button onClick={()=>setViewImage(item.image_url!)} title="View full photo"
                    className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/60">
                    <Expand size={13}/>
                  </button>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button onClick={()=>openEdit(item)} className="flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-1.5 text-[12px] font-bold text-neutral-800 hover:bg-white transition-colors shadow-lg">
                    <Pencil size={12}/> Edit
                  </button>
                  <button onClick={()=>openDel(item)} className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-rose-600 transition-colors shadow-lg">
                    <Trash2 size={12}/> Delete
                  </button>
                </div>
                {!item.is_available && (
                  <span className="absolute top-2 right-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">Off Menu</span>
                )}
                {item.category_name && (
                  <span className="absolute top-2 left-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">{item.category_name}</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-[13.5px] font-bold text-neutral-800 dark:text-white leading-tight">{item.name}</p>
                {item.description && <p className="mt-0.5 text-[11px] text-neutral-400 line-clamp-1">{item.description}</p>}
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-[18px] font-extrabold text-neutral-900 dark:text-white">${Number(item.price).toFixed(2)}</p>
                    <p className="text-[10.5px] text-neutral-400">Cost ${Number(item.cost).toFixed(2)} · {margin(item.price, item.cost)}% margin</p>
                  </div>
                  <button onClick={()=>toggleAvail(item)}
                    className={`flex items-center gap-1 text-[11px] font-bold transition-colors ${item.is_available?'text-emerald-600 dark:text-emerald-400':'text-rose-500 dark:text-rose-400'}`} title="Toggle availability">
                    {item.is_available ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="col-span-full py-12 text-center text-neutral-400">No items match your filters.</div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={mode==='add'||mode==='edit'} onClose={close}
        title={mode==='add'?'Add Menu Item':`Edit: ${selected?.name??''}`}
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveItem} disabled={!isValid || saving}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode==='add'?'Add Item':'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          {/* Item photo — shows on the POS and menu cards */}
          <Field label="Item Photo">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} className="hidden"/>
            {imgPreview ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-neutral-200 dark:border-white/[0.08]">
                <img src={imgPreview} alt="Item preview" className="h-full w-full object-cover"/>
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={()=>setViewImage(imgPreview)}
                    className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-bold text-neutral-700 shadow hover:bg-white transition-colors">
                    <Expand size={11}/> View
                  </button>
                  <button type="button" onClick={()=>fileRef.current?.click()}
                    className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-bold text-neutral-700 shadow hover:bg-white transition-colors">
                    Change
                  </button>
                  <button type="button" onClick={clearImage}
                    className="rounded-lg bg-rose-500 p-1.5 text-white shadow hover:bg-rose-600 transition-colors">
                    <X size={11}/>
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={()=>fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 py-5 hover:border-amber-300 hover:bg-amber-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-amber-500/50 transition-colors">
                <ImagePlus size={22} className="text-neutral-300 dark:text-neutral-600"/>
                <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Upload real food photo</span>
                <span className="text-[10.5px] text-neutral-400">JPG, PNG or WebP · Max 15 MB · auto-resized &amp; optimized</span>
              </button>
            )}
          </Field>

          <Field label="Item Name">
            <input value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. Grilled Chicken" className={INPUT} autoFocus/>
          </Field>
          <Field label="Category">
            <select value={form.category_id} onChange={e=>f('category_id',e.target.value)} className={INPUT}>
              {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <input value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Brief description…" className={INPUT}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Selling Price ($)">
              <input type="number" min="0" step="0.5" value={form.price} onChange={e=>f('price',e.target.value)} placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Cost Price ($)">
              <input type="number" min="0" step="0.5" value={form.cost} onChange={e=>f('cost',e.target.value)} placeholder="0.00" className={INPUT}/>
            </Field>
          </div>
          {pF > 0 && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
              <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                Margin: {margin(pF, cF)}% · Profit: ${(pF - cF).toFixed(2)} per serving
              </p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-neutral-200/60 px-4 py-3 dark:border-white/[0.06]">
            <div>
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">Available on menu</p>
              <p className="text-[11px] text-neutral-400">Customers can order this item</p>
            </div>
            <button onClick={()=>f('is_available',!form.is_available)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold transition-colors ${form.is_available?'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300':'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'}`}>
              {form.is_available ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
              {form.is_available ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={mode==='delete'} onClose={close} title="Delete Menu Item" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={deleteItem} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Delete
          </button>
        </>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 w-full">{error}</p>}
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/20">
            <Trash2 size={24} className="text-rose-600 dark:text-rose-400"/>
          </div>
          <div>
            <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete "{selected?.name}"?</p>
            <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">This item will be permanently removed from the menu.</p>
          </div>
        </div>
      </Modal>

      <ImageModal src={viewImage} alt="Menu item photo" onClose={()=>setViewImage(null)}/>
    </div>
  )
}
