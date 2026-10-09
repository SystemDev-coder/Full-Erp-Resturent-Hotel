import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, Copy, Download, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'
import { fmtDateTime } from '@utils/detailFormat'

// "Two-factor sign-in" (avatar menu): turn the authenticator-app code on or off for MY account.

interface Status { enabled: boolean; enabled_at: string | null; recovery_left: number }
type Step = 'status' | 'scan' | 'codes' | 'off'

export function TwoFactorModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [step, setStep] = useState<Step>('status')
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = () => api.get('/auth/2fa').then(r => setStatus(r.data.data)).catch(e => setError(getApiErrorMessage(e)))
  useEffect(() => { load() }, [])

  const start = async () => {
    setBusy(true); setError('')
    try {
      const r = await api.post('/auth/2fa/setup')
      // the QR is drawn here in the browser — the secret never goes to any outside website
      const qr = await QRCode.toDataURL(r.data.data.otpauth_uri, { width: 220, margin: 1 })
      setSetup({ secret: r.data.data.secret, qr }); setCode(''); setStep('scan')
    } catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const enable = async () => {
    setBusy(true); setError('')
    try { const r = await api.post('/auth/2fa/enable', { code }); setCodes(r.data.data.recovery_codes); setSaved(false); setStep('codes'); load() }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const disable = async () => {
    setBusy(true); setError('')
    try { await api.post('/auth/2fa/disable', { password, code }); setPassword(''); setCode(''); setStep('status'); load() }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ } }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`Hospitality ERP — two-factor recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' }))
    a.download = 'recovery-codes.txt'; a.click(); URL.revokeObjectURL(a.href)
  }

  const footer = step === 'status' ? <CancelBtn onClick={onClose} />
    : step === 'scan' ? <><CancelBtn onClick={() => setStep('status')} /><button onClick={enable} disabled={busy || code.replace(/\s/g, '').length !== 6} className="rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{busy ? 'Checking…' : 'Turn on'}</button></>
    : step === 'codes' ? <button onClick={onClose} disabled={!saved} className="rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Done</button>
    : <><CancelBtn onClick={() => { setStep('status'); setError('') }} /><button onClick={disable} disabled={busy || !password || !code} className="rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40">{busy ? 'Working…' : 'Turn off'}</button></>

  return (
    <Modal open onClose={step === 'codes' && !saved ? () => undefined : onClose} title="Two-factor sign-in" size="sm" footer={footer}>
      <div className="space-y-4">
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

        {step === 'status' && (!status ? <p className="py-6 text-center text-[13px] text-neutral-400">Loading…</p> : status.enabled ? (
          <>
            <div className={`flex items-start gap-3 rounded-2xl p-4 ${TONES.mint.soft}`}>
              <ShieldCheck size={22} className="mt-0.5 shrink-0" />
              <div><p className="text-[14px] font-bold">Two-factor sign-in is ON</p>
                <p className="text-[12px] opacity-80">Since {status.enabled_at ? fmtDateTime(status.enabled_at) : '—'} · {status.recovery_left} recovery code{status.recovery_left === 1 ? '' : 's'} left</p></div>
            </div>
            <p className="text-[12.5px] text-neutral-500">Signing in needs your password <b>and</b> the 6-digit code from your authenticator app.</p>
            <button onClick={() => { setStep('off'); setError(''); setCode(''); setPassword('') }} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold ${TONES.rose.soft}`}><ShieldOff size={14} /> Turn off two-factor</button>
          </>
        ) : (
          <>
            <div className={`flex items-start gap-3 rounded-2xl p-4 ${TONES.butter.soft}`}>
              <ShieldOff size={22} className="mt-0.5 shrink-0" />
              <div><p className="text-[14px] font-bold">Two-factor sign-in is OFF</p>
                <p className="text-[12px] opacity-80">Anyone who learns your password can sign in as you.</p></div>
            </div>
            <p className="text-[12.5px] text-neutral-500">Add a second lock: a 6-digit code that changes every 30 seconds, from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy…). Strongly recommended for administrators and managers.</p>
            <button onClick={start} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Smartphone size={14} /> {busy ? 'Preparing…' : 'Set up two-factor'}</button>
          </>
        ))}

        {step === 'scan' && setup && (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-neutral-600 dark:text-neutral-300">
              <li>Open your authenticator app and add an account.</li>
              <li>Scan this picture (or type the key below).</li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <div className="flex justify-center rounded-2xl bg-white p-3 ring-1 ring-neutral-200"><img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} /></div>
            <p className="break-all text-center font-mono text-[12px] tracking-wider text-neutral-500">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
            <Field label="6-digit code"><input className={`${INPUT} text-center text-[18px] font-bold tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={code}
              onChange={e => { setCode(e.target.value.replace(/[^\d ]/g, '')); setError('') }} onKeyDown={e => e.key === 'Enter' && code.replace(/\s/g, '').length === 6 && enable()} placeholder="000000" /></Field>
          </>
        )}

        {step === 'codes' && (
          <>
            <div className={`flex items-start gap-3 rounded-2xl p-4 ${TONES.mint.soft}`}><CheckCircle2 size={22} className="mt-0.5 shrink-0" /><div><p className="text-[14px] font-bold">Two-factor is now ON</p><p className="text-[12px] opacity-80">Keep these recovery codes somewhere safe.</p></div></div>
            <p className="text-[12.5px] text-neutral-600 dark:text-neutral-300">If you lose your phone, each code below signs you in <b>once</b>. They are shown <b>only now</b>.</p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-50 p-3 font-mono text-[13px] font-semibold dark:bg-white/[0.04]">{codes.map(c => <span key={c} className="text-center">{c}</span>)}</div>
            <div className="flex gap-2">
              <button onClick={copy} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-[12px] font-semibold dark:border-white/[0.08] dark:text-neutral-200"><Copy size={13} /> {copied ? 'Copied' : 'Copy'}</button>
              <button onClick={download} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-[12px] font-semibold dark:border-white/[0.08] dark:text-neutral-200"><Download size={13} /> Download</button>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="h-4 w-4 accent-emerald-600" /> I have saved these codes</label>
          </>
        )}

        {step === 'off' && (
          <>
            <p className="text-[12.5px] text-neutral-500">To turn it off, confirm it is really you.</p>
            <Field label="Your password"><input type="password" className={INPUT} autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} /></Field>
            <Field label="Code from the app (or a recovery code)"><input className={INPUT} autoComplete="one-time-code" value={code} onChange={e => { setCode(e.target.value); setError('') }} placeholder="123456" /></Field>
          </>
        )}
      </div>
    </Modal>
  )
}
