import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Delete, ShieldCheck, X } from 'lucide-react'
import api from '@/services/api'
import { registerApprovalHost, type ApprovalAnswer, type ApprovalRequest } from '@utils/approval'
import { TONES } from '@utils/tones'

// The "Manager approval" dialog. Mounted once (App.tsx); anything can open it through withApproval().

interface Approver { id: string; name: string; role: string; has_pin: boolean }
const REASONS = ['Customer left', 'Wrong order', 'Food spoiled / dropped', 'Kitchen mistake', 'Customer complaint', 'Staff meal']

export function ApprovalHost() {
  const [req, setReq] = useState<ApprovalRequest | null>(null)
  const resolver = useRef<((a: ApprovalAnswer | null) => void) | null>(null)
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [staffId, setStaffId] = useState('')
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    registerApprovalHost(r => new Promise<ApprovalAnswer | null>(resolve => {
      resolver.current?.(null)             // never leave an earlier request hanging
      resolver.current = resolve
      setPin(''); setLocalError('')
      setReq(r)
    }))
    return () => registerApprovalHost(null)
  }, [])

  // The manager list is only needed when a PIN has to be typed
  useEffect(() => {
    if (!req?.needsPin) return
    api.get('/restaurant/approvals/policy').then(r => {
      const list: Approver[] = (r.data.data.approvers as Approver[]).filter(a => a.has_pin)
      setApprovers(list)
      setStaffId(id => id && list.some(a => a.id === id) ? id : (list[0]?.id ?? ''))
    }).catch(() => setApprovers([]))
  }, [req?.needsPin, req])

  const finish = useCallback((a: ApprovalAnswer | null) => {
    resolver.current?.(a); resolver.current = null; setReq(null)
  }, [])

  const submit = () => {
    if (!req) return
    if (req.needsReason && reason.trim().length < 3) return setLocalError('Please give a reason (at least 3 letters)')
    if (req.needsPin) {
      if (!staffId) return setLocalError('Choose the manager approving this')
      if (!/^\d{4,6}$/.test(pin)) return setLocalError('The manager PIN is 4–6 digits')
    }
    finish({ staff_id: req.needsPin ? staffId : undefined, pin: req.needsPin ? pin : undefined, reason: req.needsReason ? reason.trim() : undefined })
  }

  useEffect(() => {
    if (!req) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(null)
      else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') submit()
      else if (req.needsPin && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        if (/^\d$/.test(e.key)) setPin(p => (p + e.key).slice(0, 6))
        else if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  if (!req) return null
  const err = localError || req.error

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => finish(null)} />
      <div className="relative flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#1c2333]">
        <div className={`flex items-start gap-3 px-5 py-4 ${TONES.butter.card} border-0`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONES.butter.chip}`}><ShieldCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className={`text-[15px] font-extrabold ${TONES.butter.ink}`}>Manager approval</h2>
            <p className={`mt-0.5 text-[12px] opacity-80 ${TONES.butter.ink}`}>{req.label}</p>
          </div>
          <button onClick={() => finish(null)} className={`rounded-lg p-1.5 opacity-70 hover:opacity-100 ${TONES.butter.ink}`}><X size={16} /></button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {req.needsReason && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Reason</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {REASONS.map(r => (
                  <button key={r} type="button" onClick={() => { setReason(r); setLocalError('') }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${reason === r ? TONES.lilac.chip : TONES.lilac.soft} hover:opacity-80`}>{r}</button>
                ))}
              </div>
              <input value={reason} onChange={e => { setReason(e.target.value); setLocalError('') }} maxLength={300} placeholder="Or type the reason…"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] text-neutral-800 outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
            </div>
          )}

          {req.needsPin ? (
            <>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Approving manager</p>
                {approvers.length === 0
                  ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-600 dark:bg-rose-500/10">No manager with a PIN exists — add one in HR → Staff (role “manager”, then set a POS PIN).</p>
                  : <select value={staffId} onChange={e => setStaffId(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] font-semibold text-neutral-800 outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:[color-scheme:dark]">
                      {approvers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>}
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Manager PIN</p>
                <div className="mb-3 flex justify-center gap-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 transition ${i < pin.length ? 'border-indigo-500 bg-indigo-500' : 'border-neutral-300 dark:border-white/20'}`} />
                  ))}
                </div>
                <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                    <button key={d} type="button" onClick={() => { setPin(p => (p + d).slice(0, 6)); setLocalError('') }}
                      className="rounded-xl border border-neutral-200 py-2.5 text-[16px] font-bold text-neutral-800 transition hover:bg-neutral-50 active:scale-95 dark:border-white/[0.08] dark:text-white dark:hover:bg-white/[0.06]">{d}</button>
                  ))}
                  <span />
                  <button type="button" onClick={() => setPin(p => (p + '0').slice(0, 6))}
                    className="rounded-xl border border-neutral-200 py-2.5 text-[16px] font-bold text-neutral-800 transition hover:bg-neutral-50 active:scale-95 dark:border-white/[0.08] dark:text-white dark:hover:bg-white/[0.06]">0</button>
                  <button type="button" onClick={() => setPin(p => p.slice(0, -1))} aria-label="Delete"
                    className="flex items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 active:scale-95 dark:border-white/[0.08] dark:hover:bg-white/[0.06]"><Delete size={17} /></button>
                </div>
              </div>
            </>
          ) : (
            <p className={`rounded-xl px-3 py-2 text-[12px] ${TONES.mint.soft}`}>You are signed in as a manager — your approval will be recorded under your name.</p>
          )}

          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err}</p>}
        </div>

        <div className="flex gap-2 border-t border-neutral-100 px-5 py-3.5 dark:border-white/[0.06]">
          <button onClick={() => finish(null)} className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.05]">Cancel</button>
          <button onClick={submit} disabled={req.needsPin && approvers.length === 0}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">Approve</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
