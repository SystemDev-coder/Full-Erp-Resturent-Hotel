import { useState, useEffect, useCallback } from 'react'
import { Hotel, UtensilsCrossed, Package, Calculator, Users, BarChart2, RefreshCw } from 'lucide-react'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

const ICON_MAP: Record<string, React.ReactNode> = {
  hotel:       <Hotel size={20}/>,
  restaurant:  <UtensilsCrossed size={20}/>,
  inventory:   <Package size={20}/>,
  accounting:  <Calculator size={20}/>,
  hr:          <Users size={20}/>,
  reports:     <BarChart2 size={20}/>,
}

const COLOR_MAP: Record<string, string> = {
  hotel:       'text-sky-500',
  restaurant:  'text-amber-500',
  inventory:   'text-emerald-500',
  accounting:  'text-violet-500',
  hr:          'text-rose-500',
  reports:     'text-indigo-500',
}

interface Module { key: string; label: string; description: string; is_enabled: boolean; is_required: boolean }

export default function ModuleConfig() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/system/modules')
      setModules(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (key: string) => {
    setSaving(key); setSaved(false)
    try {
      await api.patch(`/system/modules/${key}`)
      setModules(prev => prev.map(m => m.key === key ? { ...m, is_enabled: !m.is_enabled } : m))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(null) }
  }

  const enabledCount = modules.filter(m => m.is_enabled).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Module Configuration</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{enabledCount}/{modules.length} modules enabled</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="rounded-xl bg-emerald-100 px-3 py-1.5 text-[12px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">✓ Saved</span>}
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_,i)=><div key={i} className="h-28 animate-pulse rounded-2xl bg-neutral-100 dark:bg-white/[0.05]"/>)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(m => (
            <div key={m.key} className={`relative rounded-2xl border bg-white p-5 shadow-sm transition-all dark:bg-[#1c2333] ${
              m.is_enabled ? 'border-neutral-200/60 dark:border-white/[0.06]' : 'border-dashed border-neutral-200 opacity-60 dark:border-white/[0.06]'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] ${COLOR_MAP[m.key] ?? 'text-neutral-500'}`}>
                  {ICON_MAP[m.key] ?? <Package size={20}/>}
                </div>
                <button
                  onClick={() => !m.is_required && toggle(m.key)}
                  disabled={m.is_required || saving === m.key}
                  title={m.is_required ? 'This module is required and cannot be disabled' : undefined}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed ${
                    m.is_enabled ? 'bg-indigo-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    m.is_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}/>
                </button>
              </div>
              <p className="text-[14px] font-bold text-neutral-800 dark:text-white">{m.label}</p>
              <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed">{m.description}</p>
              {m.is_required && (
                <p className="mt-2 text-[10.5px] font-semibold text-neutral-400">Required — cannot disable</p>
              )}
              {saving === m.key && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/60 dark:bg-black/40">
                  <RefreshCw size={16} className="animate-spin text-indigo-500"/>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
