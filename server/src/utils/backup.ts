import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

// Database backups. Everything the business owns (bookings, ledger, stock, staff, guests…) lives in
// ONE PostgreSQL database — without a backup, a failed disk or a mistaken delete loses it all.
// Backups are `pg_dump -Fc` archives (compressed, restorable with pg_restore), kept in
// server/backups/ with automatic daily runs and a retention limit.

export const BACKUP_DIR = path.join(process.cwd(), 'backups')
const NAME_RE = /^hospitality_erp_\d{8}_\d{6}(_[a-z]+)?\.dump$/

export interface BackupInfo { name: string; size_bytes: number; created_at: string; kind: 'manual' | 'auto' | 'before-restore' }

const keepCount = () => Math.max(3, Number(process.env.BACKUP_KEEP ?? 14))

// pg_dump is part of every PostgreSQL install but is usually not on PATH on Windows
export function findPgTool(tool: 'pg_dump' | 'pg_restore'): string {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool
  const fromEnv = process.env[tool === 'pg_dump' ? 'PG_DUMP_PATH' : 'PG_RESTORE_PATH']
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv

  const dirs: string[] = (process.env.PATH ?? '').split(path.delimiter)
  const roots = process.platform === 'win32'
    ? ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL']
    : ['/usr/lib/postgresql', '/opt/homebrew/opt', '/Applications/Postgres.app/Contents/Versions']
  for (const root of roots) {
    try {
      for (const v of fs.readdirSync(root).sort().reverse()) dirs.push(path.join(root, v, 'bin'))
    } catch { /* root not installed */ }
  }
  for (const d of dirs) {
    const p = path.join(d, exe)
    if (d && fs.existsSync(p)) return p
  }
  throw new Error(`${tool} was not found. Install the PostgreSQL client tools or set ${tool === 'pg_dump' ? 'PG_DUMP_PATH' : 'PG_RESTORE_PATH'} in .env`)
}

const stamp = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// Only names this module produced are ever read, downloaded or deleted — no path traversal
export const isBackupName = (n: string) => NAME_RE.test(n)
export const backupPath = (n: string) => path.join(BACKUP_DIR, n)

const kindOf = (name: string): BackupInfo['kind'] =>
  name.endsWith('_auto.dump') ? 'auto' : name.endsWith('_before.dump') ? 'before-restore' : 'manual'

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs.readdirSync(BACKUP_DIR).filter(isBackupName).map(name => {
    const st = fs.statSync(backupPath(name))
    return { name, size_bytes: st.size, created_at: st.mtime.toISOString(), kind: kindOf(name) }
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

let running = false
export const backupInProgress = () => running

export async function runBackup(kind: 'manual' | 'auto' = 'manual'): Promise<BackupInfo> {
  if (running) throw new Error('A backup is already running — wait for it to finish')
  running = true
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const name = `hospitality_erp_${stamp()}${kind === 'auto' ? '_auto' : ''}.dump`
    const file = backupPath(name)
    const tmp = file + '.partial'   // never leave a half-written file that looks like a backup

    await new Promise<void>((resolve, reject) => {
      const args = ['-h', process.env.DB_HOST ?? 'localhost', '-p', String(process.env.DB_PORT ?? 5432),
                    '-U', process.env.DB_USER ?? 'postgres', '-d', process.env.DB_NAME ?? 'hospitality_erp',
                    '-Fc', '--no-owner', '-f', tmp]
      const child = spawn(findPgTool('pg_dump'), args, { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD ?? '' } })
      let err = ''
      child.stderr.on('data', d => { err += String(d) })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`pg_dump failed (${code}): ${err.trim().slice(0, 300)}`)))
    }).catch(e => { try { fs.unlinkSync(tmp) } catch { /* nothing written */ } throw e })

    fs.renameSync(tmp, file)
    pruneBackups()
    const st = fs.statSync(file)
    return { name, size_bytes: st.size, created_at: st.mtime.toISOString(), kind }
  } finally { running = false }
}

// Keep the newest N automatic backups; manual ones are never deleted automatically
export function pruneBackups() {
  const autos = listBackups().filter(b => b.kind === 'auto')
  for (const b of autos.slice(keepCount())) { try { fs.unlinkSync(backupPath(b.name)) } catch { /* already gone */ } }
}

// ── Daily scheduler ───────────────────────────────────────────────────────────
// Every 30 minutes: if the newest backup is older than 24 h, take one. Also checked shortly after
// start-up, so a machine that is only switched on during the day still gets backed up.
export function startBackupScheduler() {
  if (process.env.BACKUP_AUTO === 'false') return
  const tick = async () => {
    try {
      const newest = listBackups()[0]
      const age = newest ? Date.now() - new Date(newest.created_at).getTime() : Infinity
      if (age > 24 * 3600_000 && !running) {
        const b = await runBackup('auto')
        console.log(`[backup] automatic backup created: ${b.name} (${Math.round(b.size_bytes / 1024)} KB)`)
      }
    } catch (e) { console.error('[backup] automatic backup failed:', (e as Error).message) }
  }
  setTimeout(tick, 90_000).unref()
  setInterval(tick, 30 * 60_000).unref()
}
