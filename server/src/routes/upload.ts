import { Request, Response } from 'express'
import { safeRouter } from '../utils/safeRouter'
import multer from 'multer'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { requireAuth, requireRole } from '../middleware/auth'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const MAX_BYTES = 25 * 1024 * 1024

// Files are judged by their CONTENT (sharp decodes them), never by the browser's
// Content-Type — browsers label images inconsistently (image/pjpeg, application/octet-stream,
// empty for .svg/.avif…), and the old mimetype whitelist silently refused perfectly good photos.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
})

export const uploadRouter = safeRouter()
uploadRouter.use(requireAuth)

interface Preset { width: number; height?: number; fit: 'inside' | 'cover'; quality: number }

// Every uploaded image is decoded, auto-rotated from EXIF, resized (never enlarged) and
// stored as WebP — a 10 MB phone photo typically lands well under 200 KB.
async function processToWebp(buffer: Buffer, p: Preset) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const filePath = path.join(UPLOAD_DIR, name)
  const info = await sharp(buffer, { failOn: 'none', animated: false })
    .rotate() // respect EXIF orientation from phone cameras
    .resize({ width: p.width, height: p.height, fit: p.fit, withoutEnlargement: true })
    .webp({ quality: p.quality, alphaQuality: 100 })  // keeps transparency (logos on a white receipt)
    .toFile(filePath)
  return { name, info }
}

const uploadErrorMessage = (err: any) =>
  err?.code === 'LIMIT_FILE_SIZE'
    ? `That file is too large — please use an image under ${MAX_BYTES / 1024 / 1024} MB.`
    : 'The file could not be uploaded. Please try again.'

const run = (req: Request, res: Response, next: (e?: unknown) => void) =>
  upload.single('file')(req, res, (err: any) => {
    if (err) return res.status(400).json({ success: false, message: uploadErrorMessage(err) })
    if (!req.file) return res.status(400).json({ success: false, message: 'No file was received — choose an image first.' })
    next()
  })

const NOT_AN_IMAGE = 'That file is not a readable image. Use a JPG, PNG, WebP, GIF, SVG or AVIF picture.'

// ID documents, menu photos, avatars — general purpose
uploadRouter.post('/document', run, async (req: Request, res: Response) => {
  try {
    const { name, info } = await processToWebp(req.file!.buffer, { width: 1200, fit: 'inside', quality: 80 })
    return res.json({
      success: true, url: `/uploads/documents/${name}`,
      original_bytes: req.file!.size, optimized_bytes: info.size,
    })
  } catch (err) {
    console.error('image processing failed:', err)
    return res.status(400).json({ success: false, message: NOT_AN_IMAGE })
  }
})

// Company logo / banner (Systems → Company Info). Printed on receipts and documents, so:
//   logo   → fits inside 800×400, keeps its transparency
//   banner → up to 2000 px wide, never cropped, never taller than 700 px
// Whatever the original shape, the picture is fitted — never refused for its dimensions.
uploadRouter.post('/branding', requireRole('org_admin'), run, async (req: Request, res: Response) => {
  const kind = req.body?.kind === 'banner' ? 'banner' : 'logo'
  const preset: Preset = kind === 'logo'
    ? { width: 800, height: 400, fit: 'inside', quality: 92 }
    : { width: 2000, height: 700, fit: 'inside', quality: 88 }
  try {
    const { name, info } = await processToWebp(req.file!.buffer, preset)
    return res.json({
      success: true, kind, url: `/uploads/documents/${name}`,
      width: info.width, height: info.height,
      original_bytes: req.file!.size, optimized_bytes: info.size,
    })
  } catch (err) {
    console.error('branding image processing failed:', err)
    return res.status(400).json({ success: false, message: NOT_AN_IMAGE })
  }
})
