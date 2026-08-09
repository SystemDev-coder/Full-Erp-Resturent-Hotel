import { Router, Request, Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { requireAuth } from '../middleware/auth'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// Keep uploads in memory — sharp writes the optimized file itself, so the
// original large upload never touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // accept up to 15 MB — we compress it down
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    cb(null, allowed.includes(file.mimetype))
  },
})

export const uploadRouter = Router()
uploadRouter.use(requireAuth)

// Every uploaded image is automatically optimized:
//   · resized to max 1200px wide (never enlarged)
//   · converted to WebP at quality 80
// A 10 MB photo typically lands well under 200 KB with no visible loss.
uploadRouter.post('/document', (req: Request, res: Response, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Image is too large — please use a file under 15MB.' })
      }
      return res.status(400).json({ success: false, message: 'Could not upload the image. Please try a different file (JPG, PNG, or WebP only).' })
    }
    next()
  })
}, async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded or unsupported format (JPG, PNG, WebP only)' })
  }

  try {
    const name     = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
    const filePath = path.join(UPLOAD_DIR, name)

    const info = await sharp(req.file.buffer)
      .rotate() // respect EXIF orientation from phone cameras
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filePath)

    return res.json({
      success: true,
      url: `/uploads/documents/${name}`,
      original_bytes:  req.file.size,
      optimized_bytes: info.size,
    })
  } catch (err) {
    console.error('image optimization failed:', err)
    return res.status(400).json({ success: false, message: 'Could not process the image — is it a valid picture?' })
  }
})
