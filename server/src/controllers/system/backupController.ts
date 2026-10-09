import { Request, Response } from 'express'
import fs from 'fs'
import { listBackups, runBackup, isBackupName, backupPath, backupInProgress, findPgTool } from '../../utils/backup'
import { logAudit } from '../../utils/audit'

// Backups (Systems → Backup). Administrators only — a dump contains the whole database.

export async function getBackups(_req: Request, res: Response) {
  const list = listBackups()
  let tools = true
  try { findPgTool('pg_dump') } catch { tools = false }
  return res.json({
    success: true,
    data: {
      backups: list,
      latest: list[0] ?? null,
      auto_enabled: process.env.BACKUP_AUTO !== 'false',
      keep: Math.max(3, Number(process.env.BACKUP_KEEP ?? 14)),
      running: backupInProgress(),
      tools_available: tools,
      database: process.env.DB_NAME ?? 'hospitality_erp',
    },
  })
}

export async function createBackup(req: Request, res: Response) {
  const { userId, branchId } = req.auth!
  try {
    const b = await runBackup('manual')
    logAudit({ userId, branchId, action: 'BACKUP_CREATED', req, newValues: { name: b.name, size_bytes: b.size_bytes } })
    return res.status(201).json({ success: true, data: b })
  } catch (err) {
    const msg = (err as Error).message
    return res.status(/already running/.test(msg) ? 409 : 500).json({ success: false, message: msg })
  }
}

export async function downloadBackup(req: Request, res: Response) {
  const { name } = req.params
  if (!isBackupName(name) || !fs.existsSync(backupPath(name))) {
    return res.status(404).json({ success: false, message: 'Backup not found' })
  }
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: 'BACKUP_DOWNLOADED', req, newValues: { name } })
  return res.download(backupPath(name), name)
}

export async function deleteBackup(req: Request, res: Response) {
  const { name } = req.params
  if (!isBackupName(name) || !fs.existsSync(backupPath(name))) {
    return res.status(404).json({ success: false, message: 'Backup not found' })
  }
  // never delete the only copy
  if (listBackups().length <= 1) {
    return res.status(409).json({ success: false, message: 'This is your only backup — take a new one before deleting it.' })
  }
  fs.unlinkSync(backupPath(name))
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: 'BACKUP_DELETED', req, newValues: { name } })
  return res.json({ success: true })
}
