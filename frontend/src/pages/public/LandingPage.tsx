import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import {
  Brain, FlaskConical, Layers, Cpu, Trophy, ChevronRight, ChevronDown,
  ArrowRight, Menu, X, Sun, Moon, ExternalLink, GraduationCap,
  Database, Microscope, Zap, CheckCircle2, BookOpen, Users, Star,
  BarChart2, GitBranch, Globe, Sparkles,
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../hooks/useAuth'

/* ── Data ────────────────────────────────────────────────────────────────── */
const TEAM = [
  { name: 'Moscab Bashir Hassan',       role: 'Lead Researcher · Full-Stack Engineer',    initials: 'MB', grad: 'from-sky-500 to-violet-600',   shadow: 'shadow-sky-500/25',    contrib: ['Platform architecture', 'Model integration', 'XAI implementation'] },
  { name: 'Ayaan Abdiqaadir Mohamuud',  role: 'NLP Researcher · Model Development',       initials: 'AA', grad: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', contrib: ['Deep learning models', 'Transformer fine-tuning', 'Evaluation metrics'] },
  { name: 'Aisha Mohamuud Shamow',      role: 'Data Specialist · Corpus Annotation',      initials: 'AM', grad: 'from-teal-500 to-cyan-600',    shadow: 'shadow-teal-500/25',   contrib: ['Dataset curation', 'Label annotation', 'Data preprocessing'] },
  { name: 'Abdulahi Ahmed Jimcaale',    role: 'Experimental Design · Statistical Analysis', initials: 'AJ', grad: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25',  contrib: ['Ablation design', 'Statistical validation', 'Results analysis'] },
]

const TOP_MODELS = [
  { model: 'LinearSVC_TFIDF',          exp: 'Exp 1', family: 'traditional_ml', accuracy: 94.31, f1: 0.9431 },
  { model: 'LinearSVC_TFIDF',          exp: 'Exp 2', family: 'traditional_ml', accuracy: 93.29, f1: 0.9329 },
  { model: 'MiniTransformer_Keras',     exp: 'Exp 1', family: 'transformers',   accuracy: 92.61, f1: 0.9261 },
  { model: 'LogisticRegression_TFIDF',  exp: 'Exp 1', family: 'traditional_ml', accuracy: 92.26, f1: 0.9224 },
  { model: 'XLMRoberta_FineTuned',      exp: 'Exp 1', family: 'transformers',   accuracy: 91.84, f1: 0.9183 },
  { model: 'XGBoost_TFIDF',            exp: 'Exp 2', family: 'traditional_ml', accuracy: 91.22, f1: 0.9118 },
  { model: 'AfriBERTa_FineTuned',      exp: 'Exp 1', family: 'transformers',   accuracy: 90.78, f1: 0.9075 },
  { model: 'RandomForest_TFIDF',        exp: 'Exp 1', family: 'traditional_ml', accuracy: 88.43, f1: 0.8831 },
  { model: 'BiLSTM_Word2Vec',           exp: 'Exp 1', family: 'deep_learning',  accuracy: 86.17, f1: 0.8602 },
  { model: 'mBERT_FineTuned',           exp: 'Exp 2', family: 'transformers',   accuracy: 85.54, f1: 0.8541 },
]

const CHART_DATA = TOP_MODELS.slice(0, 8).map(m => ({
  name: m.model.replace(/_TFIDF|_FineTuned|_Keras|_Word2Vec/g, '').replace(/_/g, ' '),
  accuracy: m.accuracy, family: m.family,
})).reverse()

const RADAR_DATA = [
  { metric: 'Accuracy',   'Traditional ML': 94, Transformers: 92, 'Deep Learning': 86 },
  { metric: 'F1 Score',   'Traditional ML': 94, Transformers: 91, 'Deep Learning': 86 },
  { metric: 'Precision',  'Traditional ML': 94, Transformers: 91, 'Deep Learning': 86 },
  { metric: 'Recall',     'Traditional ML': 94, Transformers: 92, 'Deep Learning': 86 },
  { metric: 'Speed',      'Traditional ML': 98, Transformers: 42, 'Deep Learning': 65 },
  { metric: 'Efficiency', 'Traditional ML': 97, Transformers: 38, 'Deep Learning': 60 },
]

const FAMILY_COLOR: Record<string, string> = {
  traditional_ml: '#0ea5e9', transformers: '#7c3aed', deep_learning: '#f97316',
}

const STATS = [
  { value: '19',    label: 'Models Evaluated' },
  { value: '2',     label: 'Ablation Experiments' },
  { value: '94.3%', label: 'Peak Accuracy' },
  { value: '8',     label: 'News Categories' },
]

const PIPELINE = [
  { icon: Database,    label: 'Data Collection',    desc: 'Somali news corpus, 8 topic categories' },
  { icon: Layers,      label: 'Preprocessing',      desc: 'Tokenisation & stopword analysis' },
  { icon: Brain,       label: 'Feature Extraction', desc: 'TF-IDF, Word2Vec, FastText, BERT' },
  { icon: FlaskConical,label: 'Model Training',     desc: '19 classifiers × 2 experiments' },
  { icon: BarChart2,   label: 'Evaluation',         desc: 'Accuracy, F1, Precision, Recall' },
  { icon: Microscope,  label: 'Explainability',     desc: 'LIME token-level attribution' },
]

const CATEGORIES = [
  { name: 'Politics',      color: '#3b82f6', pct: 31 },
  { name: 'Sports',        color: '#10b981', pct: 29 },
  { name: 'Education',     color: '#f59e0b', pct: 12 },
  { name: 'Business',      color: '#f97316', pct: 9  },
  { name: 'Technology',    color: '#8b5cf6', pct: 7  },
  { name: 'Religion',      color: '#06b6d4', pct: 6  },
  { name: 'Health',        color: '#ef4444', pct: 5  },
  { name: 'Entertainment', color: '#ec4899', pct: 2  },
]

const TECHNOLOGIES = [
  { group: 'NLP / ML',       items: ['scikit-learn', 'TensorFlow / Keras', 'HuggingFace Transformers', 'LIME', 'Gensim', 'XGBoost'] },
  { group: 'Backend',        items: ['FastAPI', 'Motor (async MongoDB)', 'Python 3.11', 'JWT Auth', 'Uvicorn'] },
  { group: 'Frontend',       items: ['React 18', 'TypeScript', 'TailwindCSS', 'Framer Motion', 'Recharts', 'Vite'] },
  { group: 'Infrastructure', items: ['MongoDB Atlas', 'Git LFS (model storage)', 'Docker', 'REST API'] },
]

const FINDINGS = [
  { icon: Trophy,       lightColor: 'text-amber-500',   darkColor: 'text-amber-400',   lightBg: 'bg-amber-50',   darkBg: 'bg-amber-500/[0.14]',   lightBorder: 'border-amber-200',  darkBorder: 'border-amber-500/25',  title: 'Traditional ML Dominates', body: 'LinearSVC with TF-IDF achieves 94.31% accuracy — outperforming all deep learning and transformer models. Sparse linear models benefit from Somali\'s morphological regularity.' },
  { icon: FlaskConical, lightColor: 'text-violet-600',  darkColor: 'text-violet-400',  lightBg: 'bg-violet-50',  darkBg: 'bg-violet-500/[0.14]',  lightBorder: 'border-violet-200', darkBorder: 'border-violet-500/25', title: 'Stopwords Matter',          body: 'Experiment 1 (stopwords included) consistently outperforms Experiment 2 by 1–2%. Somali function words carry significant topical signals not present in English.' },
  { icon: Cpu,          lightColor: 'text-sky-600',     darkColor: 'text-sky-400',     lightBg: 'bg-sky-50',     darkBg: 'bg-sky-500/[0.14]',     lightBorder: 'border-sky-200',    darkBorder: 'border-sky-500/25',    title: 'Transformers Generalise',   body: 'XLM-RoBERTa and AfriBERTa reach top-5 rankings without task-specific feature engineering, demonstrating strong cross-lingual transfer to Somali.' },
  { icon: Microscope,   lightColor: 'text-emerald-600', darkColor: 'text-emerald-400', lightBg: 'bg-emerald-50', darkBg: 'bg-emerald-500/[0.14]', lightBorder: 'border-emerald-200', darkBorder: 'border-emerald-500/25', title: 'LIME Exposes Token Bias',   body: 'LIME explanations reveal domain-specific named entities and Somali tokens that disproportionately drive predictions, exposing potential dataset bias.' },
]

/* ── Shared logo mark ────────────────────────────────────────────────────── */
const LogoMark = ({ size = 36 }: { size?: number }) => (
  <div className="shrink-0 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10"
    style={{ width: size, height: size, background: 'linear-gradient(135deg,#38bdf8 0%,#0ea5e9 45%,#7c3aed 100%)', borderRadius: Math.round(size * 0.28), boxShadow: '0 4px 18px rgba(14,165,233,0.28)' }}>
    <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="4"    width="15"   height="2.5" rx="1.25" fill="white"/>
      <rect x="2.5" y="8.75" width="10.5" height="2.5" rx="1.25" fill="white" fillOpacity="0.80"/>
      <rect x="2.5" y="13.5" width="13"   height="2.5" rx="1.25" fill="white" fillOpacity="0.60"/>
      <circle cx="16" cy="4.5" r="2.2" fill="white" fillOpacity="0.22"/>
      <circle cx="16" cy="4.5" r="1.3" fill="white"/>
    </svg>
  </div>
)

/* ── Scroll-reveal ───────────────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-70px' })
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: 'easeOut', delay }}>
      {children}
    </motion.div>
  )
}

/* ── Section header ──────────────────────────────────────────────────────── */
function SectionHeader({ badge, badgeClass, icon: Icon, title, subtitle }: {
  badge: string; badgeClass: string; icon: React.ElementType; title: string; subtitle?: string
}) {
  return (
    <Reveal className="mb-14 text-center">
      <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest ${badgeClass}`}>
        <Icon size={11} /> {badge}
      </span>
      <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-500 dark:text-white/45">{subtitle}</p>}
    </Reveal>
  )
}

/* ── Navbar ──────────────────────────────────────────────────────────────── */
function Navbar() {
  const [open, setOpen]       = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive]   = useState('')
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated }   = useAuth()
  const navigate              = useNavigate()
  const dk                    = theme === 'dark'

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24)
      const ids = ['research', 'methodology', 'results', 'dataset', 'team']
      for (const id of [...ids].reverse()) {
        const el = document.getElementById(id)
        if (el && window.scrollY >= el.offsetTop - 130) { setActive(id); break }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { href: 'research',    label: 'Research' },
    { href: 'methodology', label: 'Methodology' },
    { href: 'results',     label: 'Results' },
    { href: 'dataset',     label: 'Dataset' },
    { href: 'team',        label: 'Team' },
  ]
  const scroll = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <>
      <motion.nav initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? dk
              ? 'border-b border-white/[0.07] bg-[#050D1A]/94 shadow-2xl backdrop-blur-xl'
              : 'border-b border-slate-200/80 bg-white/94 shadow-lg backdrop-blur-xl'
            : 'bg-transparent'
        }`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={34} />
            <div className="leading-none">
              <p className="text-[14px] font-black tracking-tight text-slate-900 dark:text-white">
                Som<span style={{ backgroundImage: 'linear-gradient(90deg,#0ea5e9,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NLP</span>
              </p>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-white/30">Research Platform</p>
            </div>
          </Link>

          <div className="hidden items-center gap-0.5 lg:flex">
            {navLinks.map(l => (
              <button key={l.href} onClick={() => scroll(l.href)}
                className={`relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                  active === l.href
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/85'
                }`}>
                {active === l.href && (
                  <motion.span layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-slate-100 dark:bg-white/[0.08]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{l.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/[0.07] dark:hover:text-white">
              {dk ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
              className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:scale-[1.03] hover:shadow-sky-500/35 lg:flex">
              {isAuthenticated ? 'Dashboard' : 'Open Platform'} <ArrowRight size={13} />
            </button>
            <button onClick={() => setOpen(v => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-white/50 dark:hover:bg-white/[0.07] lg:hidden">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed inset-x-0 top-16 z-40 border-b border-slate-200 bg-white/96 px-6 py-5 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#050D1A]/96">
            <div className="grid gap-1">
              {navLinks.map(l => (
                <button key={l.href} onClick={() => scroll(l.href)}
                  className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-white/65 dark:hover:bg-white/[0.05]">
                  {l.label} <ChevronDown size={14} className="-rotate-90 opacity-40" />
                </button>
              ))}
            </div>
            <button onClick={() => { setOpen(false); navigate(isAuthenticated ? '/dashboard' : '/login') }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 py-3.5 text-sm font-bold text-white">
              {isAuthenticated ? 'Go to Dashboard' : 'Open Research Platform'} <ArrowRight size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   HERO — Floating badge widget
══════════════════════════════════════════════════════════════════════════ */
function FloatingBadge({ children, delay, className }: { children: React.ReactNode; delay: number; className: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.75, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
      className={`pointer-events-none absolute hidden select-none lg:block ${className}`}
    >
      {children}
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { isAuthenticated } = useAuth()
  const { theme }           = useTheme()
  const navigate            = useNavigate()
  const dk                  = theme === 'dark'

  /* shared class shorthands */
  const card    = 'rounded-2xl border border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.025]'
  const muted   = 'text-slate-500 dark:text-white/45'
  const vmuted  = 'text-slate-400 dark:text-white/28'
  const divider = 'border-slate-200 dark:border-white/[0.06]'

  return (
    <div className={`min-h-screen overflow-x-hidden selection:bg-sky-500/25 selection:text-sky-700 dark:selection:text-sky-200 ${
      dk ? 'bg-[#050D1A] text-white' : 'bg-white text-slate-900'
    }`}>
      <Navbar />

      {/* ════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16 text-center">

        {/* ── Background ── */}
        {dk ? (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-[28%] h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600/10 blur-[140px]" />
            <div className="absolute left-[12%] top-[68%] h-96 w-96 rounded-full bg-violet-700/10 blur-[100px]" />
            <div className="absolute right-[8%] top-[18%] h-80 w-80 rounded-full bg-cyan-500/7 blur-[110px]" />
            <div className="absolute inset-0 opacity-30"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.018) 1px,transparent 1px)', backgroundSize: '72px 72px' }} />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-[22%] h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/60 blur-[120px]" />
            <div className="absolute left-[10%] top-[65%] h-80 w-80 rounded-full bg-violet-200/50 blur-[90px]" />
            <div className="absolute right-[5%] top-[15%] h-72 w-72 rounded-full bg-cyan-200/40 blur-[100px]" />
            <div className="absolute inset-0 opacity-60"
              style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.025) 1px,transparent 1px)', backgroundSize: '72px 72px' }} />
          </div>
        )}

        {/* ── Floating proof badges ── */}
        <FloatingBadge delay={0.9} className="left-[6%] top-[28%]">
          <div className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 ${dk ? 'border-white/10 bg-white/6 backdrop-blur-xl' : 'border-slate-200 bg-white'}`}>
            <span className="text-base">🥇</span>
            <div className="text-left leading-none">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dk ? 'text-white/35' : 'text-slate-400'}`}>Best Model</p>
              <p className={`mt-0.5 text-xs font-black ${dk ? 'text-white' : 'text-slate-800'}`}>LinearSVC · 94.31%</p>
            </div>
          </div>
        </FloatingBadge>

        <FloatingBadge delay={1.05} className="right-[5%] top-[22%]">
          <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 ${dk ? 'border-white/10 bg-white/6 backdrop-blur-xl' : 'border-slate-200 bg-white'}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
              <Brain size={15} className="text-white" />
            </div>
            <div className="text-left leading-none">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dk ? 'text-white/35' : 'text-slate-400'}`}>Models Tested</p>
              <p className={`mt-0.5 text-xs font-black ${dk ? 'text-white' : 'text-slate-800'}`}>19 Classifiers</p>
            </div>
          </div>
        </FloatingBadge>

        <FloatingBadge delay={1.2} className="left-[4%] bottom-[30%]">
          <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 ${dk ? 'border-white/10 bg-white/6 backdrop-blur-xl' : 'border-slate-200 bg-white'}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md">
              <Microscope size={15} className="text-white" />
            </div>
            <div className="text-left leading-none">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dk ? 'text-white/35' : 'text-slate-400'}`}>Explainability</p>
              <p className={`mt-0.5 text-xs font-black ${dk ? 'text-white' : 'text-slate-800'}`}>LIME Analysis</p>
            </div>
          </div>
        </FloatingBadge>

        <FloatingBadge delay={1.35} className="right-[4%] bottom-[32%]">
          <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 ${dk ? 'border-white/10 bg-white/6 backdrop-blur-xl' : 'border-slate-200 bg-white'}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-md">
              <Database size={15} className="text-white" />
            </div>
            <div className="text-left leading-none">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dk ? 'text-white/35' : 'text-slate-400'}`}>Language</p>
              <p className={`mt-0.5 text-xs font-black ${dk ? 'text-white' : 'text-slate-800'}`}>Somali NLP</p>
            </div>
          </div>
        </FloatingBadge>

        {/* ── Center content ── */}
        <div className="relative z-10 max-w-4xl">
          {/* Year badge */}
          <motion.div initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.45 }}
            className={`mb-7 inline-flex items-center gap-2.5 rounded-full border px-5 py-2 text-[11px] font-bold uppercase tracking-widest ${
              dk ? 'border-sky-500/25 bg-sky-500/10 text-sky-300' : 'border-sky-300/60 bg-sky-50 text-sky-600'
            }`}>
            <Star size={11} className={dk ? 'fill-sky-400 text-sky-400' : 'fill-sky-500 text-sky-500'} />
            Final Year Research Project · BSc Computer Science · 2022–2026
          </motion.div>

          {/* Title */}
          <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.65 }}>
            <h1 className={`text-[2.7rem] font-black leading-[1.06] tracking-tight sm:text-[3.9rem] lg:text-[5.2rem] ${dk ? 'text-white' : 'text-slate-900'}`}>
              Somali Text
            </h1>
            <h1 className="text-[2.7rem] font-black leading-[1.06] tracking-tight sm:text-[3.9rem] lg:text-[5.2rem]"
              style={{ backgroundImage: 'linear-gradient(135deg,#0ea5e9 0%,#818cf8 45%,#7c3aed 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Classification
            </h1>
            <h1 className={`text-[2.7rem] font-black leading-[1.06] tracking-tight sm:text-[3.9rem] lg:text-[5.2rem] ${dk ? 'text-white' : 'text-slate-900'}`}>
              Research
            </h1>
          </motion.div>

          {/* Animated accent line */}
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.6, duration: 0.7, ease: 'easeOut' }}
            className="mx-auto mt-5 h-1 w-24 origin-left rounded-full"
            style={{ background: 'linear-gradient(90deg,#0ea5e9,#7c3aed)' }} />

          {/* Subtitle */}
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
            className={`mx-auto mt-6 max-w-2xl text-[1.05rem] leading-[1.78] ${dk ? 'text-white/52' : 'text-slate-500'}`}>
            A systematic ablation study benchmarking{' '}
            <span className={`font-semibold ${dk ? 'text-white/75' : 'text-slate-700'}`}>19 NLP classifiers</span>
            {' '}— Traditional ML, Deep Learning, and Transformers —
            for Somali-language news classification under two controlled stopword conditions.
          </motion.p>

          {/* CTAs */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}
              className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-violet-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-sky-500/25 transition-all hover:scale-[1.04] hover:shadow-sky-500/40 active:scale-[0.99]">
              <Sparkles size={14} /> Explore Results
              <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <button onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
              className={`flex items-center gap-2 rounded-2xl border px-8 py-3.5 text-sm font-bold backdrop-blur-sm transition-all hover:scale-[1.02] ${
                dk
                  ? 'border-white/12 bg-white/[0.05] text-white/75 hover:bg-white/[0.09] hover:text-white'
                  : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}>
              <Zap size={14} /> Open Research Platform
            </button>
          </motion.div>
        </div>

        {/* ── Stats bar ── */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.68 }}
          className="relative z-10 mt-20 w-full max-w-3xl">
          <div className={`overflow-hidden rounded-2xl border backdrop-blur-xl ${
            dk ? 'border-white/[0.08] bg-white/[0.04]' : 'border-slate-200/90 bg-white shadow-xl shadow-slate-200/60'
          }`}>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {STATS.map((s, i) => (
                <div key={i} className={`px-7 py-5 text-center ${i < 3 ? `border-r ${divider}` : ''}`}>
                  <p className={`text-[1.85rem] font-black ${dk ? 'text-white' : 'text-slate-900'}`}>{s.value}</p>
                  <p className={`mt-1 text-[11px] font-semibold ${dk ? 'text-white/38' : 'text-slate-400'}`}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Scroll cue */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.div animate={{ y: [0, 7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className={`flex h-9 w-5 items-start justify-center rounded-full border p-1.5 ${dk ? 'border-white/18' : 'border-slate-300'}`}>
            <div className={`h-2 w-1 rounded-full ${dk ? 'bg-white/40' : 'bg-slate-400'}`} />
          </motion.div>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════════════════
          RESEARCH OVERVIEW
      ════════════════════════════════════════════════════════ */}
      <section id="research" className="mx-auto max-w-7xl px-6 py-28">
        <SectionHeader badge="Research Overview" badgeClass={dk ? 'border-sky-500/25 bg-sky-500/[0.14] text-sky-400' : 'border-sky-300/60 bg-sky-50 text-sky-600'}
          icon={BookOpen} title="Why Somali NLP?"
          subtitle="Somali is a morphologically rich, low-resource language with fewer than 30 dedicated NLP publications. This research directly addresses that gap with a rigorous, reproducible benchmark." />

        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { icon: Globe, grad: 'from-sky-500 to-cyan-400', glow: 'shadow-sky-500/20', title: 'The Research Gap', body: 'Despite 22 million speakers, Somali NLP resources are scarce. No public benchmark exists for news text classification, leaving the community without a reference for model comparison.' },
            { icon: FlaskConical, grad: 'from-violet-500 to-purple-500', glow: 'shadow-violet-500/20', title: 'Ablation Design', body: 'Two controlled experiments isolate the effect of stopword removal across 19 models spanning Traditional ML, Deep Learning, and Transformers — holding all other variables constant.' },
            { icon: Microscope, grad: 'from-emerald-500 to-teal-500', glow: 'shadow-emerald-500/20', title: 'Explainable AI', body: 'Beyond accuracy, LIME is applied to audit token-level decision patterns — revealing potential dataset biases and making model predictions interpretable to non-technical stakeholders.' },
          ].map(({ icon: Icon, grad, glow, title, body }, i) => (
            <Reveal key={title} delay={i * 0.1}>
              <div className={`h-full p-6 transition-all duration-300 hover:shadow-lg ${card}`}>
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} shadow-xl ${glow}`}>
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="mb-2.5 text-base font-extrabold text-slate-900 dark:text-white">{title}</h3>
                <p className={`text-sm leading-[1.75] ${muted}`}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-6">
          <div className={`p-6 sm:p-8 ${card}`}>
            <h3 className={`mb-5 text-[10px] font-bold uppercase tracking-widest ${vmuted}`}>Research Objectives</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                'Benchmark 19 classifiers on Somali text classification across 8 news categories',
                'Investigate the impact of Somali stopword removal on model performance (ablation study)',
                'Compare Traditional ML, Deep Learning, and Transformer approaches on a low-resource language',
                'Apply LIME explainability to interpret and audit model decision boundaries',
                'Build an interactive research platform for live prediction and result exploration',
                'Contribute an open, reproducible evaluation framework for future Somali NLP research',
              ].map((obj, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dk ? 'bg-sky-500/[0.18]' : 'bg-sky-100'}`}>
                    <CheckCircle2 size={12} className={dk ? 'text-sky-400' : 'text-sky-600'} />
                  </div>
                  <p className={`text-sm leading-[1.6] ${muted}`}>{obj}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════════════════════════════════════
          METHODOLOGY
      ════════════════════════════════════════════════════════ */}
      <section id="methodology" className={`border-y py-24 ${dk ? 'border-white/[0.06] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/70'}`}>
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader badge="Methodology" badgeClass={dk ? 'border-violet-500/25 bg-violet-500/[0.14] text-violet-400' : 'border-violet-300/60 bg-violet-50 text-violet-600'}
            icon={Layers} title="Research Pipeline"
            subtitle="A six-stage end-to-end pipeline from raw Somali news collection to LIME-powered explainability." />

          <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className={`pointer-events-none absolute left-[6%] right-[6%] top-[52px] hidden h-px lg:block ${dk ? 'bg-gradient-to-r from-transparent via-white/8 to-transparent' : 'bg-gradient-to-r from-transparent via-slate-300 to-transparent'}`} />
            {PIPELINE.map(({ icon: Icon, label, desc }, i) => (
              <motion.div key={label}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.08, duration: 0.45 }}
                className={`group relative flex flex-col items-center p-5 text-center transition-all hover:shadow-md ${card}`}>
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-black ring-1 ${
                  dk ? 'bg-[#050D1A] text-white/28 ring-white/[0.07]' : 'bg-white text-slate-400 ring-slate-200'
                }`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ring-1 transition-all ${
                  dk ? 'bg-gradient-to-br from-sky-500/18 to-violet-500/18 ring-white/8 group-hover:from-sky-500/28 group-hover:to-violet-500/28'
                     : 'bg-gradient-to-br from-sky-100 to-violet-100 ring-sky-200 group-hover:from-sky-200 group-hover:to-violet-200'
                }`}>
                  <Icon size={20} className="text-sky-500 dark:text-sky-400" />
                </div>
                <p className="mb-1.5 text-sm font-extrabold text-slate-900 dark:text-white">{label}</p>
                <p className={`text-[11px] leading-[1.6] ${muted}`}>{desc}</p>
              </motion.div>
            ))}
          </div>

          <Reveal delay={0.2} className="mt-10">
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                { color: '#0ea5e9', bgLight: 'bg-sky-50 border-sky-200', title: 'Traditional ML', count: '4 models', desc: 'Sparse linear and ensemble methods with TF-IDF features.', models: ['LinearSVC + TF-IDF', 'Logistic Regression + TF-IDF', 'Random Forest + TF-IDF', 'XGBoost + TF-IDF'] },
                { color: '#f97316', bgLight: 'bg-orange-50 border-orange-200', title: 'Deep Learning', count: '6 models', desc: 'Recurrent networks with distributed word embeddings.', models: ['BiLSTM + Word2Vec', 'BiLSTM + FastText', 'BiLSTM + Keras Emb.', 'BiLSTM + Multilingual', 'BiLSTM (standalone)', 'Mini Transformer (Keras)'] },
                { color: '#7c3aed', bgLight: 'bg-violet-50 border-violet-200', title: 'Transformers', count: '9 models', desc: 'Pre-trained multilingual & Africa-focused models.', models: ['mBERT', 'XLM-RoBERTa', 'AfroXLMR', 'AfriBERTa', 'SomBERTa', 'Mini Transformer (Keras)', '+ Exp 2 variants'] },
              ].map(fam => (
                <div key={fam.title} className={`p-5 ${card}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ background: fam.color }} />
                    <div>
                      <p className="font-extrabold text-slate-900 dark:text-white">{fam.title}</p>
                      <p className={`text-[11px] font-semibold ${vmuted}`}>{fam.count}</p>
                    </div>
                  </div>
                  <p className={`mb-3 text-xs leading-relaxed ${muted}`}>{fam.desc}</p>
                  <div className="space-y-1.5">
                    {fam.models.map(m => (
                      <div key={m} className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/45">
                        <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: fam.color }} />{m}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          EXPERIMENTS
      ════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader badge="Ablation Experiments" badgeClass={dk ? 'border-sky-500/25 bg-sky-500/[0.14] text-sky-400' : 'border-sky-300/60 bg-sky-50 text-sky-600'}
          icon={FlaskConical} title="Two Controlled Experiments"
          subtitle="The only variable between experiments is stopword treatment — isolating its effect on all 19 classifiers simultaneously." />
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { num: '01', label: 'Stopwords Included', grad: 'from-violet-600 via-purple-600 to-indigo-700', lightBadge: 'bg-violet-100 border-violet-300 text-violet-700', darkBadge: 'bg-violet-500/[0.18] border-violet-500/30 text-violet-300', acc: '94.31%', f1: '0.9431', insight: 'Retaining all tokens — including discourse markers and function words — preserves topical and structural signals unique to Somali morphology. This setting achieves peak performance across all 19 models.', bullets: ['Best accuracy: 94.31% (LinearSVC)', 'Stopwords carry topical cues in Somali', 'Deep learning benefits from full vocabulary'] },
            { num: '02', label: 'Stopwords Removed',  grad: 'from-sky-600 via-cyan-600 to-teal-600',         lightBadge: 'bg-sky-100 border-sky-300 text-sky-700',       darkBadge: 'bg-sky-500/[0.18] border-sky-500/30 text-sky-300',       acc: '93.29%', f1: '0.9329', insight: 'Removing a custom Somali stopword list reduces vocabulary noise but also strips contextually relevant function words. Performance drops 1–2% across all families, confirming stopwords are informative in Somali.', bullets: ['Best accuracy: 93.29% (LinearSVC)', '~1–2% accuracy drop vs Experiment 1', 'Transformer gap widens without full vocab'] },
          ].map((e, i) => (
            <Reveal key={e.num} delay={i * 0.1}>
              <div className={`overflow-hidden transition-all hover:shadow-lg ${card}`}>
                <div className={`h-1.5 bg-gradient-to-r ${e.grad}`} />
                <div className="p-7">
                  <div className="mb-5 flex items-start justify-between">
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest ${dk ? e.darkBadge : e.lightBadge}`}>
                      Experiment {e.num}
                    </span>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${e.grad} shadow-lg`}>
                      <FlaskConical size={18} className="text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">{e.label}</h3>
                  <p className={`mt-3 text-sm leading-[1.75] ${muted}`}>{e.insight}</p>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {[{ l: 'Best Acc.', v: e.acc }, { l: 'Best F1', v: e.f1 }, { l: 'Models', v: '19' }].map(({ l, v }) => (
                      <div key={l} className={`rounded-xl p-3 text-center ${dk ? 'bg-white/[0.05]' : 'bg-slate-50'}`}>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${vmuted}`}>{l}</p>
                        <p className="mt-1 text-base font-black text-slate-900 dark:text-white">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 space-y-2">
                    {e.bullets.map(b => (
                      <div key={b} className="flex items-start gap-2.5">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                        <p className={`text-xs ${muted}`}>{b}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          RESULTS
      ════════════════════════════════════════════════════════ */}
      <section id="results" className={`border-y py-24 ${dk ? 'border-white/[0.06] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/70'}`}>
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader badge="Results" badgeClass={dk ? 'border-amber-500/25 bg-amber-500/[0.14] text-amber-400' : 'border-amber-300/60 bg-amber-50 text-amber-600'}
            icon={Trophy} title="Model Leaderboard"
            subtitle="Full rankings across both experiments. Each model scored on accuracy, F1, precision and recall." />

          <div className="grid gap-8 lg:grid-cols-5">
            <Reveal delay={0} className="lg:col-span-3">
              <div className={`h-full p-6 ${card}`}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-extrabold text-slate-900 dark:text-white">Accuracy by Model</p>
                  <div className="flex gap-4">
                    {[['Traditional ML', '#0ea5e9'], ['Transformer', '#7c3aed'], ['Deep Learning', '#f97316']].map(([l, c]) => (
                      <span key={l} className={`flex items-center gap-1.5 text-[10px] font-semibold ${vmuted}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
                <p className={`mb-5 text-[11px] ${vmuted}`}>Top 8 models — both experiments</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={CHART_DATA} layout="vertical" margin={{ top: 0, right: 52, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} horizontal={false} />
                      <XAxis type="number" domain={[80, 100]} tick={{ fontSize: 10, fill: dk ? 'rgba(255,255,255,0.3)' : '#94a3b8' }} stroke={dk ? 'rgba(255,255,255,0.06)' : '#e2e8f0'} tickFormatter={v => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: dk ? 'rgba(255,255,255,0.38)' : '#94a3b8' }} width={120} stroke={dk ? 'rgba(255,255,255,0.06)' : '#e2e8f0'} />
                      <Tooltip contentStyle={{ background: dk ? '#0D1B2E' : '#fff', border: `1px solid ${dk ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, borderRadius: 10, fontSize: 12, color: dk ? '#fff' : '#1e293b' }}
                        formatter={(v: number) => [`${v.toFixed(2)}%`, 'Accuracy']}
                        labelStyle={{ color: dk ? 'rgba(255,255,255,0.65)' : '#64748b' }} />
                      <Bar dataKey="accuracy" radius={[0, 5, 5, 0]}>
                        {CHART_DATA.map((d, i) => <Cell key={i} fill={FAMILY_COLOR[d.family] ?? '#0ea5e9'} fillOpacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1} className="lg:col-span-2">
              <div className={`h-full overflow-hidden ${card}`}>
                <div className={`border-b px-5 py-4 ${divider}`}>
                  <p className="font-extrabold text-slate-900 dark:text-white">Top 10 Rankings</p>
                  <p className={`text-[11px] ${vmuted}`}>Sorted by accuracy</p>
                </div>
                <div className={`divide-y ${dk ? 'divide-white/[0.04]' : 'divide-slate-100'}`}>
                  {TOP_MODELS.map((m, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                    const fc = FAMILY_COLOR[m.family] ?? '#0ea5e9'
                    return (
                      <div key={`${m.exp}-${m.model}`} className={`flex items-center gap-3 px-5 py-3 transition-colors ${i < 3 ? (dk ? 'bg-amber-500/[0.03]' : 'bg-amber-50/60') : ''} ${dk ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50'}`}>
                        <div className="w-7 shrink-0 text-center">
                          {medal ? <span className="text-sm">{medal}</span>
                            : <span className={`text-xs font-bold ${vmuted}`}>#{i + 1}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-bold text-slate-800 dark:text-white">{m.model.replace(/_/g, ' ')}</p>
                          <span className="text-[10px] font-semibold" style={{ color: fc }}>
                            {m.family === 'traditional_ml' ? 'Trad. ML' : m.family === 'transformers' ? 'Transformer' : 'Deep L.'} · {m.exp}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs font-black text-slate-900 dark:text-white">{m.accuracy}%</p>
                          <p className={`font-mono text-[10px] ${vmuted}`}>F1 {m.f1}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className={`border-t px-5 py-3 text-center ${divider}`}>
                  <button onClick={() => navigate(isAuthenticated ? '/experiments' : '/login')}
                    className="text-[11px] font-bold text-sky-600 transition hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300">
                    Full leaderboard in platform →
                  </button>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.15} className="mt-8">
            <div className={`p-6 ${card}`}>
              <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-extrabold text-slate-900 dark:text-white">Family Comparison Radar</p>
                  <p className={`text-[11px] ${vmuted}`}>Best-in-family scores across 6 dimensions</p>
                </div>
                <div className="flex gap-5">
                  {[['Traditional ML', '#0ea5e9'], ['Transformers', '#7c3aed'], ['Deep Learning', '#f97316']].map(([l, c]) => (
                    <span key={l} className={`flex items-center gap-1.5 text-[11px] font-semibold ${vmuted}`}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={RADAR_DATA}>
                    <PolarGrid stroke={dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'} />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: dk ? 'rgba(255,255,255,0.4)' : '#64748b' }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: dk ? 'rgba(255,255,255,0.18)' : '#94a3b8' }} />
                    <Radar name="Traditional ML" dataKey="Traditional ML" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.12} strokeWidth={2} />
                    <Radar name="Transformers"   dataKey="Transformers"   stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.12} strokeWidth={2} />
                    <Radar name="Deep Learning"  dataKey="Deep Learning"  stroke="#f97316" fill="#f97316" fillOpacity={0.12} strokeWidth={2} />
                    <Tooltip contentStyle={{ background: dk ? '#0D1B2E' : '#fff', border: `1px solid ${dk ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: dk ? 'rgba(255,255,255,0.65)' : '#64748b' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          KEY FINDINGS
      ════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader badge="Key Findings" badgeClass={dk ? 'border-emerald-500/25 bg-emerald-500/[0.14] text-emerald-400' : 'border-emerald-300/60 bg-emerald-50 text-emerald-600'}
          icon={Star} title="What We Discovered"
          subtitle="Four major findings that advance understanding of NLP approaches for low-resource Somali language classification." />
        <div className="grid gap-5 sm:grid-cols-2">
          {FINDINGS.map(({ icon: Icon, lightColor, darkColor, lightBg, darkBg, lightBorder, darkBorder, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className={`rounded-2xl border p-6 transition-all hover:shadow-md ${dk ? darkBg : lightBg} ${dk ? darkBorder : lightBorder}`}>
                <div className="mb-4 flex items-start gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${dk ? 'bg-white/[0.08]' : 'bg-white/60'}`}>
                    <Icon size={20} className={dk ? darkColor : lightColor} />
                  </div>
                  <h3 className={`pt-1.5 text-base font-extrabold ${dk ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                </div>
                <p className={`text-sm leading-[1.75] ${muted}`}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          DATASET
      ════════════════════════════════════════════════════════ */}
      <section id="dataset" className={`border-y py-24 ${dk ? 'border-white/[0.06] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/70'}`}>
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader badge="Dataset" badgeClass={dk ? 'border-teal-500/25 bg-teal-500/[0.14] text-teal-400' : 'border-teal-300/60 bg-teal-50 text-teal-600'}
            icon={Database} title="Somali News Corpus"
            subtitle="A curated, annotated dataset of Somali news articles — one of the few publicly usable Somali NLP benchmarks." />
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-5">
              <Reveal>
                <div className="grid grid-cols-2 gap-4">
                  {[{ label: 'Total Articles', value: '3 000+', icon: Database }, { label: 'Categories', value: '8 classes', icon: Layers }, { label: 'Language', value: 'Somali (so)', icon: Globe }, { label: 'Train / Test', value: '80 / 20 %', icon: GitBranch }].map(({ label, value, icon: Icon }) => (
                    <div key={label} className={`rounded-2xl p-4 ${card}`}>
                      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${dk ? 'bg-teal-500/[0.18]' : 'bg-teal-100'}`}>
                        <Icon size={15} className="text-teal-600 dark:text-teal-400" />
                      </div>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${vmuted}`}>{label}</p>
                      <p className="mt-0.5 text-base font-black text-slate-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={0.1}>
                <div className={`p-5 ${card}`}>
                  <p className={`mb-3 text-[11px] font-bold uppercase tracking-widest ${vmuted}`}>Preprocessing Steps</p>
                  <div className="space-y-2">
                    {['Unicode normalisation for Somali Latin script', 'Punctuation and HTML entity removal', 'Two-path stopword treatment (Experiment 1 vs 2)', 'TF-IDF vectorisation (unigram + bigram)', 'Word2Vec / FastText embeddings (dim=100)', 'Subword tokenisation for transformer models'].map(s => (
                      <div key={s} className="flex items-start gap-2.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                        <p className={`text-xs ${muted}`}>{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
              <Reveal delay={0.15}>
                <div className={`flex items-start gap-3 rounded-2xl border p-4 ${dk ? 'border-emerald-500/25 bg-emerald-500/[0.14]' : 'border-emerald-200 bg-emerald-50'}`}>
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className={`text-xs leading-[1.7] ${muted}`}>
                    The dataset is used exclusively for academic research. Articles were collected from publicly
                    available Somali news sources and annotated by native speakers with domain expertise.
                  </p>
                </div>
              </Reveal>
            </div>
            <Reveal delay={0.1}>
              <div className={`p-6 ${card}`}>
                <p className="mb-5 font-extrabold text-slate-900 dark:text-white">Category Distribution</p>
                <div className="space-y-3.5">
                  {CATEGORIES.map((cat, i) => (
                    <div key={cat.name}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black text-white" style={{ background: cat.color }}>{i + 1}</div>
                          <span className={`text-sm font-semibold ${muted}`}>{cat.name}</span>
                        </div>
                        <span className={`font-mono text-xs font-bold ${vmuted}`}>~{cat.pct}%</span>
                      </div>
                      <div className={`h-2 w-full overflow-hidden rounded-full ${dk ? 'bg-white/[0.05]' : 'bg-slate-100'}`}>
                        <motion.div initial={{ width: 0 }} whileInView={{ width: `${cat.pct * 3}%` }}
                          viewport={{ once: true }} transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.06 }}
                          className="h-full rounded-full" style={{ background: cat.color, opacity: 0.8 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className={`mt-5 text-[11px] ${vmuted}`}>Approximate distribution · balanced 80/20 train/test split</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TECHNOLOGIES
      ════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader badge="Technology Stack" badgeClass={dk ? 'border-sky-500/25 bg-sky-500/[0.14] text-sky-400' : 'border-sky-300/60 bg-sky-50 text-sky-600'}
          icon={Cpu} title="Built With"
          subtitle="A full-stack research platform combining state-of-the-art NLP libraries with a production-grade web application." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TECHNOLOGIES.map((group, i) => (
            <Reveal key={group.group} delay={i * 0.08}>
              <div className={`h-full p-5 ${card}`}>
                <p className={`mb-4 text-[10px] font-bold uppercase tracking-widest ${vmuted}`}>{group.group}</p>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${dk ? 'border-white/[0.05] bg-white/[0.03]' : 'border-slate-100 bg-slate-50'}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span className={`text-xs font-semibold ${muted}`}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TEAM
      ════════════════════════════════════════════════════════ */}
      <section id="team" className={`border-y py-24 ${dk ? 'border-white/[0.06] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/70'}`}>
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader badge="Research Team" badgeClass={dk ? 'border-sky-500/25 bg-sky-500/[0.14] text-sky-400' : 'border-sky-300/60 bg-sky-50 text-sky-600'}
            icon={Users} title="Meet the Researchers"
            subtitle="Four final-year Computer Science students united by a shared mission to advance NLP for underrepresented languages." />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map((member, i) => (
              <Reveal key={member.name} delay={i * 0.1}>
                <div className={`group flex h-full flex-col p-6 text-center transition-all duration-300 hover:shadow-xl ${card}`}>
                  <div className="relative mx-auto mb-5">
                    <div className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${member.grad} shadow-xl ${member.shadow} text-[1.7rem] font-black text-white transition-transform duration-300 group-hover:scale-105`}>
                      {member.initials}
                    </div>
                    <div className={`absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full ring-2 ${dk ? 'bg-[#050D1A] ring-white/10' : 'bg-white ring-slate-200'}`}>
                      <GraduationCap size={13} className={muted} />
                    </div>
                  </div>
                  <p className="font-extrabold leading-snug text-slate-900 dark:text-white">{member.name}</p>
                  <p className={`mt-1.5 text-[11px] leading-relaxed ${vmuted}`}>{member.role}</p>
                  <div className="mt-5 flex-1">
                    <p className={`mb-2.5 text-[9px] font-bold uppercase tracking-widest ${vmuted}`}>Contributions</p>
                    <div className="space-y-1.5">
                      {member.contrib.map(c => (
                        <div key={c} className="flex items-center justify-center gap-1.5">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r ${member.grad}`} />
                          <span className={`text-[11px] ${muted}`}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.3} className="mt-10">
            <div className={`mx-auto max-w-xl p-6 text-center ${card}`}>
              <GraduationCap size={22} className={`mx-auto mb-3 ${vmuted}`} />
              <p className="font-semibold text-slate-700 dark:text-white/60">
                Final Year Project · BSc Computer Science
              </p>
              <p className={`mt-1.5 text-xs leading-relaxed ${vmuted}`}>
                Submitted in partial fulfilment of the requirements for the degree of<br />
                Bachelor of Science in Computer Science · Academic Year 2022–2026
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CTA
      ════════════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-500 to-violet-600 p-12 text-center shadow-2xl shadow-sky-500/25">
              <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/6 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-violet-300/10 blur-2xl" />
              <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
              <div className="relative">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80">
                  <Zap size={11} /> Interactive Research Platform
                </div>
                <h2 className="text-2xl font-black text-white sm:text-3xl lg:text-4xl">Try the Platform Live</h2>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-[1.8] text-white/70">
                  Run real-time Somali text classification with any of the 19 models, explore the full experiment
                  leaderboard, view LIME token explanations, and browse confusion matrices.
                </p>
                <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <button onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
                    className="group flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-sm font-bold text-sky-700 shadow-xl transition-all hover:scale-[1.03]">
                    {isAuthenticated ? 'Go to Dashboard' : 'Sign In to Platform'}
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                  {!isAuthenticated && (
                    <button onClick={() => navigate('/register')}
                      className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-white/18">
                      Create Free Account
                    </button>
                  )}
                </div>
                <p className="mt-5 text-[11px] text-white/38">No setup required · Works in your browser · All 19 models available</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════ */}
      <footer className={`border-t py-12 ${dk ? 'border-white/[0.06] bg-[#030810]' : 'border-slate-200 bg-slate-50'}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <LogoMark size={32} />
                <div className="leading-none">
                  <p className="text-[13px] font-black text-slate-900 dark:text-white">
                    Som<span style={{ backgroundImage: 'linear-gradient(90deg,#0ea5e9,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NLP</span>
                  </p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${vmuted}`}>Research Platform</p>
                </div>
              </div>
              <p className={`mt-3 text-xs leading-relaxed ${vmuted}`}>
                A final-year research project benchmarking NLP classifiers for the Somali language · BSc CS 2022–2026.
              </p>
            </div>
            <div>
              <p className={`mb-3 text-[10px] font-bold uppercase tracking-widest ${vmuted}`}>Navigation</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[['Research', 'research'], ['Methodology', 'methodology'], ['Results', 'results'], ['Dataset', 'dataset'], ['Team', 'team']].map(([l, id]) => (
                  <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}
                    className={`text-left text-xs transition hover:text-sky-600 dark:hover:text-sky-400 ${vmuted}`}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <p className={`mb-3 text-[10px] font-bold uppercase tracking-widest ${vmuted}`}>Platform</p>
              <div className="space-y-1.5">
                {[['Dashboard', '/dashboard'], ['Predict', '/predict'], ['Experiments', '/experiments'], ['Models', '/models'], ['XAI / Explainability', '/xai']].map(([l, path]) => (
                  <button key={path} onClick={() => navigate(isAuthenticated ? path : '/login')}
                    className={`flex w-full items-center gap-1.5 text-left text-xs transition hover:text-sky-600 dark:hover:text-sky-400 ${vmuted}`}>
                    <ExternalLink size={10} /> {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`mt-10 flex flex-col items-center gap-3 border-t pt-8 sm:flex-row sm:justify-between ${divider}`}>
            <p className={`text-[11px] ${vmuted}`}>© 2024 Somali NLP Research Team · BSc Computer Science 2022–2026</p>
            <p className={`text-[11px] ${vmuted}`}>Moscab · Ayaan · Aisha · Abdulahi</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
