import { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { ChefHat, Clock, ArrowLeft, UserCircle2, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuthContext } from '@/contexts/AuthContext'

export default function POSLayout() {
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuthContext()
  const navigate = useNavigate()
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const firstName = user?.full_name?.split(' ')[0] ?? 'Cashier'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-50 dark:bg-[#0f1117]">

      {/* ── Top Nav ── */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-200/60 bg-white px-4 dark:border-white/[0.06] dark:bg-[#1c2333]">

        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 shadow-sm">
            <ChefHat size={16} className="text-white"/>
          </div>
          <div className="hidden sm:block">
            <p className="text-[13px] font-extrabold leading-none text-neutral-900 dark:text-white">POS Cashier</p>
            <p className="mt-0.5 text-[9.5px] font-semibold text-orange-500">Point of Sale</p>
          </div>
        </div>

        <div className="mx-2 hidden h-5 w-px bg-neutral-200 dark:bg-white/[0.08] sm:block"/>

        {/* Live clock */}
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <Clock size={12} className="text-orange-500"/>
          <div className="min-w-0">
            <p className="text-[13px] font-bold tabular-nums text-neutral-900 dark:text-white leading-none">{timeStr}</p>
            <p className="mt-0.5 text-[9.5px] text-neutral-400">{dateStr}</p>
          </div>
        </div>

        <div className="flex-1"/>

        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200/60 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-400 dark:hover:bg-white/[0.06] transition-colors">
          {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
        </button>

        {/* User chip */}
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <UserCircle2 size={14} className="shrink-0 text-neutral-400"/>
          <div className="hidden sm:block">
            <p className="text-[12px] font-bold leading-none text-neutral-800 dark:text-neutral-100">{firstName}</p>
            <p className="mt-0.5 text-[10px] capitalize text-neutral-400">{user?.role ?? 'cashier'}</p>
          </div>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-neutral-200 dark:bg-white/[0.08] sm:block"/>

        {/* Exit POS */}
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 rounded-xl border border-neutral-200/60 bg-white px-3 py-2 text-[12px] font-semibold text-neutral-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors">
          <ArrowLeft size={13}/> <span className="hidden sm:inline">Exit POS</span>
        </button>
      </header>

      {/* ── Page content ── */}
      <div className="flex-1 overflow-hidden">
        <Outlet/>
      </div>
    </div>
  )
}