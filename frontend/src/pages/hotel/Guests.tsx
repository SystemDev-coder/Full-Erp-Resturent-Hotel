import { useState, useRef } from 'react'
import { Plus, RefreshCw, Star, Trash2, Upload, FileImage, X } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useLoadMore } from '@hooks/useLoadMore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Guest {
  id: string; first_name: string; last_name: string
  email?: string; phone?: string; nationality?: string
  id_type?: string; id_number?: string; id_document_image?: string
  loyalty_tier: string; loyalty_points: number
  date_of_birth?: string; created_at: string
}

const ID_LABEL: Record<string, string> = {
  passport:        'Passport',
  national_id:     'National ID',
  driving_license: 'Driving License',
  other:           'ID Document',
}

interface GuestForm {
  first_name: string; last_name: string; email: string; phone: string
  nationality: string; id_type: string; id_number: string; date_of_birth: string
  opening_balance: string // what the guest already owed before the system existed
}

const EMPTY: GuestForm = {
  first_name: '', last_name: '', email: '', phone: '',
  nationality: '', id_type: 'passport', id_number: '', date_of_birth: '',
  opening_balance: '',
}

const TIER_BADGE: Record<string, string> = {
  standard: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  silver:   'bg-neutral-200 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-200',
  gold:     'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  platinum: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Guests() {
  const { items: guests, loading, loadingMore, hasMore, loadMore, reload: load, error: loadError } = useLoadMore<Guest>('/hotel/guests', { pageSize: 50 })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode,          setMode]          = useState<null | 'add' | 'edit' | 'loyalty' | 'delete'>(null)
  const [selected,      setSelected]      = useState<Guest | null>(null)
  const [form,          setForm]          = useState<GuestForm>(EMPTY)
  const [loyaltyPts,    setLoyaltyPts]    = useState('')
  const [loyaltyReason, setLoyaltyReason] = useState('')

  // Document upload
  const [docFile,    setDocFile]    = useState<File | null>(null)
  const [docPreview, setDocPreview] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const f = (k: keyof GuestForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocFile(file)
    setDocPreview(URL.createObjectURL(file))
    e.target.value = '' // reset so same file can be re-selected
  }

  const clearDoc = () => {
    setDocFile(null)
    setDocPreview('')
  }

  const fullName = (g: Guest) => `${g.first_name} ${g.last_name}`.trim()

  const openAdd  = ()         => {
    setForm(EMPTY); setSelected(null); setMode('add'); setError('')
    clearDoc()
  }
  const openEdit = (g: Guest) => {
    setForm({
      first_name: g.first_name, last_name: g.last_name,
      email: g.email ?? '', phone: g.phone ?? '',
      nationality: g.nationality ?? '', id_type: g.id_type ?? 'passport',
      id_number: g.id_number ?? '', date_of_birth: g.date_of_birth?.slice(0, 10) ?? '',
      opening_balance: '',
    })
    // Pre-load existing document image
    setDocFile(null)
    setDocPreview(g.id_document_image ?? '')
    setSelected(g); setMode('edit'); setError('')
  }
  const openLoyalty = (g: Guest) => {
    setSelected(g); setLoyaltyPts(''); setLoyaltyReason(''); setMode('loyalty'); setError('')
  }
  const openDelete = (g: Guest) => { setSelected(g); setMode('delete'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError(''); clearDoc() }

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required'); return
    }
    setSaving(true); setError('')
    try {
      // Upload new document image if one was selected
      let imageUrl: string | undefined
      if (docFile) {
        const fd = new FormData()
        fd.append('file', docFile)
        const up = await api.post('/uploads/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        imageUrl = up.data.url
      } else if (docPreview && mode === 'edit') {
        // Keep the existing image URL when editing (no new file chosen)
        imageUrl = docPreview
      }

      const payload = {
        first_name:        form.first_name.trim(),
        last_name:         form.last_name.trim(),
        email:             form.email || undefined,
        phone:             form.phone || undefined,
        nationality:       form.nationality || undefined,
        id_type:           form.id_type || undefined,
        id_number:         form.id_number || undefined,
        id_document_image: imageUrl,
        date_of_birth:     form.date_of_birth || undefined,
        opening_balance:   mode === 'add' ? Number(form.opening_balance) || 0 : undefined,
      }
      if (mode === 'add') {
        await api.post('/hotel/guests', payload)
      } else if (selected) {
        await api.put(`/hotel/guests/${selected.id}`, payload)
      }
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const addLoyalty = async () => {
    if (!selected || !loyaltyPts || !loyaltyReason) { setError('Points and reason are required'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/hotel/guests/${selected.id}/loyalty`, {
        points_change: Number(loyaltyPts),
        reason: loyaltyReason,
        reference_type: 'manual',
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const COLS: DTColumn<Guest>[] = [
    { key: 'first_name', label: 'Guest', exportValue: g => fullName(g), render: g => (
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{fullName(g)}</p>
        <p className="text-[11px] text-neutral-400">{g.email ?? '—'}</p>
      </div>
    )},
    { key: 'phone',       label: 'Phone',       render: g => <span className="text-neutral-500">{g.phone ?? '—'}</span> },
    { key: 'nationality', label: 'Nationality',  render: g => <span className="text-neutral-500">{g.nationality ?? '—'}</span> },
    { key: 'id_number',   label: 'ID',           render: g => (
      <span className="text-[12px] text-neutral-500">
        {g.id_type ? `${g.id_type.replace(/_/g,' ')}: ` : ''}{g.id_number ?? '—'}
      </span>
    )},
    { key: 'loyalty_tier', label: 'VIP', render: g => (
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${TIER_BADGE[g.loyalty_tier] ?? TIER_BADGE.standard}`}>
        {g.loyalty_tier ?? 'standard'}
      </span>
    )},
    { key: 'loyalty_points', label: 'Points', render: g => (
      <div className="flex items-center gap-1.5">
        <Star size={12} className="text-amber-500"/>
        <span className="font-bold text-neutral-700 dark:text-neutral-300">{g.loyalty_points ?? 0}</span>
      </div>
    )},
    { key: '_act', label: '', sortable: false, render: g => (
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={() => openEdit(g)}
          className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-neutral-700 dark:text-neutral-300 transition-colors">
          Edit
        </button>
        <button onClick={() => openLoyalty(g)}
          className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 transition-colors">
          + Points
        </button>
        <button onClick={() => openDelete(g)}
          className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={11}/>
        </button>
      </div>
    )},
  ]

  const vipCount = guests.filter(g => ['gold', 'platinum'].includes(g.loyalty_tier)).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Guests</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {guests.length} registered · {vipCount} VIP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Plus size={15}/> New Guest
          </button>
        </div>
      </div>

      {(error || loadError) && !mode && (
        <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error || loadError}</p>
      )}

      <DataTable columns={COLS} data={guests} title="Guests" filename="guests"
        rowKey={g => g.id} searchPlaceholder="Search name, email, phone…" loading={loading}
        onLoadMore={loadMore} hasMore={hasMore} loadingMore={loadingMore}/>

      {/* Add / Edit */}
      <Modal open={mode === 'add' || mode === 'edit'} onClose={close}
        title={mode === 'add' ? 'New Guest' : `Edit: ${selected ? fullName(selected) : ''}`}
        size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={!form.first_name.trim() || !form.last_name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'add' ? 'Create Guest' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name">
              <input value={form.first_name} onChange={e => f('first_name', e.target.value)}
                placeholder="First name" className={INPUT} autoFocus/>
            </Field>
            <Field label="Last Name">
              <input value={form.last_name} onChange={e => f('last_name', e.target.value)}
                placeholder="Last name" className={INPUT}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                placeholder="guest@email.com" className={INPUT}/>
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={e => f('phone', e.target.value)}
                placeholder="+252 …" className={INPUT}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nationality">
              <input value={form.nationality} onChange={e => f('nationality', e.target.value)}
                placeholder="e.g. Somali" className={INPUT}/>
            </Field>
            <Field label="Date of Birth">
              <DatePicker value={form.date_of_birth} onChange={v => f('date_of_birth', v)} placeholder="Select date of birth"/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ID Type">
              <Select
                value={form.id_type}
                onChange={v => { f('id_type', v); clearDoc() }}
                options={[
                  { value: 'passport',        label: 'Passport' },
                  { value: 'national_id',     label: 'National ID' },
                  { value: 'driving_license', label: 'Driving License' },
                  { value: 'other',           label: 'Other' },
                ]}
              />
            </Field>
            <Field label="ID Number">
              <input value={form.id_number} onChange={e => f('id_number', e.target.value)}
                placeholder="ID / Passport number" className={INPUT}/>
            </Field>
          </div>

          {/* Document image upload — shown whenever an ID type is selected */}
          {form.id_type && (
            <Field label={`${ID_LABEL[form.id_type] ?? 'ID'} Photo`}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              {docPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-neutral-200 dark:border-white/[0.08] bg-neutral-50 dark:bg-white/[0.03]">
                  <img
                    src={docPreview}
                    alt="ID document preview"
                    className="max-h-48 w-full object-contain"
                  />
                  <div className="flex items-center justify-end gap-2 border-t border-neutral-200 dark:border-white/[0.08] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-white/[0.06] dark:text-neutral-300 transition-colors"
                    >
                      <Upload size={12}/> Change
                    </button>
                    <button
                      type="button"
                      onClick={clearDoc}
                      className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"
                    >
                      <X size={12}/> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 py-6 text-center hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/5 transition-colors"
                >
                  <FileImage size={28} className="text-neutral-300 dark:text-neutral-600"/>
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                      Click to upload {ID_LABEL[form.id_type] ?? 'ID'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">JPG, PNG or WebP · Max 5 MB</p>
                  </div>
                </button>
              )}
            </Field>
          )}

          {/* Previous balance — only when adding an existing customer for the first time */}
          {mode === 'add' && (
            <Field label="Previous Balance ($ the guest owes — optional)">
              <input type="number" step="0.01" min="0" value={form.opening_balance}
                onChange={e => f('opening_balance', e.target.value)}
                placeholder="e.g. 200 — debt from before the system" className={INPUT}/>
              {Number(form.opening_balance) > 0 && (
                <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  An unpaid opening invoice of ${Number(form.opening_balance).toFixed(2)} will be created —
                  collect it later via Finance → Receipts → Record Payment.
                </p>
              )}
            </Field>
          )}
        </div>
      </Modal>

      {/* Loyalty Points */}
      <Modal open={mode === 'loyalty'} onClose={close}
        title={`Loyalty Points — ${selected ? fullName(selected) : ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={addLoyalty} disabled={!loyaltyPts || !loyaltyReason || saving}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Add Points
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500"/>
              <p className="text-[14px] font-bold text-amber-800 dark:text-amber-300">
                Current: {selected?.loyalty_points ?? 0} pts
              </p>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${TIER_BADGE[selected?.loyalty_tier ?? 'standard'] ?? ''}`}>
                {selected?.loyalty_tier ?? 'standard'}
              </span>
            </div>
          </div>
          <Field label="Points (use negative to deduct)">
            <input type="number" value={loyaltyPts} onChange={e => setLoyaltyPts(e.target.value)}
              placeholder="e.g. 100" className={INPUT}/>
          </Field>
          <Field label="Reason">
            <input value={loyaltyReason} onChange={e => setLoyaltyReason(e.target.value)}
              placeholder="e.g. Stay bonus, birthday reward…" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={mode === 'delete'} onClose={close} title="Delete Guest" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={async () => {
            if (!selected) return
            setSaving(true)
            try {
              await api.delete(`/hotel/guests/${selected.id}`)
              close(); load()
            } catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
          }} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selected ? fullName(selected) : ''}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  )
}
