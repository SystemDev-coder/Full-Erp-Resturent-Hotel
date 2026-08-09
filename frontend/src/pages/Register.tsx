import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Mail, Lock, User, Sun, Moon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getApiErrorMessage } from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'

const BG_LIGHT = 'linear-gradient(155deg,#5ab8ea 0%,#9dd5f5 38%,#d0ecfb 68%,#e8f6ff 100%)'
const BG_DARK  = 'linear-gradient(155deg,#071521 0%,#091C30 38%,#0A2240 68%,#071521 100%)'

function pwStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let s = 0
  if (pw.length >= 8)           s++
  if (pw.length >= 12)          s++
  if (/[A-Z]/.test(pw))         s++
  if (/[0-9]/.test(pw))         s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (s <= 1) return { score: s, label: 'Weak',   color: '#EF4444' }
  if (s <= 3) return { score: s, label: 'Fair',   color: '#F97316' }
  if (s === 4) return { score: s, label: 'Good',  color: '#EAB308' }
  return               { score: s, label: 'Strong', color: '#22C55E' }
}

export default function Register() {
  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [shakeKey, setShakeKey]       = useState(0)

  const navigate               = useNavigate()
  const { register }           = useAuth()
  const { showToast }          = useToast()
  const { theme, toggleTheme } = useTheme()
  const dk = theme === 'dark'

  const strength = useMemo(() => pwStrength(password), [password])
  const pwMatch  = confirm.length > 0 && password === confirm
  const noMatch  = confirm.length > 0 && !pwMatch

  const clearError = () => setError('')

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirm.trim()) {
      setError('All fields are required.'); setShakeKey(k => k + 1); return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.'); setShakeKey(k => k + 1); return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); setShakeKey(k => k + 1); return
    }
    if (password !== confirm) {
      setError('Passwords do not match.'); setShakeKey(k => k + 1); return
    }
    setLoading(true); setError(''); setSuccess('')
    try {
      await register({ name: name.trim(), email: email.trim(), password })
      setSuccess('Account created! Redirecting to sign in…')
      showToast('Account created successfully.', 'success')
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (e) {
      const msg = getApiErrorMessage(e, 'Registration failed. Please try again.')
      setError(msg); setShakeKey(k => k + 1); showToast(msg, 'error')
    } finally { setLoading(false) }
  }

  const iconColor = error ? '#f87171' : dk ? '#1E4D6E' : '#94A3B8'

  const base    = `h-11 w-full rounded-xl border text-sm outline-none transition-all duration-200 disabled:opacity-50`
  const normal  = dk
    ? 'border-sky-800/50 bg-sky-950/60 text-sky-50 placeholder-sky-800 focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20'
    : 'border-slate-200 bg-white/70 text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-300/30'
  const errCls  = dk
    ? 'border-red-600/60 bg-red-950/30 text-sky-50 placeholder-sky-800 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20'
    : 'border-red-400/70 bg-red-50/60 text-slate-800 placeholder-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-300/25'
  const matchOk = dk
    ? 'border-emerald-600/50 bg-sky-950/60 text-sky-50 placeholder-sky-800 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15'
    : 'border-emerald-400/60 bg-white/70 text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/20'

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: dk ? BG_DARK : BG_LIGHT }}>

      {/* Dark mode toggle */}
      <button onClick={toggleTheme} aria-label="Toggle dark mode"
        className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          background: dk ? 'rgba(9,28,48,0.85)' : 'rgba(255,255,255,0.82)',
          border: dk ? '1px solid rgba(56,189,248,0.2)' : '1px solid rgba(255,255,255,0.9)',
          backdropFilter: 'blur(12px)', color: dk ? '#38BDF8' : '#475569',
        }}>
        <AnimatePresence mode="wait" initial={false}>
          {dk
            ? <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}><Sun size={15} /></motion.span>
            : <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}><Moon size={15} /></motion.span>}
        </AnimatePresence>
      </button>

      {/* Rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[520px] w-[520px] rounded-full" style={{ border: dk ? '1px solid rgba(56,189,248,0.06)' : '1px solid rgba(255,255,255,0.20)' }} />
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[780px] w-[780px] rounded-full" style={{ border: dk ? '1px solid rgba(56,189,248,0.03)' : '1px solid rgba(255,255,255,0.10)' }} />
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[400px]"
        style={dk ? {
          background: 'rgba(9,28,48,0.92)',
          backdropFilter: 'blur(32px)',
          borderRadius: '24px',
          border: '1.5px solid rgba(56,189,248,0.12)',
          boxShadow: '0 8px 40px rgba(4,14,28,0.5)',
        } : {
          background: 'linear-gradient(148deg,rgba(255,255,255,0.72) 0%,rgba(200,238,255,0.55) 100%)',
          backdropFilter: 'blur(32px)',
          borderRadius: '24px',
          border: '1.5px solid rgba(255,255,255,0.88)',
          boxShadow: '0 8px 40px rgba(70,162,228,0.12)',
        }}
      >
        <div className="px-8 py-6">

          {/* Logo */}
          <div className="mb-4 flex flex-col items-center gap-2">
            <div className="flex h-13 w-13 items-center justify-center rounded-[16px]"
              style={{ background: 'linear-gradient(135deg,#38bdf8 0%,#0ea5e9 45%,#7c3aed 100%)', boxShadow: '0 6px 24px rgba(14,165,233,0.30)' }}>
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <rect x="5" y="8"  width="26" height="4"   rx="2" fill="white"/>
                <rect x="5" y="16" width="18" height="4"   rx="2" fill="white" fillOpacity="0.80"/>
                <rect x="5" y="24" width="22" height="4"   rx="2" fill="white" fillOpacity="0.60"/>
                <circle cx="28" cy="9" r="3.5" fill="white" fillOpacity="0.20"/>
                <circle cx="28" cy="9" r="2"   fill="white"/>
              </svg>
            </div>
            <div className="text-center leading-none">
              <p className="text-[19px] font-black tracking-tight" style={{ color: dk ? '#F0F9FF' : '#0F172A' }}>
                Som<span style={{ backgroundImage: 'linear-gradient(90deg,#0ea5e9,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NLP</span>
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: dk ? '#38698A' : '#94A3B8' }}>Research Platform</p>
            </div>
          </div>

          {/* Heading */}
          <h1 className="mb-0.5 text-center text-[1.02rem] font-bold" style={{ color: dk ? '#F0F9FF' : '#1E293B' }}>Create your account</h1>
          <p className="mb-4 text-center text-[12px]" style={{ color: dk ? '#38698A' : '#64748B' }}>Join the Somali NLP research platform.</p>

          {/* Error / success banner */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div key={`err-${shakeKey}`}
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1, x: [0, -5, 5, -3, 3, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32, x: { duration: 0.32 } }}
                className={`mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 ${dk ? 'border-red-700/30 bg-red-900/20' : 'border-red-200 bg-red-50'}`}>
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                <p className={`text-xs font-semibold leading-relaxed ${dk ? 'text-red-300' : 'text-red-600'}`}>{error}</p>
              </motion.div>
            )}
            {success && (
              <motion.div key="ok" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className={`mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 ${dk ? 'border-emerald-700/30 bg-emerald-900/20' : 'border-emerald-200 bg-emerald-50'}`}>
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                <p className={`text-xs font-semibold ${dk ? 'text-emerald-300' : 'text-emerald-700'}`}>{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fields */}
          <div className="space-y-2">
            {/* Name */}
            <div className="relative">
              <User size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: iconColor }} />
              <input type="text" value={name} onChange={e => { setName(e.target.value); clearError() }}
                placeholder="Full Name" disabled={loading} autoComplete="name"
                className={`${base} pl-9 pr-4 ${error ? errCls : normal}`} />
            </div>

            {/* Email */}
            <div className="relative">
              <Mail size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: iconColor }} />
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); clearError() }}
                placeholder="Email address" disabled={loading} autoComplete="email"
                className={`${base} pl-9 pr-4 ${error ? errCls : normal}`} />
            </div>

            {/* Password */}
            <div>
              <div className="relative">
                <Lock size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: iconColor }} />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); clearError() }}
                  placeholder="Password (8+ characters)" disabled={loading} autoComplete="new-password"
                  className={`${base} pl-9 pr-10 ${error ? errCls : normal}`} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: dk ? '#1E4D6E' : '#94A3B8' }}>
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {password && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="h-[3px] flex-1 rounded-full transition-all duration-300"
                        style={{ background: i <= strength.score ? strength.color : dk ? 'rgba(14,165,233,0.12)' : 'rgba(148,163,184,0.22)' }} />
                    ))}
                  </div>
                  <p className="text-[10px] font-bold" style={{ color: strength.color }}>{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirm */}
            <div>
              <div className="relative">
                <Lock size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: iconColor }} />
                <input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => { setConfirm(e.target.value); clearError() }}
                  placeholder="Confirm Password" disabled={loading} autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className={`${base} pl-9 pr-10 ${noMatch ? errCls : pwMatch ? matchOk : (error ? errCls : normal)}`} />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: dk ? '#1E4D6E' : '#94A3B8' }}>
                  {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {noMatch && <p className="mt-1 text-[11px] font-semibold text-red-500">Passwords do not match</p>}
              {pwMatch  && <p className="mt-1 text-[11px] font-semibold text-emerald-500">✓ Passwords match</p>}
            </div>
          </div>

          {/* Submit */}
          <button onClick={submit} disabled={loading}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-60"
            style={dk
              ? { background: 'linear-gradient(135deg,#0284c7 0%,#0ea5e9 100%)', boxShadow: '0 4px 18px rgba(14,165,233,0.25)' }
              : { background: '#0F172A' }}>
            {loading
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : 'Get Started'}
          </button>

          {/* Divider + sign in */}
          <div className="my-3 flex items-center gap-2">
            <div className="flex-1 border-t" style={{ borderColor: dk ? 'rgba(14,165,233,0.1)' : '#E2E8F0' }} />
            <span className="text-[11px] font-medium" style={{ color: dk ? '#1E4D6E' : '#94A3B8' }}>or</span>
            <div className="flex-1 border-t" style={{ borderColor: dk ? 'rgba(14,165,233,0.1)' : '#E2E8F0' }} />
          </div>
          <p className="text-center text-[13px]" style={{ color: dk ? '#38698A' : '#64748B' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold" style={{ color: dk ? '#38BDF8' : '#0284c7' }}>Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
