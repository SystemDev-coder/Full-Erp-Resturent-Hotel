import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, HardDriveDownload, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'
import { fmtDateTime } from '@utils/detailFormat'

// Systems → Backup: one-click database backups, download, and automatic daily copies.

interface Backup { name: string; size_bytes: number; created_at: string; kind: 'manual' | 'auto' | 'before-restore' }
interface Status {
  backups: Backup[]; latest: Backup | null; auto_enabled: boolean; keep: number
  running: boolean; tools_available: boolean; database: string
}

const size = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const KIND = { manual: ['Manual', TONES.sky.soft], auto: ['Automatic', TONES.mint.soft], 'before-restore': ['Before restore', TONES.butter.soft] } as const

function ageText(iso?: string) {
  if (!iso) return 'never'
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1) return 'less than an hour ago'
  if (h < 24) return `${Math.floor(h)} hour${Math.floor(h) === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export function BackupPanel() {
  const [data, setData] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setData((await api.get('/system/backups')).data.data); setError('') }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const backupNow = async () => {
    setBusy(true); setError(''); setOkMsg('')
    try {
      const r = await api.post('/system/backups')
      setOkMsg(`Backup created — ${size(r.data.data.size_bytes)}. Now download it and keep a copy off this computer.`)
      await load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setBusy(false) }
  }

  // The download needs the sign-in token, so it cannot be a plain link
  const download = async (b: Backup) => {
    setError('')
    try {
      const r = await api.get(`/system/backups/${encodeURIComponent(b.name)}/download`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(r.data); a.download = b.name; a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { setError(getApiErrorMessage(e)) }
  }

  const remove = async (b: Backup) => {
    if (!window.confirm(`Delete the backup ${b.name}?`)) return
    setError('')
    try { await api.delete(`/system/backups/${encodeURIComponent(b.name)}`); await load() }
    catch (e) { setError(getApiErrorMessage(e)) }
  }

  const latest = data?.latest
  const stale = !latest || (Date.now() - new Date(latest.created_at).getTime()) > 48 * 3_600_000

  return (
    <div className="space-y-5">
      {error && <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}
      {okMsg && <p className="flex items-center gap-2 rounded-2xl bg-[#dcf2e6] px-4 py-3 text-[13px] font-semibold text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]"><CheckCircle2 size={15} />{okMsg}</p>}
      {data && !data.tools_available && (
        <p className="flex items-start gap-2 rounded-2xl bg-[#fcf0c8] px-4 py-3 text-[13px] text-[#7d5f08] dark:bg-[#3b3417] dark:text-[#f2d479]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          The PostgreSQL backup tool (pg_dump) was not found on this server. Install the PostgreSQL client tools or set PG_DUMP_PATH in the server's .env file.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`rounded-3xl border p-5 ${stale ? TONES.rose.card : TONES.mint.card}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${stale ? TONES.rose.chip : TONES.mint.chip}`}>
            {stale ? <AlertTriangle size={21} /> : <ShieldCheck size={21} />}
          </span>
          <p className={`mt-4 text-[12.5px] font-medium opacity-80 ${stale ? TONES.rose.ink : TONES.mint.ink}`}>Last backup</p>
          <p className={`text-[24px] font-bold leading-tight ${stale ? TONES.rose.ink : TONES.mint.ink}`}>{loading ? '…' : ageText(latest?.created_at)}</p>
          <p className={`mt-1 text-[11.5px] opacity-70 ${stale ? TONES.rose.ink : TONES.mint.ink}`}>
            {latest ? `${fmtDateTime(latest.created_at)} · ${size(latest.size_bytes)}` : 'No backup exists yet — take one now'}
          </p>
        </div>
        <div className={`rounded-3xl border p-5 ${TONES.sky.card}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TONES.sky.chip}`}><DatabaseBackup size={21} /></span>
          <p className={`mt-4 text-[12.5px] font-medium opacity-80 ${TONES.sky.ink}`}>Automatic backup</p>
          <p className={`text-[24px] font-bold leading-tight ${TONES.sky.ink}`}>{data?.auto_enabled ? 'Every day' : 'Off'}</p>
          <p className={`mt-1 text-[11.5px] opacity-70 ${TONES.sky.ink}`}>
            {data?.auto_enabled ? `Keeps the latest ${data.keep} automatic copies` : 'Set BACKUP_AUTO=true in the server .env'}
          </p>
        </div>
        <button onClick={backupNow} disabled={busy || !data?.tools_available}
          className={`group flex flex-col items-start rounded-3xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 ${TONES.lilac.card}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TONES.lilac.chip}`}>
            {busy ? <RefreshCw size={21} className="animate-spin" /> : <HardDriveDownload size={21} />}
          </span>
          <p className={`mt-4 text-[12.5px] font-medium opacity-80 ${TONES.lilac.ink}`}>Take a backup right now</p>
          <p className={`text-[24px] font-bold leading-tight ${TONES.lilac.ink}`}>{busy ? 'Backing up…' : 'Back up now'}</p>
          <p className={`mt-1 text-[11.5px] opacity-70 ${TONES.lilac.ink}`}>Do this before big changes or closing a period</p>
        </button>
      </div>

      <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-bold tracking-tight text-neutral-900 dark:text-white">Saved backups</h3>
            <p className="mt-0.5 text-[12px] text-neutral-400">Database “{data?.database}” · stored on the server in the backups folder</p>
          </div>
          <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition hover:text-indigo-600 dark:border-white/[0.08] dark:text-neutral-400">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {(data?.backups.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-[13px] text-neutral-400">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
                  <th className="pb-2.5 pr-3">File</th><th className="pb-2.5 pr-3">Created</th><th className="pb-2.5 pr-3">Type</th>
                  <th className="pb-2.5 pr-3 text-right">Size</th><th className="pb-2.5" />
                </tr>
              </thead>
              <tbody>
                {data!.backups.map(b => (
                  <tr key={b.name} className="border-t border-neutral-100 dark:border-white/[0.05]">
                    <td className="py-3 pr-3 font-mono text-[11.5px] text-neutral-700 dark:text-neutral-200">{b.name}</td>
                    <td className="whitespace-nowrap py-3 pr-3 text-neutral-500">{fmtDateTime(b.created_at)}</td>
                    <td className="py-3 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${KIND[b.kind][1]}`}>{KIND[b.kind][0]}</span></td>
                    <td className="py-3 pr-3 text-right tabular-nums text-neutral-700 dark:text-neutral-200">{size(b.size_bytes)}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => download(b)} title="Download" className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition hover:opacity-80 ${TONES.sky.soft}`}><Download size={12} /> Download</button>
                        <button onClick={() => remove(b)} title="Delete" className={`rounded-lg px-2 py-1.5 transition hover:opacity-80 ${TONES.rose.soft}`}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`rounded-3xl border p-5 ${TONES.butter.card}`}>
        <h3 className={`text-[14px] font-bold ${TONES.butter.ink}`}>Keep your data safe</h3>
        <ul className={`mt-2 list-disc space-y-1.5 pl-5 text-[12.5px] leading-relaxed ${TONES.butter.ink}`}>
          <li><b>Copy backups off this computer</b> (USB drive, Google Drive, another PC). A backup that sits on the same disk is lost with it.</li>
          <li>Photos (menu pictures, guest ID scans, logo) live in the server's <code>uploads</code> folder — copy that folder too.</li>
          <li>To restore, ask your technician to run <code>pg_restore --clean --if-exists --no-owner -d {data?.database ?? 'hospitality_erp'} &lt;backup file&gt;</code> while the server is stopped. Restoring replaces everything with the state at backup time.</li>
        </ul>
      </section>
    </div>
  )
}
