import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, RefreshCw, Building2, TrendingUp, Boxes, Eraser, CalendarCheck,
  PieChart, Save, Lock, Trash2, ArrowLeftRight, Landmark, Users as UsersIcon,
  ImagePlus, X, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { Tabs } from '@/components/ui/Tabs'
import { ImageThumb } from '@/components/ui/ImageThumb'
import ImageModal from '@/components/ui/ImageModal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

// ─── Types ────────────────────────────────────────────────────────────────────

interface Organization {
  id: string; name: string; legal_name?: string; tax_id?: string
  default_timezone?: string; phone?: string; email?: string
  logo_url?: string; banner_url?: string
  created_at: string; branch_count: string; user_count: string
}

interface Account {
  id: string; account_type: string; name: string; institution?: string
  is_active: boolean; balance?: number
}

interface Asset {
  id: string; asset_type: string; asset_category: string; name: string
  description?: string; purchase_date?: string; purchase_cost: string
  current_value: string; depreciation_rate?: string
  serial_number?: string; location?: string; is_active: boolean
}

interface FiscalYear {
  id: string; name: string; start_date: string; end_date: string
  is_closed: boolean; closed_at?: string
}

interface ProfitShare {
  id: string; partner_name: string; share_percent: string; amount: string
  share_date: string; period_note?: string; notes?: string; account_name?: string
}

const ASSET_TYPES = [
  { value: 'current',     label: 'Current Asset' },
  { value: 'non_current', label: 'Non-Current (Fixed)' },
  { value: 'intangible',  label: 'Intangible' },
]

function todayISO() {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`
}

// ─── Forms ────────────────────────────────────────────────────────────────────

interface OrgForm { name: string; legal_name: string; tax_id: string; phone: string; email: string; default_timezone: string; vat_rate: string; logo_url: string; banner_url: string }

interface CapitalForm { name: string; institution: string; notes: string; opening_balance: string }
const EMPTY_CAPITAL: CapitalForm = { name: '', institution: '', notes: '', opening_balance: '' }

interface AssetForm {
  asset_type: string; asset_category: string; name: string; description: string
  purchase_date: string; purchase_cost: string; current_value: string
  depreciation_rate: string; serial_number: string; location: string
}
const EMPTY_ASSET = (): AssetForm => ({
  asset_type: 'non_current', asset_category: '', name: '', description: '',
  purchase_date: todayISO(), purchase_cost: '', current_value: '',
  depreciation_rate: '0', serial_number: '', location: '',
})

interface FYForm { name: string; start_date: string; end_date: string }
const EMPTY_FY = (): FYForm => {
  const y = new Date().getFullYear()
  return { name: `FY ${y}`, start_date: `${y}-01-01`, end_date: `${y}-12-31` }
}

interface ShareForm { partner_name: string; share_percent: string; amount: string; share_date: string; account_id: string; period_note: string; notes: string }
const EMPTY_SHARE = (): ShareForm => ({ partner_name: '', share_percent: '', amount: '', share_date: todayISO(), account_id: '', period_note: '', notes: '' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Systems() {
  const [tab, setTab] = useState<'company' | 'capital' | 'assets' | 'cleaner' | 'closing' | 'profit'>('company')

  const [org,      setOrg]      = useState<Organization | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [assets,   setAssets]   = useState<Asset[]>([])
  const [years,    setYears]    = useState<FiscalYear[]>([])
  const [shares,   setShares]   = useState<ProfitShare[]>([])

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [okMsg,   setOkMsg]   = useState('')

  const [mode, setMode] = useState<null | 'addCapital' | 'editCapital' | 'deleteCapital' | 'depositCapital' | 'withdrawCapital' | 'addAsset' | 'editAsset' | 'deleteAsset' | 'clear' | 'addFY' | 'closeFY' | 'addShare' | 'deleteShare'>(null)
  const [clearAccount, setClearAccount] = useState<Account | null>(null)
  const [clearTarget,  setClearTarget]  = useState('')
  const [fyToClose,    setFyToClose]    = useState<FiscalYear | null>(null)
  const [shareToDelete, setShareToDelete] = useState<ProfitShare | null>(null)
  const [assetToEdit, setAssetToEdit] = useState<Asset | null>(null)
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null)
  const [capitalToEdit, setCapitalToEdit] = useState<Account | null>(null)
  const [capitalToDelete, setCapitalToDelete] = useState<Account | null>(null)
  const [capitalTxTarget, setCapitalTxTarget] = useState<Account | null>(null)

  const [orgForm,     setOrgForm]     = useState<OrgForm>({ name: '', legal_name: '', tax_id: '', phone: '', email: '', default_timezone: '', vat_rate: '', logo_url: '', banner_url: '' })
  const [capitalForm, setCapitalForm] = useState<CapitalForm>(EMPTY_CAPITAL)
  const [capitalTxAccountId, setCapitalTxAccountId] = useState('')
  const [capitalTxAmount,    setCapitalTxAmount]    = useState('')
  const [capitalTxDesc,      setCapitalTxDesc]      = useState('')

  // Company Info — logo / banner upload
  const [logoFile,     setLogoFile]     = useState<File | null>(null)
  const [logoPreview,  setLogoPreview]  = useState('')
  const [bannerFile,   setBannerFile]   = useState<File | null>(null)
  const [bannerPreview,setBannerPreview]= useState('')
  const [viewImage,    setViewImage]    = useState<string | null>(null)
  const logoRef   = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [assetForm,   setAssetForm]   = useState<AssetForm>(EMPTY_ASSET)
  const [fyForm,      setFyForm]      = useState<FYForm>(EMPTY_FY)
  const [shareForm,   setShareForm]   = useState<ShareForm>(EMPTY_SHARE)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [oRes, aRes, bRes, asRes, fRes, pRes] = await Promise.all([
        api.get('/system/organization'),
        api.get('/accounting/accounts'),
        api.get('/accounting/accounts/balances'),
        api.get('/accounting/assets'),
        api.get('/system/fiscal-years'),
        api.get('/accounting/profit-sharing'),
      ])
      const o: Organization = oRes.data.data
      setOrg(o)
      setOrgForm({
        name: o.name ?? '', legal_name: o.legal_name ?? '', tax_id: o.tax_id ?? '',
        phone: o.phone ?? '', email: o.email ?? '', default_timezone: o.default_timezone ?? '',
        vat_rate: (o as Organization & { vat_rate?: string }).vat_rate ?? '',
        logo_url: o.logo_url ?? '', banner_url: o.banner_url ?? '',
      })
      setLogoFile(null); setLogoPreview(o.logo_url ?? '')
      setBannerFile(null); setBannerPreview(o.banner_url ?? '')
      const balMap = new Map<string, number>(
        (bRes.data.data as { id: string; balance: string }[]).map(b => [b.id, Number(b.balance)])
      )
      setAccounts((aRes.data.data as Account[]).map(a => ({ ...a, balance: balMap.get(a.id) ?? 0 })))
      setAssets(asRes.data.data)
      setYears(fRes.data.data)
      setShares(pRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const close = () => {
    setMode(null); setClearAccount(null); setFyToClose(null); setShareToDelete(null)
    setAssetToEdit(null); setAssetToDelete(null); setCapitalToEdit(null); setCapitalToDelete(null)
    setCapitalTxTarget(null); setCapitalTxAccountId(''); setCapitalTxAmount(''); setCapitalTxDesc(''); setError('')
  }

  // ── Company info ────────────────────────────────────────────────────────────

  const pickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Unsupported image format — please use JPG, PNG, or WebP.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('Image is too large — please use a file under 15MB.'); return }
    setError('')
    setLogoFile(file); setLogoPreview(URL.createObjectURL(file))
  }
  const pickBanner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Unsupported image format — please use JPG, PNG, or WebP.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('Image is too large — please use a file under 15MB.'); return }
    setError('')
    setBannerFile(file); setBannerPreview(URL.createObjectURL(file))
  }
  const uploadIfNeeded = async (file: File | null): Promise<string | undefined> => {
    if (!file) return undefined
    const fd = new FormData()
    fd.append('file', file)
    const up = await api.post('/upload/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    return up.data.url
  }

  const saveOrg = async () => {
    if (!orgForm.name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError(''); setOkMsg('')
    try {
      const [logo_url, banner_url] = await Promise.all([uploadIfNeeded(logoFile), uploadIfNeeded(bannerFile)])
      await api.put('/system/organization', {
        name:             orgForm.name.trim(),
        legal_name:       orgForm.legal_name || undefined,
        tax_id:           orgForm.tax_id || undefined,
        phone:            orgForm.phone || undefined,
        email:            orgForm.email || undefined,
        default_timezone: orgForm.default_timezone || undefined,
        vat_rate:         orgForm.vat_rate !== '' ? Number(orgForm.vat_rate) : undefined,
        logo_url, banner_url,
      })
      setOkMsg('Company info saved'); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Capital ─────────────────────────────────────────────────────────────────

  const equityAccounts = accounts.filter(a => a.account_type === 'equity')
  const totalCapital   = equityAccounts.reduce((s, a) => s + Number(a.balance ?? 0), 0)

  const openEditCapital = (a: Account) => {
    setCapitalToEdit(a)
    setCapitalForm({ name: a.name, institution: a.institution ?? '', notes: '', opening_balance: '' })
    setMode('editCapital'); setError('')
  }
  const openDeleteCapital = (a: Account) => { setCapitalToDelete(a); setMode('deleteCapital'); setError('') }

  const saveCapital = async () => {
    if (!capitalForm.name.trim()) { setError('Capital account name is required'); return }
    setSaving(true); setError('')
    try {
      const payload: Record<string, unknown> = {
        account_type: 'equity',
        name:         capitalForm.name.trim(),
        institution:  capitalForm.institution || undefined,
        notes:        capitalForm.notes || undefined,
      }
      if (mode === 'editCapital' && capitalToEdit) {
        await api.put(`/accounting/accounts/${capitalToEdit.id}`, payload)
      } else {
        // Capital is credit-normal — an opening contribution is recorded as
        // balance_type 'credit', matching how the app already displays
        // equity (negative = capital contributed by the owner).
        payload.opening_balance = Number(capitalForm.opening_balance) || 0
        payload.balance_type = 'credit'
        await api.post('/accounting/accounts', payload)
      }
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDeleteCapital = async () => {
    if (!capitalToDelete) return
    setSaving(true); setError('')
    try { await api.delete(`/accounting/accounts/${capitalToDelete.id}`); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // Deposit / Withdraw — the owner adding or taking out capital, using the
  // same account_transfer machinery as Accounts → Account Transfers (so the
  // existing insufficient-balance check applies to withdrawals for free).
  // Deposit: money flows capital → cash (capital's balance moves further
  // negative — more credit/contribution recorded — cash goes up).
  // Withdraw: cash → capital (reverses it — cash goes down, capital's
  // balance moves back toward zero as the owner takes money back out).
  const cashAccounts = accounts.filter(a => a.account_type !== 'equity' && a.is_active)
  const cashAccountOptions = cashAccounts.map(a => ({
    value: a.id, label: `${a.name} (${a.account_type.replace(/_/g,' ')} · $${Number(a.balance ?? 0).toFixed(2)})`,
  }))

  const openDepositCapital = (a: Account) => {
    setCapitalTxTarget(a); setCapitalTxAccountId(cashAccounts[0]?.id ?? '')
    setCapitalTxAmount(''); setCapitalTxDesc(''); setMode('depositCapital'); setError('')
  }
  const openWithdrawCapital = (a: Account) => {
    setCapitalTxTarget(a); setCapitalTxAccountId(cashAccounts[0]?.id ?? '')
    setCapitalTxAmount(''); setCapitalTxDesc(''); setMode('withdrawCapital'); setError('')
  }

  const saveCapitalTx = async () => {
    if (!capitalTxTarget || !capitalTxAccountId || !capitalTxAmount) { setError('Account and amount are required'); return }
    setSaving(true); setError('')
    try {
      const isDeposit = mode === 'depositCapital'
      await api.post('/accounting/transfers', {
        from_account_id: isDeposit ? capitalTxTarget.id : capitalTxAccountId,
        to_account_id:   isDeposit ? capitalTxAccountId : capitalTxTarget.id,
        amount: Number(capitalTxAmount),
        transfer_date: new Date().toISOString().slice(0,10),
        description: capitalTxDesc || (isDeposit ? `Capital contribution — ${capitalTxTarget.name}` : `Capital withdrawal — ${capitalTxTarget.name}`),
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Assets ──────────────────────────────────────────────────────────────────

  const openEditAsset = (a: Asset) => {
    setAssetToEdit(a)
    setAssetForm({
      asset_type: a.asset_type, asset_category: a.asset_category, name: a.name, description: a.description ?? '',
      purchase_date: a.purchase_date?.slice(0,10) ?? todayISO(), purchase_cost: String(a.purchase_cost ?? ''),
      current_value: String(a.current_value ?? ''), depreciation_rate: String(a.depreciation_rate ?? 0),
      serial_number: a.serial_number ?? '', location: a.location ?? '',
    })
    setMode('editAsset'); setError('')
  }
  const openDeleteAsset = (a: Asset) => { setAssetToDelete(a); setMode('deleteAsset'); setError('') }

  const saveAsset = async () => {
    if (!assetForm.name.trim() || !assetForm.asset_category.trim()) { setError('Name and category are required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        asset_type:        assetForm.asset_type,
        asset_category:    assetForm.asset_category.trim(),
        name:              assetForm.name.trim(),
        description:       assetForm.description || undefined,
        purchase_date:     assetForm.purchase_date || undefined,
        purchase_cost:     Number(assetForm.purchase_cost) || 0,
        current_value:     Number(assetForm.current_value || assetForm.purchase_cost) || 0,
        depreciation_rate: Number(assetForm.depreciation_rate) || 0,
        serial_number:     assetForm.serial_number || undefined,
        location:          assetForm.location || undefined,
      }
      if (mode === 'editAsset' && assetToEdit) await api.patch('/accounting/assets/' + assetToEdit.id, payload)
      else await api.post('/accounting/assets', payload)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDeleteAsset = async () => {
    if (!assetToDelete) return
    setSaving(true); setError('')
    try {
      await api.delete(`/accounting/assets/${assetToDelete.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Account cleaner ─────────────────────────────────────────────────────────

  const openClear = (a: Account) => { setClearAccount(a); setClearTarget(''); setMode('clear'); setError('') }

  const doClear = async () => {
    if (!clearAccount || !clearTarget) { setError('Choose a destination account'); return }
    const bal = Number(clearAccount.balance ?? 0)
    if (bal === 0) { close(); return }
    setSaving(true); setError('')
    try {
      // Positive balance → move out of the account; negative → top it up back to zero
      await api.post('/accounting/transfers', {
        from_account_id: bal > 0 ? clearAccount.id : clearTarget,
        to_account_id:   bal > 0 ? clearTarget : clearAccount.id,
        amount:          Math.abs(bal),
        transfer_date:   todayISO(),
        description:     `Account clearance: ${clearAccount.name}`,
        reference:       'CLEAR',
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Closing period ──────────────────────────────────────────────────────────

  const saveFY = async () => {
    if (!fyForm.name.trim() || !fyForm.start_date || !fyForm.end_date) { setError('All fields are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/system/fiscal-years', fyForm)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doCloseFY = async () => {
    if (!fyToClose) return
    setSaving(true); setError('')
    try {
      await api.patch(`/system/fiscal-years/${fyToClose.id}/close`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Profit sharing ──────────────────────────────────────────────────────────

  const saveShare = async () => {
    if (!shareForm.partner_name.trim() || !shareForm.amount) { setError('Partner name and amount are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/accounting/profit-sharing', {
        partner_name:  shareForm.partner_name.trim(),
        share_percent: Number(shareForm.share_percent) || 0,
        amount:        Number(shareForm.amount),
        share_date:    shareForm.share_date,
        account_id:    shareForm.account_id || undefined,
        period_note:   shareForm.period_note || undefined,
        notes:         shareForm.notes || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDeleteShare = async () => {
    if (!shareToDelete) return
    setSaving(true)
    try {
      await api.delete(`/accounting/profit-sharing/${shareToDelete.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Columns ─────────────────────────────────────────────────────────────────

  const CAPITAL_COLS: DTColumn<Account>[] = [
    { key:'name', label:'Capital Account', render:a=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400">
          <TrendingUp size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{a.name}</p>
          <p className="text-[11px] text-neutral-400">{a.institution ?? '—'}</p>
        </div>
      </div>
    )},
    { key:'balance', label:'Balance', render:a=>(
      <span className="font-extrabold text-neutral-800 dark:text-white">${Number(a.balance ?? 0).toFixed(2)}</span>
    ), exportValue:a=>a.balance ?? 0 },
    { key:'is_active', label:'Status', render:a=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        a.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}>{a.is_active ? 'Active' : 'Inactive'}</span>
    )},
    { key:'_act', label:'', sortable:false, render:a=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openDepositCapital(a)} title="Deposit — owner adds money"
          className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400"><ArrowDownCircle size={12}/></button>
        <button onClick={()=>openWithdrawCapital(a)} title="Withdraw — owner takes money out"
          className="rounded-lg bg-amber-50 px-2 py-1 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400"><ArrowUpCircle size={12}/></button>
        <button onClick={()=>openEditCapital(a)} className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"><Save size={12}/></button>
        <button onClick={()=>openDeleteCapital(a)} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
      </div>
    )},
  ]

  const ASSET_COLS: DTColumn<Asset>[] = [
    { key:'name', label:'Asset', render:a=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400">
          <Boxes size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{a.name}</p>
          <p className="text-[11px] text-neutral-400">{a.serial_number ?? a.location ?? '—'}</p>
        </div>
      </div>
    )},
    { key:'asset_type', label:'Type', render:a=>(
      <span className="capitalize text-neutral-500 dark:text-neutral-400">{a.asset_type.replace(/_/g,' ')}</span>
    )},
    { key:'asset_category', label:'Category', render:a=><span className="capitalize text-neutral-500 dark:text-neutral-400">{a.asset_category}</span> },
    { key:'purchase_date', label:'Purchased', render:a=><span className="text-neutral-500 dark:text-neutral-400">{a.purchase_date?.slice(0,10) ?? '—'}</span> },
    { key:'purchase_cost', label:'Cost', render:a=><span className="text-neutral-600 dark:text-neutral-300">${Number(a.purchase_cost).toFixed(2)}</span>, exportValue:a=>a.purchase_cost },
    { key:'current_value', label:'Current Value', render:a=><span className="font-extrabold text-neutral-800 dark:text-white">${Number(a.current_value).toFixed(2)}</span>, exportValue:a=>a.current_value },
    { key:'depreciation_rate', label:'Depr. %', render:a=><span className="text-neutral-500 dark:text-neutral-400">{Number(a.depreciation_rate ?? 0)}%</span> },
    { key:'_act', label:'', sortable:false, render:a=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEditAsset(a)} className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"><Save size={12}/></button>
        <button onClick={()=>openDeleteAsset(a)} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 size={12}/></button>
      </div>
    )},
  ]

  const CLEANER_COLS: DTColumn<Account>[] = [
    { key:'name', label:'Account', render:a=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 dark:text-neutral-400">
          <Landmark size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{a.name}</p>
          <p className="text-[11px] capitalize text-neutral-400">{a.account_type.replace(/_/g,' ')}</p>
        </div>
      </div>
    )},
    { key:'balance', label:'Balance', render:a=>{
      const b = Number(a.balance ?? 0)
      return <span className={`font-extrabold ${b === 0 ? 'text-neutral-400' : b < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-800 dark:text-white'}`}>
        ${b.toFixed(2)}
      </span>
    }, exportValue:a=>a.balance ?? 0 },
    { key:'_state', label:'State', sortable:false, render:a=>(
      Number(a.balance ?? 0) === 0
        ? <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Clean</span>
        : <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Has balance</span>
    )},
    { key:'_act', label:'', sortable:false, render:a=>(
      Number(a.balance ?? 0) !== 0
        ? <button onClick={()=>openClear(a)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 transition-colors">
            <Eraser size={11}/> Clear
          </button>
        : null
    )},
  ]

  const FY_COLS: DTColumn<FiscalYear>[] = [
    { key:'name', label:'Period', render:f=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400">
          <CalendarCheck size={14}/>
        </div>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{f.name}</span>
      </div>
    )},
    { key:'start_date', label:'From', render:f=><span className="text-neutral-500 dark:text-neutral-400">{f.start_date?.slice(0,10)}</span> },
    { key:'end_date',   label:'To',   render:f=><span className="text-neutral-500 dark:text-neutral-400">{f.end_date?.slice(0,10)}</span> },
    { key:'is_closed', label:'Status', render:f=>(
      f.is_closed
        ? <span className="flex w-fit items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
            <Lock size={11}/> Closed {f.closed_at ? new Date(f.closed_at).toLocaleDateString() : ''}
          </span>
        : <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Open</span>
    )},
    { key:'_act', label:'', sortable:false, render:f=>(
      !f.is_closed
        ? <button onClick={()=>{ setFyToClose(f); setMode('closeFY'); setError('') }}
            className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
            <Lock size={11}/> Close Period
          </button>
        : null
    )},
  ]

  const SHARE_COLS: DTColumn<ProfitShare>[] = [
    { key:'share_date', label:'Date', render:s=><span className="text-neutral-500 dark:text-neutral-400">{s.share_date?.slice(0,10)}</span> },
    { key:'partner_name', label:'Partner', render:s=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <PieChart size={14}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{s.partner_name}</p>
          <p className="text-[11px] text-neutral-400">{s.period_note ?? '—'}</p>
        </div>
      </div>
    )},
    { key:'share_percent', label:'Share %', render:s=>(
      <span className="font-bold text-neutral-700 dark:text-neutral-300">{Number(s.share_percent) > 0 ? `${Number(s.share_percent)}%` : '—'}</span>
    ), exportValue:s=>s.share_percent },
    { key:'amount', label:'Amount', render:s=><span className="font-extrabold text-rose-600 dark:text-rose-400">−${Number(s.amount).toFixed(2)}</span>, exportValue:s=>s.amount },
    { key:'account_name', label:'Paid From', render:s=><span className="text-neutral-500 dark:text-neutral-400">{s.account_name ?? '—'}</span> },
    { key:'notes', label:'Notes', render:s=><span className="text-[12px] text-neutral-400">{s.notes ?? '—'}</span> },
    { key:'_act', label:'', sortable:false, render:s=>(
      <button onClick={()=>{ setShareToDelete(s); setMode('deleteShare'); setError('') }}
        className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
        <Trash2 size={12}/>
      </button>
    )},
  ]

  const moneyAccounts = accounts.filter(a => a.is_active)
  const accountOptions = moneyAccounts.map(a => ({
    value: a.id,
    label: `${a.name} (${a.account_type.replace(/_/g,' ')} · $${Number(a.balance ?? 0).toFixed(2)})`,
  }))

  const totalAssets = assets.filter(a=>a.is_active).reduce((s, a) => s + Number(a.current_value), 0)

  const headerAction =
    tab === 'capital' ? (
      <button onClick={() => { setCapitalForm(EMPTY_CAPITAL); setMode('addCapital'); setError('') }}
        className="flex items-center gap-2 rounded-xl bg-neutral-800 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-neutral-900 dark:bg-white/10 dark:hover:bg-white/20 transition-colors">
        <Plus size={15}/> New Capital Account
      </button>
    ) : tab === 'assets' ? (
      <button onClick={() => { setAssetForm(EMPTY_ASSET()); setMode('addAsset'); setError('') }}
        className="flex items-center gap-2 rounded-xl bg-neutral-800 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-neutral-900 dark:bg-white/10 dark:hover:bg-white/20 transition-colors">
        <Plus size={15}/> New Asset
      </button>
    ) : tab === 'closing' ? (
      <button onClick={() => { setFyForm(EMPTY_FY()); setMode('addFY'); setError('') }}
        className="flex items-center gap-2 rounded-xl bg-neutral-800 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-neutral-900 dark:bg-white/10 dark:hover:bg-white/20 transition-colors">
        <Plus size={15}/> New Fiscal Year
      </button>
    ) : tab === 'profit' ? (
      <button onClick={() => { setShareForm(EMPTY_SHARE()); setMode('addShare'); setError('') }}
        className="flex items-center gap-2 rounded-xl bg-neutral-800 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-neutral-900 dark:bg-white/10 dark:hover:bg-white/20 transition-colors">
        <Plus size={15}/> New Profit Share
      </button>
    ) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Systems</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            Capital <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400">${totalCapital.toFixed(2)}</span>
            {' '}· Assets <span className="font-bold text-cyan-600 dark:text-cyan-400">${totalAssets.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          {headerAction}
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <Tabs
        active={tab}
        onChange={k => { setTab(k as typeof tab); setOkMsg('') }}
        tabs={[
          { key: 'company', label: 'Company Info',    icon: <Building2 size={14}/> },
          { key: 'capital', label: 'Capital',         icon: <TrendingUp size={14}/>,    count: equityAccounts.length },
          { key: 'assets',  label: 'Assets',          icon: <Boxes size={14}/>,         count: assets.length },
          { key: 'cleaner', label: 'Account Cleaner', icon: <Eraser size={14}/> },
          { key: 'closing', label: 'Closing Period',  icon: <CalendarCheck size={14}/>, count: years.length },
          { key: 'profit',  label: 'Profit Sharing',  icon: <PieChart size={14}/>,      count: shares.length },
        ]}
      />

      {/* ── Company Info ────────────────────────────────────────────────── */}
      {tab === 'company' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
            <h2 className="mb-5 text-[15px] font-extrabold text-neutral-900 dark:text-white">Company Information</h2>
            {okMsg && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{okMsg}</p>}
            {error  && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company Name">
                  <input value={orgForm.name} onChange={e=>setOrgForm(p=>({...p, name: e.target.value}))} className={INPUT}/>
                </Field>
                <Field label="Legal Name">
                  <input value={orgForm.legal_name} onChange={e=>setOrgForm(p=>({...p, legal_name: e.target.value}))} className={INPUT}/>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tax ID (TIN)">
                  <input value={orgForm.tax_id} onChange={e=>setOrgForm(p=>({...p, tax_id: e.target.value}))} className={INPUT}/>
                </Field>
                <Field label="Timezone">
                  <input value={orgForm.default_timezone} onChange={e=>setOrgForm(p=>({...p, default_timezone: e.target.value}))}
                    placeholder="Africa/Mogadishu" className={INPUT}/>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input value={orgForm.phone} onChange={e=>setOrgForm(p=>({...p, phone: e.target.value}))} className={INPUT}/>
                </Field>
                <Field label="Email">
                  <input type="email" value={orgForm.email} onChange={e=>setOrgForm(p=>({...p, email: e.target.value}))} className={INPUT}/>
                </Field>
              </div>
              <Field label="VAT Rate (%)">
                <input type="number" min="0" max="100" step="0.5" value={orgForm.vat_rate}
                  onChange={e=>setOrgForm(p=>({...p, vat_rate: e.target.value}))}
                  placeholder="e.g. 5" className={INPUT}/>
              </Field>
              <p className="-mt-2 text-[11.5px] text-neutral-400">
                Applied automatically when restaurant orders are billed, and shown as a VAT line on every
                receipt and invoice. Set 0 to disable VAT.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Logo">
                  <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo} className="hidden"/>
                  {logoPreview ? (
                    <div className="flex items-center gap-3">
                      <ImageThumb src={logoPreview} className="h-16 w-16 rounded-2xl border border-neutral-200 dark:border-white/[0.08]" onClick={()=>setViewImage(logoPreview)}/>
                      <div className="flex gap-2">
                        <button type="button" onClick={()=>logoRef.current?.click()} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors">Change</button>
                        <button type="button" onClick={()=>{ setLogoFile(null); setLogoPreview('') }} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><X size={13}/></button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={()=>logoRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-[12px] font-semibold text-neutral-500 hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-neutral-400 transition-colors">
                      <ImagePlus size={16}/> Upload logo
                    </button>
                  )}
                </Field>
                <Field label="Banner">
                  <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickBanner} className="hidden"/>
                  {bannerPreview ? (
                    <div className="flex items-center gap-3">
                      <ImageThumb src={bannerPreview} className="h-16 w-28 rounded-xl border border-neutral-200 dark:border-white/[0.08]" onClick={()=>setViewImage(bannerPreview)}/>
                      <div className="flex gap-2">
                        <button type="button" onClick={()=>bannerRef.current?.click()} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors">Change</button>
                        <button type="button" onClick={()=>{ setBannerFile(null); setBannerPreview('') }} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><X size={13}/></button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={()=>bannerRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-[12px] font-semibold text-neutral-500 hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-neutral-400 transition-colors">
                      <ImagePlus size={16}/> Upload banner
                    </button>
                  )}
                </Field>
              </div>
              <p className="-mt-2 text-[11.5px] text-neutral-400">
                Logo shows in the sidebar and on printed receipts/invoices; banner is used on the login screen. JPG, PNG or WebP, max 15MB — automatically optimized.
              </p>

              <button onClick={saveOrg} disabled={saving || !orgForm.name.trim()}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {saving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>} Save Changes
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { icon: <Building2 size={16}/>, label: 'Branches', value: org?.branch_count ?? '—', color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400' },
              { icon: <UsersIcon size={16}/>, label: 'Users',    value: org?.user_count ?? '—',   color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
              { icon: <CalendarCheck size={16}/>, label: 'Registered', value: org?.created_at?.slice(0,10) ?? '—', color: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.color}`}>{s.icon}</span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{s.label}</p>
                  <p className="text-[18px] font-extrabold text-neutral-900 dark:text-white">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'capital' && (
        <DataTable columns={CAPITAL_COLS} data={equityAccounts} title="Capital" filename="capital"
          rowKey={a=>a.id} searchPlaceholder="Search capital accounts…" loading={loading}/>
      )}
      {tab === 'assets' && (
        <DataTable columns={ASSET_COLS} data={assets} title="Assets" filename="assets"
          rowKey={a=>a.id} searchPlaceholder="Search asset, category…" loading={loading}/>
      )}
      {tab === 'cleaner' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-2xl border border-sky-100 bg-sky-50 p-4 dark:border-sky-500/20 dark:bg-sky-500/10">
            <Eraser size={15} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400"/>
            <p className="text-[12.5px] text-sky-700 dark:text-sky-300">
              <b>Account Cleaner</b> settles an account to zero by transferring its remaining balance to another
              account (e.g. before closing a period). Every clearance is recorded as a normal account transfer.
            </p>
          </div>
          <DataTable columns={CLEANER_COLS} data={moneyAccounts} title="Account Cleaner" filename="account_cleaner"
            rowKey={a=>a.id} searchPlaceholder="Search accounts…" loading={loading}/>
        </div>
      )}
      {tab === 'closing' && (
        <DataTable columns={FY_COLS} data={years} title="Closing Periods" filename="fiscal_years"
          rowKey={f=>f.id} searchPlaceholder="Search periods…" loading={loading}/>
      )}
      {tab === 'profit' && (
        <DataTable columns={SHARE_COLS} data={shares} title="Profit Sharing" filename="profit_sharing"
          rowKey={s=>s.id} searchPlaceholder="Search partner…" loading={loading}/>
      )}

      {/* ── New / Edit Capital Account ──────────────────────────────────── */}
      <Modal open={mode === 'addCapital' || mode === 'editCapital'} onClose={close}
        title={mode === 'editCapital' ? `Edit: ${capitalToEdit?.name ?? ''}` : 'New Capital Account'} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveCapital} disabled={!capitalForm.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editCapital' ? 'Save Changes' : 'Create'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Capital / Owner Name">
            <input value={capitalForm.name} onChange={e=>setCapitalForm(p=>({...p, name: e.target.value}))}
              placeholder="e.g. Owner Capital — Ahmed" className={INPUT} autoFocus/>
          </Field>
          <Field label="Institution (optional)">
            <input value={capitalForm.institution} onChange={e=>setCapitalForm(p=>({...p, institution: e.target.value}))}
              placeholder="—" className={INPUT}/>
          </Field>
          <Field label="Notes (optional)">
            <input value={capitalForm.notes} onChange={e=>setCapitalForm(p=>({...p, notes: e.target.value}))}
              placeholder="Notes…" className={INPUT}/>
          </Field>
          {mode === 'addCapital' && (
            <Field label="Opening Contribution ($, optional)">
              <input type="number" min="0" step="0.01" value={capitalForm.opening_balance}
                onChange={e=>setCapitalForm(p=>({...p, opening_balance: e.target.value}))}
                placeholder="0.00 — how much the owner has already put in" className={INPUT}/>
            </Field>
          )}
          <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
            <p className="text-[12px] text-sky-700 dark:text-sky-300">
              Use the <b>Deposit</b> and <b>Withdraw</b> buttons on each capital account to record the owner adding or taking out money later.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── New Asset ───────────────────────────────────────────────────── */}
      <Modal open={mode === 'addAsset' || mode === 'editAsset'} onClose={close} title={mode === 'editAsset' ? `Edit: ${assetToEdit?.name ?? ''}` : 'New Asset'} size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveAsset} disabled={!assetForm.name.trim() || !assetForm.asset_category.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editAsset' ? 'Save Changes' : 'Create Asset'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asset Name">
              <input value={assetForm.name} onChange={e=>setAssetForm(p=>({...p, name: e.target.value}))}
                placeholder="e.g. Toyota Hiace, Generator" className={INPUT} autoFocus/>
            </Field>
            <Field label="Category">
              <input value={assetForm.asset_category} onChange={e=>setAssetForm(p=>({...p, asset_category: e.target.value}))}
                placeholder="e.g. vehicle, equipment, furniture" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asset Type">
              <Select value={assetForm.asset_type} onChange={v=>setAssetForm(p=>({...p, asset_type: v}))} options={ASSET_TYPES}/>
            </Field>
            <Field label="Purchase Date">
              <DatePicker value={assetForm.purchase_date} onChange={v=>setAssetForm(p=>({...p, purchase_date: v}))}/>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Purchase Cost ($)">
              <input type="number" step="0.01" min="0" value={assetForm.purchase_cost}
                onChange={e=>setAssetForm(p=>({...p, purchase_cost: e.target.value}))} placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Current Value ($)">
              <input type="number" step="0.01" min="0" value={assetForm.current_value}
                onChange={e=>setAssetForm(p=>({...p, current_value: e.target.value}))} placeholder="= cost" className={INPUT}/>
            </Field>
            <Field label="Depreciation % / yr">
              <input type="number" step="0.1" min="0" value={assetForm.depreciation_rate}
                onChange={e=>setAssetForm(p=>({...p, depreciation_rate: e.target.value}))} placeholder="0" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serial Number (optional)">
              <input value={assetForm.serial_number} onChange={e=>setAssetForm(p=>({...p, serial_number: e.target.value}))}
                placeholder="SN…" className={INPUT}/>
            </Field>
            <Field label="Location (optional)">
              <input value={assetForm.location} onChange={e=>setAssetForm(p=>({...p, location: e.target.value}))}
                placeholder="e.g. Main Branch" className={INPUT}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── Clear Account ───────────────────────────────────────────────── */}
      <Modal open={mode === 'clear'} onClose={close}
        title={`Clear — ${clearAccount?.name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doClear} disabled={!clearTarget || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <ArrowLeftRight size={13}/>} Clear to Zero
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
            <p className="text-[13px] font-bold text-amber-800 dark:text-amber-300">
              {clearAccount?.name} — balance ${Number(clearAccount?.balance ?? 0).toFixed(2)}
            </p>
            <p className="mt-0.5 text-[12px] text-amber-600 dark:text-amber-400">
              {Number(clearAccount?.balance ?? 0) > 0
                ? 'The full balance will be transferred OUT to the account you choose.'
                : 'The shortfall will be topped up FROM the account you choose to bring this account to zero.'}
            </p>
          </div>
          <Field label={Number(clearAccount?.balance ?? 0) > 0 ? 'Transfer Balance To' : 'Top Up From'}>
            <Select value={clearTarget} onChange={setClearTarget}
              placeholder="— Select account —"
              options={accountOptions.filter(o => o.value !== clearAccount?.id)}/>
          </Field>
        </div>
      </Modal>

      {/* ── New Fiscal Year ─────────────────────────────────────────────── */}
      <Modal open={mode === 'addFY'} onClose={close} title="New Fiscal Year" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveFY} disabled={!fyForm.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Create
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Period Name">
            <input value={fyForm.name} onChange={e=>setFyForm(p=>({...p, name: e.target.value}))}
              placeholder="e.g. FY 2026" className={INPUT} autoFocus/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <DatePicker value={fyForm.start_date} onChange={v=>setFyForm(p=>({...p, start_date: v}))}/>
            </Field>
            <Field label="End Date">
              <DatePicker value={fyForm.end_date} onChange={v=>setFyForm(p=>({...p, end_date: v}))}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── Close Fiscal Year ───────────────────────────────────────────── */}
      <Modal open={mode === 'closeFY'} onClose={close} title="Close Period" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doCloseFY} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Lock size={13}/>} Close Period
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Close {fyToClose?.name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">
            {fyToClose?.start_date?.slice(0,10)} → {fyToClose?.end_date?.slice(0,10)}
          </p>
          <p className="mt-2 text-[12px] text-rose-500">A closed period cannot be reopened.</p>
        </div>
      </Modal>

      {/* ── New Profit Share ────────────────────────────────────────────── */}
      <Modal open={mode === 'addShare'} onClose={close} title="New Profit Share" size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveShare} disabled={!shareForm.partner_name.trim() || !shareForm.amount || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Record Share
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Partner Name">
              <input value={shareForm.partner_name} onChange={e=>setShareForm(p=>({...p, partner_name: e.target.value}))}
                placeholder="e.g. Ahmed Ali" className={INPUT} autoFocus/>
            </Field>
            <Field label="Share % (optional)">
              <input type="number" step="0.1" min="0" max="100" value={shareForm.share_percent}
                onChange={e=>setShareForm(p=>({...p, share_percent: e.target.value}))}
                placeholder="e.g. 40" className={INPUT}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ($)">
              <input type="number" step="0.01" min="0" value={shareForm.amount}
                onChange={e=>setShareForm(p=>({...p, amount: e.target.value}))}
                placeholder="0.00" className={INPUT}/>
            </Field>
            <Field label="Share Date">
              <DatePicker value={shareForm.share_date} onChange={v=>setShareForm(p=>({...p, share_date: v}))}/>
            </Field>
          </div>
          <Field label="Pay From (account — optional)">
            <Select value={shareForm.account_id} onChange={v=>setShareForm(p=>({...p, account_id: v}))}
              placeholder="— No account movement —" options={accountOptions}/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period (optional)">
              <input value={shareForm.period_note} onChange={e=>setShareForm(p=>({...p, period_note: e.target.value}))}
                placeholder="e.g. Q2 2026" className={INPUT}/>
            </Field>
            <Field label="Notes (optional)">
              <input value={shareForm.notes} onChange={e=>setShareForm(p=>({...p, notes: e.target.value}))}
                placeholder="Notes…" className={INPUT}/>
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── Delete Profit Share ─────────────────────────────────────────── */}
      <Modal open={mode === 'deleteShare'} onClose={close} title="Delete Profit Share" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDeleteShare} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">
            Delete {shareToDelete?.partner_name}'s share of ${Number(shareToDelete?.amount ?? 0).toFixed(2)}?
          </p>
          <p className="mt-1 text-[13px] text-neutral-500">The linked account transaction (if any) stays in the ledger.</p>
        </div>
      </Modal>

      <Modal open={mode === 'deleteAsset'} onClose={close} title="Delete Asset" size="sm"
        footer={<><CancelBtn onClick={close}/><button onClick={doDeleteAsset} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">{saving ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} Delete</button></>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {assetToDelete?.name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">This removes the asset from active records.</p>
        </div>
      </Modal>

      <Modal open={mode === 'deleteCapital'} onClose={close} title="Delete Capital Account" size="sm"
        footer={<><CancelBtn onClick={close}/><button onClick={doDeleteCapital} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">{saving ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} Delete</button></>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {capitalToDelete?.name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">
            {Number(capitalToDelete?.balance) !== 0
              ? `This account still has a balance of $${Number(capitalToDelete?.balance ?? 0).toFixed(2)} — clear it first in Account Cleaner.`
              : 'This removes the capital account from active records.'}
          </p>
        </div>
      </Modal>

      {/* ── Deposit / Withdraw Capital ──────────────────────────────────── */}
      <Modal open={mode === 'depositCapital' || mode === 'withdrawCapital'} onClose={close}
        title={mode === 'depositCapital' ? `Deposit — ${capitalTxTarget?.name ?? ''}` : `Withdraw — ${capitalTxTarget?.name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveCapitalTx} disabled={saving || !capitalTxAccountId || !capitalTxAmount}
            className={`flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40 transition-colors ${
              mode === 'depositCapital' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}>
            {saving ? <RefreshCw size={13} className="animate-spin"/> : mode === 'depositCapital' ? <ArrowDownCircle size={13}/> : <ArrowUpCircle size={13}/>}
            {mode === 'depositCapital' ? 'Deposit' : 'Withdraw'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label={mode === 'depositCapital' ? 'Deposit Into (account)' : 'Withdraw From (account)'}>
            <Select value={capitalTxAccountId} onChange={setCapitalTxAccountId}
              placeholder="— Select account —" options={cashAccountOptions}/>
          </Field>
          <Field label="Amount ($)">
            <input type="number" min="0" step="0.01" value={capitalTxAmount}
              onChange={e=>setCapitalTxAmount(e.target.value)} placeholder="0.00" className={INPUT} autoFocus/>
          </Field>
          <Field label="Description (optional)">
            <input value={capitalTxDesc} onChange={e=>setCapitalTxDesc(e.target.value)}
              placeholder={mode === 'depositCapital' ? 'e.g. Owner top-up' : 'e.g. Owner drawings'} className={INPUT}/>
          </Field>
          <div className={`rounded-xl p-3 ${mode === 'depositCapital' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
            <p className={`text-[12px] ${mode === 'depositCapital' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {mode === 'depositCapital'
                ? 'Recorded as a real transfer into the chosen account, and as capital contributed on this equity account.'
                : 'Recorded as a real transfer out of the chosen account — blocked if that account doesn\'t have enough balance.'}
            </p>
          </div>
        </div>
      </Modal>

      <ImageModal src={viewImage} alt="Company branding" onClose={()=>setViewImage(null)}/>
    </div>
  )
}
