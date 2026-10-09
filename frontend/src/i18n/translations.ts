// ─── i18n dictionary ──────────────────────────────────────────────────────────
// English · Somali. Add a key here once, use it anywhere via t('key').

export type Lang = 'en' | 'so'

export interface LanguageMeta {
  code: Lang
  label: string
  flag: string
  dir: 'ltr' | 'rtl'
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', label: 'English',  flag: '🇬🇧', dir: 'ltr' },
  { code: 'so', label: 'Soomaali', flag: '🇸🇴', dir: 'ltr' },
]

export const LANG_STORAGE_KEY = 'erp_lang'

type Entry = Record<Lang, string>

export const TRANSLATIONS: Record<string, Entry> = {
  // ── Navigation ──────────────────────────────────────────────────────────────
  'nav.dashboard':      { en: 'Dashboard',        so: 'Dashboorka' },
  'nav.hotel':          { en: 'Hotel',            so: 'Hoteelka' },
  'nav.bookings':       { en: 'Bookings',         so: 'Ballansyada' },
  'nav.rooms':          { en: 'Rooms',            so: 'Qolalka' },
  'nav.guests':         { en: 'Guests',           so: 'Martida' },
  'nav.housekeeping':   { en: 'Housekeeping',     so: 'Nadaafadda' },
  'nav.restaurant':     { en: 'Restaurant',       so: 'Maqaayadda' },
  'nav.pos':            { en: 'POS Cashier',      so: 'Khasnadda POS' },
  'nav.ordersTables':   { en: 'Orders & Tables',  so: 'Dalabaadka & Miisaska' },
  'nav.kitchen':        { en: 'Kitchen',          so: 'Jikada' },
  'nav.stockControl':   { en: 'Stock Control',    so: 'Xakamaynta Kaydka' },
  'nav.orders':         { en: 'Orders',           so: 'Dalabaadka' },
  'nav.tables':         { en: 'Tables',           so: 'Miisaska' },
  'nav.menu':           { en: 'Menu',             so: 'Menyuuga' },
  'nav.inventory':      { en: 'Inventory',        so: 'Kaydka' },
  'nav.suppliers':      { en: 'Suppliers',        so: 'Alaab-qeybiyeyaal' },
  'nav.warehouses':     { en: 'Warehouses',       so: 'Bakhaarada' },
  'nav.items':          { en: 'Items',            so: 'Alaabta' },
  'nav.stock':          { en: 'Stock',            so: 'Kaydka Alaabta' },
  'nav.purchaseOrders': { en: 'Purchase Orders',  so: 'Dalabka Iibsiga' },
  'nav.finance':        { en: 'Finance',          so: 'Maaliyadda' },
  'nav.financeHr':      { en: 'Finance & HR',     so: 'Maaliyadda & HR' },
  'nav.accounts':       { en: 'Accounts',         so: 'Xisaabaadka' },
  'nav.receipts':       { en: 'Receipts',         so: 'Rasiidyada' },
  'nav.expenses':       { en: 'Expenses',         so: 'Kharashyada' },
  'nav.salary':         { en: 'Salary',           so: 'Mushaharka' },
  'nav.invoices':       { en: 'Invoices',         so: 'Qaansheegyada' },
  'nav.transactions':   { en: 'Transactions',     so: 'Dhaqdhaqaaqa Lacagta' },
  'nav.hr':             { en: 'HR',               so: 'Shaqaalaha' },
  'nav.staff':          { en: 'Staff',            so: 'Shaqaalaha' },
  'nav.payroll':        { en: 'Payroll',          so: 'Mushahar-bixinta' },
  'nav.system':         { en: 'System',           so: 'Nidaamka' },
  'nav.settings':       { en: 'Settings',         so: 'Dejinta' },
  'nav.systems':        { en: 'Systems',          so: 'Nidaamyada' },
  'nav.reports':        { en: 'Reports',          so: 'Warbixinnada' },
  'nav.usersAccess':    { en: 'Users & Access',   so: 'Isticmaalayaasha' },
  'nav.moduleConfig':   { en: 'Module Config',    so: 'Habaynta Qaybaha' },
  'nav.auditLogs':      { en: 'Audit Logs',       so: 'Diiwaanka Isbeddelada' },
  'nav.home':           { en: 'Home',             so: 'Bogga Hore' },

  // ── Common ──────────────────────────────────────────────────────────────────
  'common.search':        { en: 'Search',        so: 'Raadi' },
  'common.notifications': { en: 'Notifications', so: 'Ogeysiisyada' },
  'common.viewAll':       { en: 'View all',      so: 'Dhammaan arag' },
  'common.new':           { en: 'new',           so: 'cusub' },
  'common.language':      { en: 'Language',      so: 'Luqadda' },

  // ── Branch switcher ─────────────────────────────────────────────────────────
  'branch.switch':    { en: 'Switch Branch',  so: 'Beddel Laanta' },
  'branch.your':      { en: 'Your branches',  so: 'Laamahaaga' },
  'branch.current':   { en: 'Current',        so: 'Hadda' },
  'branch.switching': { en: 'Switching…',     so: 'Waa la beddelayaa…' },

  // ── Sign out ────────────────────────────────────────────────────────────────
  'signout.title':    { en: 'Sign out',        so: 'Ka bax' },
  'signout.subtitle': {
    en: 'You are about to leave the system.',
    so: 'Waxaad ka baxaysaa nidaamka.',
  },
  'signout.warning': {
    en: 'Are you sure you want to sign out? You will need to enter your credentials to access the system again.',
    so: 'Ma hubtaa inaad ka baxayso? Waxaad u baahan doontaa inaad xogtaada mar kale geliso si aad u gasho nidaamka.',
  },
  'signout.stay':    { en: 'Stay Signed In', so: 'Sii Joog' },
  'signout.confirm': { en: 'Sign Out',       so: 'Ka Bax' },

  // ── Login page ──────────────────────────────────────────────────────────────
  'login.title':    { en: 'Sign in',  so: 'Soo gal' },
  'login.subtitle': {
    en: 'Enter your credentials to access the system',
    so: 'Geli xogtaada si aad u gasho nidaamka',
  },
  'login.email':    { en: 'Email address', so: 'Cinwaanka iimaylka' },
  'login.password': { en: 'Password',      so: 'Furaha sirta' },
  'login.submit':   { en: 'Sign in to your account', so: 'Gal akoonkaaga' },
  'login.demo':     { en: 'Quick Demo Access', so: 'Gelitaan Tijaabo Degdeg ah' },
  'login.fillBoth': {
    en: 'Please enter your email and password.',
    so: 'Fadlan geli iimaylkaaga iyo furahaaga sirta.',
  },
  'login.invalid': {
    en: 'Invalid credentials. Please try again.',
    so: 'Xog khaldan. Fadlan isku day mar kale.',
  },
  'login.rights': { en: 'All rights reserved', so: 'Xuquuqda oo dhan way xafidan yihiin' },
}

export type TKey = keyof typeof TRANSLATIONS

export function translate(key: string, lang: Lang): string {
  const entry = TRANSLATIONS[key]
  if (!entry) return key
  return entry[lang] || entry.en
}
