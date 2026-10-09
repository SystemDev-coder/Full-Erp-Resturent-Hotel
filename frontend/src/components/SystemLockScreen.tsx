import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Lock, LogOut, RefreshCw } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { ROLE_LABELS } from '@/types/auth'
import type { User } from '@/types/auth'

// Screen lock for the main app (hotel, finance, inventory, HR, reports…).
//
// This is deliberately NOT the restaurant POS lock. The POS lock asks "which
// waiter/cashier is at this shared till?" and is answered with a short staff PIN.
// This one protects an already signed-in user's own session when they walk away:
// the page underneath stays exactly as it was (no unsaved form is lost), and only
// the account owner's PASSWORD unlocks it.

interface Props {
  user: User | null
  idleMinutes: number | null    // set when the lock came from inactivity
  onUnlocked: () => void
  onSignOut: () => void
}

export function SystemLockScreen({ user, idleMinutes, onUnlocked, onSignOut }: Props) {
  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const name   = user?.full_name ?? user?.email ?? 'User'
  const role   = user?.current_branch?.role ?? user?.role
  const branch = user?.current_branch?.branch_name

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password || busy) return
    setBusy(true); setError('')
    try {
      await api.post('/auth/unlock', { password })
      setPassword('')
      onUnlocked()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not unlock — please try again.'))
      setPassword('')
      inputRef.current?.focus()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/50 p-4 backdrop-blur-2xl dark:bg-[#0b0c14]/90"
      role="dialog" aria-modal="true" aria-label="Screen locked">
      <form onSubmit={submit}
        className="w-full max-w-[360px] rounded-3xl border border-neutral-200 bg-white p-7 text-center shadow-2xl shadow-black/20 dark:border-white/[0.08] dark:bg-[#161827] dark:shadow-black/50">

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[18px] font-extrabold text-white shadow-lg shadow-indigo-500/30">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <p className="text-[16px] font-extrabold text-neutral-900 dark:text-white">{name}</p>
        <p className="mt-0.5 text-[12px] text-neutral-400">
          {role ? ROLE_LABELS[role] ?? role : 'Staff'}{branch ? ` · ${branch}` : ''}
        </p>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-amber-600 dark:text-amber-300">
          <Lock size={13} />
          {idleMinutes ? `Locked after ${idleMinutes} minutes of inactivity` : 'Screen locked'}
        </div>

        <div className="relative mt-4">
          <input ref={inputRef} type={show ? 'text' : 'password'} value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="Enter your password" autoComplete="current-password"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-4 pr-11 text-[14px] text-neutral-900 placeholder-neutral-400 outline-none focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-white dark:placeholder-neutral-500" />
          <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error && <p className="mt-3 text-[12px] font-bold text-rose-400">{error}</p>}

        <button type="submit" disabled={!password || busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-[14px] font-extrabold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 disabled:opacity-40">
          {busy ? <RefreshCw size={15} className="animate-spin" /> : <Lock size={14} />} Unlock
        </button>

        <button type="button" onClick={onSignOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-rose-500 dark:text-neutral-400 dark:hover:bg-white/[0.05] dark:hover:text-rose-400">
          <LogOut size={13} /> Sign out instead
        </button>
      </form>
    </div>
  )
}
