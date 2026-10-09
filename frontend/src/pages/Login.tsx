import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Eye, EyeOff, Lock, Mail, Moon, Sun, Building2, ShieldCheck, ArrowLeft } from 'lucide-react'
import axios from 'axios'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../contexts/ThemeContext'
import { useLanguage } from '../contexts/LanguageContext'
import { getApiErrorMessage } from '../services/api'

function CircuitFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80 dark:opacity-100">
      <div className="absolute left-0 top-[15%] h-px w-[28%] bg-neutral-300 dark:bg-neutral-800" />
      <div className="absolute right-0 top-[15%] h-px w-[28%] bg-neutral-300 dark:bg-neutral-800" />
      <div className="absolute bottom-[16%] left-0 h-px w-[28%] bg-neutral-300 dark:bg-neutral-800" />
      <div className="absolute bottom-[16%] right-0 h-px w-[28%] bg-neutral-300 dark:bg-neutral-800" />
      <div className="absolute left-[28%] top-[15%] h-[190px] w-[90px] border-l border-t border-neutral-300 dark:border-neutral-800" style={{ clipPath: 'polygon(0 0,100% 0,100% 78%,0 100%)' }} />
      <div className="absolute right-[28%] top-[15%] h-[190px] w-[90px] border-r border-t border-neutral-300 dark:border-neutral-800" style={{ clipPath: 'polygon(0 0,100% 0,100% 100%,0 78%)' }} />
      <div className="absolute bottom-[16%] left-[28%] h-[190px] w-[90px] border-b border-l border-neutral-300 dark:border-neutral-800" style={{ clipPath: 'polygon(0 0,100% 22%,100% 100%,0 100%)' }} />
      <div className="absolute bottom-[16%] right-[28%] h-[190px] w-[90px] border-b border-r border-neutral-300 dark:border-neutral-800" style={{ clipPath: 'polygon(0 22%,100% 0,100% 100%,0 100%)' }} />
      {['left-8 top-[13%]', 'right-8 top-[13%]', 'left-8 bottom-[13%]', 'right-8 bottom-[13%]'].map(pos => (
        <div key={pos} className={`absolute ${pos} hidden h-10 w-28 rounded-lg border border-neutral-300 bg-white shadow-inner dark:border-neutral-800 dark:bg-[#161616] md:block`}>
          <div className="grid h-full grid-cols-8 place-items-center px-3">
            {Array.from({ length: 16 }).map((_, i) => <span key={i} className="h-0.5 w-0.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)

  const navigate = useNavigate()
  const { login, verifyTwoFactor } = useAuth()
  // two-factor: after the password, the account may ask for the 6-digit code from the authenticator app
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()

  const emailRef    = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // The card remounts on shake (key={shake}), so focus after the re-render
  const focusAfterShake = (which: 'email' | 'password') =>
    setTimeout(() => (which === 'email' ? emailRef : passwordRef).current?.focus(), 120)

  const submit = async () => {
    if (!email.trim()) {
      setError(t('login.fillBoth')); setShake(k => k + 1)
      focusAfterShake('email'); return
    }
    if (!password) {
      setError(t('login.fillBoth')); setShake(k => k + 1)
      focusAfterShake('password'); return
    }
    setLoading(true); setError('')
    try {
      const r = await login({ email: email.trim(), password })
      if (r?.challenge) { setChallenge(r.challenge); setCode(''); setTimeout(() => codeRef.current?.focus(), 150); return }
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(getApiErrorMessage(e, t('login.invalid')))
      setShake(k => k + 1)
      // Wrong credentials → clear the password and put the cursor back in it
      setPassword('')
      focusAfterShake('password')
    } finally { setLoading(false) }
  }

  const submitCode = async () => {
    if (!challenge || code.trim().length < 6) { setError('Type the 6-digit code from your authenticator app.'); return }
    setLoading(true); setError('')
    try {
      await verifyTwoFactor(challenge, code.trim())
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(getApiErrorMessage(e, 'That code is not right.')); setShake(k => k + 1); setCode('')
      // the sign-in expired or the account got locked → back to the password step
      if (axios.isAxiosError(e) && (e.response?.data as { data?: { restart?: boolean } } | undefined)?.data?.restart) { setChallenge(null); setPassword('') }
      else setTimeout(() => codeRef.current?.focus(), 150)
    } finally { setLoading(false) }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-50 px-4 py-8 text-neutral-900 dark:bg-[#0b0b0c] dark:text-white">
      <CircuitFrame />
      <button
        onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
        aria-label="Toggle theme"
        className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 shadow-sm transition-colors hover:border-sky-400 hover:text-sky-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-sky-400/40 dark:hover:text-white"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <motion.div
        key={shake}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, x: error ? [0, -5, 5, -3, 3, 0] : 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-[420px] rounded-lg border border-neutral-200 bg-white px-6 py-7 shadow-2xl shadow-neutral-200/60 dark:border-white/10 dark:bg-[#181819] dark:shadow-black/50"
      >
        <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 shadow-lg dark:border-white/10 dark:bg-[#272731]">
          <Building2 size={25} className="text-sky-600 dark:text-sky-300" />
        </div>

        <div className="text-center">
          <h1 className="text-[25px] font-extrabold tracking-tight text-neutral-950 dark:text-white">Welcome Back</h1>
          <p className="mt-3 text-[13px] text-neutral-500 dark:text-neutral-400">{challenge ? 'Enter the code from your authenticator app' : 'Sign in to continue to Hospitality ERP'}</p>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              <AlertCircle size={14} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {challenge ? (
          <div className="mt-8 space-y-4">
            <div className="relative">
              <ShieldCheck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
              <input ref={codeRef} value={code} inputMode="text" autoComplete="one-time-code" placeholder="123456" maxLength={11} disabled={loading} autoFocus
                onChange={e => { setCode(e.target.value.replace(/[^a-zA-Z0-9 -]/g, '')); setError('') }} onKeyDown={e => e.key === 'Enter' && submitCode()}
                className="h-12 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-12 pr-4 text-center text-[18px] font-bold tracking-[0.35em] text-neutral-950 outline-none transition focus:border-sky-500/70 focus:ring-4 focus:ring-sky-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-[#101011] dark:text-white" />
            </div>
            <p className="text-center text-[11.5px] text-neutral-400">Lost your phone? Type one of your recovery codes instead (like <span className="font-mono">k3f9a-72xmp</span>).</p>
            <button onClick={submitCode} disabled={loading}
              className="flex h-12 w-full items-center justify-center rounded-lg bg-sky-600 text-[14px] font-bold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-500 active:scale-[0.99] disabled:opacity-60">
              {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : 'Verify & sign in'}
            </button>
            <button onClick={() => { setChallenge(null); setCode(''); setError(''); setPassword('') }} className="mx-auto flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-sky-600"><ArrowLeft size={13} /> Back to password</button>
          </div>
        ) : (<>
        <div className="mt-8 space-y-4">
          <div className="relative">
            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <input ref={emailRef} type="email" value={email} placeholder="email address" autoComplete="email" disabled={loading} autoFocus
              onChange={e => { setEmail(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && submit()}
              className="h-12 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-12 pr-4 text-[14px] text-neutral-950 outline-none transition focus:border-sky-500/70 focus:ring-4 focus:ring-sky-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-[#101011] dark:text-white" />
          </div>
          <div className="relative">
            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <input ref={passwordRef} type={showPw ? 'text' : 'password'} value={password} placeholder="Password" autoComplete="current-password" disabled={loading}
              onChange={e => { setPassword(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && submit()}
              className="h-12 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-12 pr-12 text-[14px] text-neutral-950 outline-none transition focus:border-sky-500/70 focus:ring-4 focus:ring-sky-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-[#101011] dark:text-white" />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-white">
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <button onClick={submit} disabled={loading}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-sky-600 text-[14px] font-bold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-500 active:scale-[0.99] disabled:opacity-60">
          {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : 'Login'}
        </button>
        </>)}
      </motion.div>
    </div>
  )
}
