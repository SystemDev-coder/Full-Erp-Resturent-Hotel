import { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, Archive, Pencil, Trash2, AlertTriangle,
  ArrowLeftRight, Scale, ChefHat, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useLoadMore } from '@hooks/useLoadMore'

// ─── Types (mirror item / stock_movement / stock_balance / recipe tables) ─────

interface Item {
  id: string; sku: string; name: string; category: string; item_type: string
  unit_of_measure: string; reorder_level: string; is_active: boolean
  total_stock: string; avg_cost: string
}

interface Movement {
  id: string; movement_type: string; quantity: string; unit_cost: string
  notes?: string; moved_at: string; reference_type?: string
  item_name: string; sku: string; unit_of_measure: string
}

interface Balance {
  id: string; item_id: string; sku: string; name: string; category: string
  unit_of_measure: string; quantity_on_hand: string; average_cost: string
  last_updated: string; reorder_level: string; warehouse_name: string; is_low: boolean
}

interface RecipeRow {
  id: string; menu_item_id: string; item_id: string
  quantity_used: string; unit: string
  menu_item_name: string; menu_item_price: string
  item_name: string; sku: string; unit_of_measure: string
}

interface MenuItem { id: string; name: string; category_name: string; price: string }

// ─── Forms ────────────────────────────────────────────────────────────────────

interface ItemForm {
  sku: string; name: string; category: string; item_type: string
  unit_of_measure: string; reorder_level: string
}
const EMPTY_ITEM: ItemForm = {
  sku: '', name: '', category: 'general', item_type: 'ingredient',
  unit_of_measure: 'kg', reorder_level: '0',
}

interface AdjustForm { item_id: string; movement_type: string; quantity: string; unit_cost: string; notes: string }
const EMPTY_ADJUST: AdjustForm = { item_id: '', movement_type: 'adjustment', quantity: '', unit_cost: '0', notes: '' }

interface RecipeForm { menu_item_id: string; item_id: string; quantity_used: string; unit: string }
const EMPTY_RECIPE: RecipeForm = { menu_item_id: '', item_id: '', quantity_used: '', unit: 'kg' }

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ['kg','g','litre','ml','piece','box','bag','can','bottle','pack']
  .map(u => ({ value: u, label: u }))

const ITEM_TYPES = [
  { value: 'ingredient',    label: 'Ingredient' },
  { value: 'supply',        label: 'Supply' },
  { value: 'finished_good', label: 'Finished Good' },
  { value: 'asset',         label: 'Asset' },
]

const MOVEMENT_TYPES = [
  { value: 'purchase',      label: 'Purchase (in)' },
  { value: 'return',        label: 'Return (in)' },
  { value: 'transfer_in',   label: 'Transfer In' },
  { value: 'adjustment',    label: 'Adjustment (in)' },
  { value: 'issue_kitchen', label: 'Issue to Kitchen (out)' },
  { value: 'transfer_out',  label: 'Transfer Out' },
  { value: 'waste',         label: 'Waste (out)' },
]

const OUT_TYPES = new Set(['issue_kitchen', 'transfer_out', 'waste'])

const MOVE_BADGE: Record<string, string> = {
  purchase:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  return:        'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  transfer_in:   'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  adjustment:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  issue_kitchen: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  transfer_out:  'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  waste:         'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Items() {
  const [tab, setTab] = useState<'items' | 'movements' | 'balance' | 'recipes'>('items')

  const { items, loading: itemsLoading, loadingMore: itemsLoadingMore, hasMore: itemsHasMore,
          loadMore: loadMoreItems, reload: reloadItems, error: itemsLoadError } =
    useLoadMore<Item>('/inventory/items', { pageSize: 50 })
  const [movements, setMovements] = useState<Movement[]>([])
  const [balances,  setBalances]  = useState<Balance[]>([])
  const [recipes,   setRecipes]   = useState<RecipeRow[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode, setMode] = useState<null | 'addItem' | 'editItem' | 'deleteItem' | 'adjust' | 'addRecipe' | 'editRecipe' | 'deleteRecipe'>(null)
  const [selItem,   setSelItem]   = useState<Item | null>(null)
  const [selRecipe, setSelRecipe] = useState<RecipeRow | null>(null)

  const [itemForm,   setItemForm]   = useState<ItemForm>(EMPTY_ITEM)
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(EMPTY_ADJUST)
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(EMPTY_RECIPE)

  const fi = (k: keyof ItemForm,   v: string) => setItemForm(p => ({ ...p, [k]: v }))
  const fa = (k: keyof AdjustForm, v: string) => setAdjustForm(p => ({ ...p, [k]: v }))
  const fr = (k: keyof RecipeForm, v: string) => setRecipeForm(p => ({ ...p, [k]: v }))

  // Items (the tab most likely to hold hundreds of SKUs) load 50 at a time via
  // useLoadMore. The other three tabs' reference data loads together as before.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, bRes, rRes, miRes] = await Promise.all([
        api.get('/inventory/stock/movements'),
        api.get('/inventory/stock'),
        api.get('/inventory/recipes'),
        api.get('/restaurant/menu/items'),
      ])
      setMovements(mRes.data.data)
      setBalances(bRes.data.data)
      setRecipes(rRes.data.data)
      setMenuItems(miRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadAll = useCallback(() => { reloadItems(); load() }, [reloadItems, load])

  // The Adjust Stock and Recipe modals need the FULL item catalog to pick
  // from, not just the 50 currently loaded into the paginated Items table —
  // fetched once, lazily, the first time either modal opens.
  const [pickerItems,  setPickerItems]  = useState<Item[]>([])
  const [pickerLoaded, setPickerLoaded] = useState(false)
  const ensurePickerItems = useCallback(async () => {
    if (pickerLoaded) return
    try {
      const { data } = await api.get('/inventory/items')
      setPickerItems(data.data)
      setPickerLoaded(true)
    } catch (e) { setError(getApiErrorMessage(e)) }
  }, [pickerLoaded])

  const close = () => { setMode(null); setSelItem(null); setSelRecipe(null); setError('') }

  // ── Item CRUD ───────────────────────────────────────────────────────────────

  const openAddItem  = () => { setItemForm(EMPTY_ITEM); setSelItem(null); setMode('addItem'); setError('') }
  const openEditItem = (it: Item) => {
    setItemForm({
      sku: it.sku, name: it.name, category: it.category, item_type: it.item_type,
      unit_of_measure: it.unit_of_measure, reorder_level: String(it.reorder_level),
    })
    setSelItem(it); setMode('editItem'); setError('')
  }
  const openDeleteItem = (it: Item) => { setSelItem(it); setMode('deleteItem'); setError('') }

  const saveItem = async () => {
    if (!itemForm.sku.trim() || !itemForm.name.trim()) { setError('SKU and name are required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        sku: itemForm.sku.trim(), name: itemForm.name.trim(),
        category: itemForm.category || 'general', item_type: itemForm.item_type,
        unit_of_measure: itemForm.unit_of_measure,
        reorder_level: Number(itemForm.reorder_level) || 0,
      }
      if (mode === 'addItem') await api.post('/inventory/items', payload)
      else if (selItem)        await api.put(`/inventory/items/${selItem.id}`, payload)
      close(); loadAll()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const deleteItem = async () => {
    if (!selItem) return
    setSaving(true)
    try {
      await api.delete(`/inventory/items/${selItem.id}`)
      close(); loadAll()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Stock adjust ────────────────────────────────────────────────────────────

  const openAdjust = (itemId?: string) => {
    ensurePickerItems()
    setAdjustForm({ ...EMPTY_ADJUST, item_id: itemId ?? '' })
    setMode('adjust'); setError('')
  }

  const saveAdjust = async () => {
    if (!adjustForm.item_id || !adjustForm.quantity) { setError('Item and quantity are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/inventory/stock/adjust', {
        item_id:       adjustForm.item_id,
        movement_type: adjustForm.movement_type,
        quantity:      Math.abs(Number(adjustForm.quantity)),
        unit_cost:     Number(adjustForm.unit_cost) || 0,
        notes:         adjustForm.notes || undefined,
      })
      close(); loadAll()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Recipe CRUD ─────────────────────────────────────────────────────────────

  const openAddRecipe  = () => { ensurePickerItems(); setRecipeForm(EMPTY_RECIPE); setSelRecipe(null); setMode('addRecipe'); setError('') }
  const openEditRecipe = (r: RecipeRow) => {
    ensurePickerItems()
    setRecipeForm({ menu_item_id: r.menu_item_id, item_id: r.item_id, quantity_used: String(r.quantity_used), unit: r.unit })
    setSelRecipe(r); setMode('editRecipe'); setError('')
  }
  const openDeleteRecipe = (r: RecipeRow) => { setSelRecipe(r); setMode('deleteRecipe'); setError('') }

  const saveRecipe = async () => {
    if (!recipeForm.menu_item_id || !recipeForm.item_id || !recipeForm.quantity_used) {
      setError('Menu item, ingredient, and quantity are required'); return
    }
    setSaving(true); setError('')
    try {
      // Upsert: same endpoint handles add + edit (unique on menu_item + item)
      await api.post(`/restaurant/menu/items/${recipeForm.menu_item_id}/recipe`, {
        item_id:       recipeForm.item_id,
        quantity_used: Number(recipeForm.quantity_used),
        unit:          recipeForm.unit,
      })
      close(); loadAll()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const deleteRecipe = async () => {
    if (!selRecipe) return
    setSaving(true)
    try {
      await api.delete(`/restaurant/menu/items/recipe/${selRecipe.id}`)
      close(); loadAll()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Columns ─────────────────────────────────────────────────────────────────

  const ITEM_COLS: DTColumn<Item>[] = [
    { key:'sku',  label:'SKU',  render:r=><span className="font-mono text-[12px] font-bold text-indigo-600 dark:text-indigo-400">{r.sku}</span> },
    { key:'name', label:'Item', render:r=>(
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          <Archive size={13}/>
        </div>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.name}</span>
      </div>
    )},
    { key:'category',  label:'Category', render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.category?.replace(/_/g,' ')}</span> },
    { key:'item_type', label:'Type',     render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.item_type?.replace(/_/g,' ')}</span> },
    { key:'unit_of_measure', label:'Unit', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.unit_of_measure}</span> },
    { key:'total_stock', label:'In Stock', render:r=>{
      const low = Number(r.total_stock) <= Number(r.reorder_level)
      return <span className={`font-bold ${low ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-800 dark:text-white'}`}>
        {Number(r.total_stock)} {r.unit_of_measure}
        {low && <AlertTriangle size={11} className="inline ml-1 text-rose-500"/>}
      </span>
    }, exportValue:r=>r.total_stock },
    { key:'reorder_level', label:'Reorder At', render:r=><span className="text-neutral-500 dark:text-neutral-400">{Number(r.reorder_level)} {r.unit_of_measure}</span>, exportValue:r=>r.reorder_level },
    { key:'avg_cost', label:'Avg Cost', render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.avg_cost).toFixed(2)}</span>, exportValue:r=>r.avg_cost },
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openAdjust(r.id)}
          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 transition-colors">
          Adjust
        </button>
        <button onClick={()=>openEditItem(r)}
          className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={()=>openDeleteItem(r)}
          className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  const MOVE_COLS: DTColumn<Movement>[] = [
    { key:'moved_at', label:'Date', render:r=>(
      <div>
        <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">
          {new Date(r.moved_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
        </p>
        <p className="text-[11px] text-neutral-400">
          {new Date(r.moved_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
        </p>
      </div>
    )},
    { key:'item_name', label:'Item', render:r=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.item_name}</p>
        <p className="font-mono text-[11px] text-neutral-400">{r.sku}</p>
      </div>
    )},
    { key:'movement_type', label:'Movement', render:r=>(
      <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${MOVE_BADGE[r.movement_type] ?? ''}`}>
        {OUT_TYPES.has(r.movement_type) ? <ArrowUpFromLine size={11}/> : <ArrowDownToLine size={11}/>}
        {r.movement_type.replace(/_/g,' ')}
      </span>
    )},
    { key:'quantity', label:'Qty', render:r=>(
      <span className={`font-bold ${OUT_TYPES.has(r.movement_type) ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
        {OUT_TYPES.has(r.movement_type) ? '−' : '+'}{Number(r.quantity)} {r.unit_of_measure}
      </span>
    ), exportValue:r=>r.quantity },
    { key:'unit_cost', label:'Unit Cost', render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.unit_cost).toFixed(2)}</span>, exportValue:r=>r.unit_cost },
    { key:'reference_type', label:'Reference', render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.reference_type?.replace(/_/g,' ') ?? 'manual'}</span> },
    { key:'notes', label:'Notes', render:r=><span className="text-[12px] text-neutral-400">{r.notes ?? '—'}</span> },
  ]

  const BAL_COLS: DTColumn<Balance>[] = [
    { key:'name', label:'Item', render:r=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.name}</p>
        <p className="font-mono text-[11px] text-neutral-400">{r.sku}</p>
      </div>
    )},
    { key:'category',       label:'Category',  render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.category?.replace(/_/g,' ')}</span> },
    { key:'warehouse_name', label:'Warehouse', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.warehouse_name}</span> },
    { key:'quantity_on_hand', label:'On Hand', render:r=>(
      <span className={`font-bold ${r.is_low ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-800 dark:text-white'}`}>
        {Number(r.quantity_on_hand)} {r.unit_of_measure}
        {r.is_low && <AlertTriangle size={11} className="inline ml-1 text-rose-500"/>}
      </span>
    ), exportValue:r=>r.quantity_on_hand },
    { key:'reorder_level', label:'Reorder At', render:r=><span className="text-neutral-500 dark:text-neutral-400">{Number(r.reorder_level)} {r.unit_of_measure}</span>, exportValue:r=>r.reorder_level },
    { key:'average_cost',  label:'Avg Cost',   render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.average_cost).toFixed(2)}</span>, exportValue:r=>r.average_cost },
    { key:'last_updated',  label:'Updated',    render:r=><span className="text-[12px] text-neutral-400">{r.last_updated ? new Date(r.last_updated).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</span> },
    { key:'_low', label:'', sortable:false, render:r=>(
      r.is_low
        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Low Stock</span>
        : null
    )},
  ]

  const RECIPE_COLS: DTColumn<RecipeRow>[] = [
    { key:'menu_item_name', label:'Menu Item', render:r=>(
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <ChefHat size={13}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.menu_item_name}</p>
          <p className="text-[11px] text-neutral-400">${Number(r.menu_item_price).toFixed(2)}</p>
        </div>
      </div>
    )},
    { key:'item_name', label:'Ingredient', render:r=>(
      <div>
        <p className="font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">{r.item_name}</p>
        <p className="font-mono text-[11px] text-neutral-400">{r.sku}</p>
      </div>
    )},
    { key:'quantity_used', label:'Qty Used', render:r=>(
      <span className="font-bold text-neutral-800 dark:text-white">{Number(r.quantity_used)} {r.unit}</span>
    ), exportValue:r=>r.quantity_used },
    { key:'unit', label:'Unit', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.unit}</span> },
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEditRecipe(r)}
          className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={()=>openDeleteRecipe(r)}
          className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  // ── Header action per tab ───────────────────────────────────────────────────

  const lowCount = balances.filter(b => b.is_low).length

  const headerAction = tab === 'items' ? (
    <button onClick={openAddItem}
      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
      <Plus size={15}/> New Item
    </button>
  ) : tab === 'recipes' ? (
    <button onClick={openAddRecipe}
      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
      <Plus size={15}/> New Recipe
    </button>
  ) : (
    <button onClick={()=>openAdjust()}
      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
      <Plus size={15}/> Adjust Stock
    </button>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Items & Stock</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {items.length} items · {recipes.length} recipes
            {lowCount > 0 && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">{lowCount} low stock</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={(loading || itemsLoading) ? 'animate-spin' : ''}/>
          </button>
          {headerAction}
        </div>
      </div>

      {(error || itemsLoadError) && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error || itemsLoadError}</p>}

      {/* Tabs — one per DB table */}
      <Tabs
        active={tab}
        onChange={k => setTab(k as typeof tab)}
        tabs={[
          { key: 'items',     label: 'Items',          icon: <Archive size={14}/>,        count: items.length },
          { key: 'movements', label: 'Stock Movement', icon: <ArrowLeftRight size={14}/>, count: movements.length },
          { key: 'balance',   label: 'Stock Balance',  icon: <Scale size={14}/>,          count: balances.length },
          { key: 'recipes',   label: 'Recipe',         icon: <ChefHat size={14}/>,        count: recipes.length },
        ]}
      />

      {tab === 'items' && (
        <DataTable columns={ITEM_COLS} data={items} title="Items" filename="items"
          rowKey={r=>r.id} searchPlaceholder="Search SKU, name, category…" loading={itemsLoading}
          onLoadMore={loadMoreItems} hasMore={itemsHasMore} loadingMore={itemsLoadingMore}/>
      )}

      {tab === 'movements' && (
        <DataTable columns={MOVE_COLS} data={movements} title="Stock Movements" filename="stock_movements"
          rowKey={r=>r.id} searchPlaceholder="Search item, movement type…" loading={loading}/>
      )}

      {tab === 'balance' && (
        <div className="space-y-4">
          {lowCount > 0 && (
            <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/25 dark:bg-rose-500/10">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"/>
              <div className="flex-1">
                <p className="text-[12.5px] font-bold text-rose-800 dark:text-rose-300">Low Stock Alert</p>
                <p className="text-[12px] text-rose-600 dark:text-rose-400">
                  {balances.filter(b=>b.is_low).map(b=>b.name).join(', ')}
                </p>
              </div>
            </div>
          )}
          <DataTable columns={BAL_COLS} data={balances} title="Stock Balance" filename="stock_balance"
            rowKey={r=>r.id} searchPlaceholder="Search item, warehouse…" loading={loading}/>
        </div>
      )}

      {tab === 'recipes' && (
        <DataTable columns={RECIPE_COLS} data={recipes} title="Recipes" filename="recipes"
          rowKey={r=>r.id} searchPlaceholder="Search menu item, ingredient…" loading={loading}/>
      )}

      {/* ── Add / Edit Item ─────────────────────────────────────────────── */}
      <Modal open={mode === 'addItem' || mode === 'editItem'} onClose={close}
        title={mode === 'addItem' ? 'New Item' : `Edit: ${selItem?.name ?? ''}`} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveItem} disabled={!itemForm.sku.trim() || !itemForm.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'addItem' ? 'Create Item' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU">
              <input value={itemForm.sku} onChange={e=>fi('sku', e.target.value)}
                placeholder="e.g. RICE-001" className={INPUT} autoFocus disabled={mode === 'editItem'}/>
            </Field>
            <Field label="Item Name">
              <input value={itemForm.name} onChange={e=>fi('name', e.target.value)}
                placeholder="e.g. Basmati Rice" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input value={itemForm.category} onChange={e=>fi('category', e.target.value)}
                placeholder="e.g. grains, meat, dairy" className={INPUT}/>
            </Field>
            <Field label="Item Type">
              <Select value={itemForm.item_type} onChange={v=>fi('item_type', v)} options={ITEM_TYPES}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit of Measure">
              <Select value={itemForm.unit_of_measure} onChange={v=>fi('unit_of_measure', v)} options={UNITS}/>
            </Field>
            <Field label="Reorder Level">
              <input type="number" step="0.1" value={itemForm.reorder_level}
                onChange={e=>fi('reorder_level', e.target.value)} placeholder="0" className={INPUT}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── Delete Item ─────────────────────────────────────────────────── */}
      <Modal open={mode === 'deleteItem'} onClose={close} title="Delete Item" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={deleteItem} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selItem?.name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">Stock history stays linked to this item.</p>
        </div>
      </Modal>

      {/* ── Adjust Stock ────────────────────────────────────────────────── */}
      <Modal open={mode === 'adjust'} onClose={close} title="Adjust Stock" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveAdjust} disabled={!adjustForm.item_id || !adjustForm.quantity || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Save Adjustment
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Item">
            <Select value={adjustForm.item_id} onChange={v=>fa('item_id', v)}
              placeholder="— Select item —"
              options={pickerItems.map(i => ({ value: i.id, label: `${i.name} (${Number(i.total_stock)} ${i.unit_of_measure})` }))}/>
          </Field>
          <Field label="Movement Type">
            <Select value={adjustForm.movement_type} onChange={v=>fa('movement_type', v)} options={MOVEMENT_TYPES}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <input type="number" step="0.1" min="0" value={adjustForm.quantity}
                onChange={e=>fa('quantity', e.target.value)} placeholder="e.g. 10" className={INPUT}/>
            </Field>
            <Field label="Unit Cost ($)">
              <input type="number" step="0.01" min="0" value={adjustForm.unit_cost}
                onChange={e=>fa('unit_cost', e.target.value)} placeholder="0.00" className={INPUT}
                disabled={OUT_TYPES.has(adjustForm.movement_type)}/>
            </Field>
          </div>
          <Field label="Notes (optional)">
            <input value={adjustForm.notes} onChange={e=>fa('notes', e.target.value)}
              placeholder="e.g. Weekly stock count correction…" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* ── Add / Edit Recipe ───────────────────────────────────────────── */}
      <Modal open={mode === 'addRecipe' || mode === 'editRecipe'} onClose={close}
        title={mode === 'addRecipe' ? 'New Recipe Line' : `Edit Recipe: ${selRecipe?.menu_item_name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveRecipe}
            disabled={!recipeForm.menu_item_id || !recipeForm.item_id || !recipeForm.quantity_used || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'addRecipe' ? 'Add Recipe Line' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Menu Item (dish)">
            <Select value={recipeForm.menu_item_id} onChange={v=>fr('menu_item_id', v)}
              placeholder="— Select menu item —" disabled={mode === 'editRecipe'}
              options={menuItems.map(m => ({ value: m.id, label: `${m.name} — ${m.category_name}` }))}/>
          </Field>
          <Field label="Ingredient (inventory item)">
            <Select value={recipeForm.item_id} onChange={v=>fr('item_id', v)}
              placeholder="— Select ingredient —" disabled={mode === 'editRecipe'}
              options={pickerItems.map(i => ({ value: i.id, label: `${i.name} (${i.unit_of_measure})` }))}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity Used">
              <input type="number" step="0.001" min="0" value={recipeForm.quantity_used}
                onChange={e=>fr('quantity_used', e.target.value)} placeholder="e.g. 0.25" className={INPUT}/>
            </Field>
            <Field label="Unit">
              <Select value={recipeForm.unit} onChange={v=>fr('unit', v)} options={UNITS}/>
            </Field>
          </div>
          <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
            <p className="text-[12px] text-sky-700 dark:text-sky-300">
              Each recipe line tells the system how much of an ingredient one serving of the dish consumes.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Delete Recipe ───────────────────────────────────────────────── */}
      <Modal open={mode === 'deleteRecipe'} onClose={close} title="Delete Recipe Line" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={deleteRecipe} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">
            Remove {selRecipe?.item_name} from {selRecipe?.menu_item_name}?
          </p>
          <p className="mt-1 text-[13px] text-neutral-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  )
}
