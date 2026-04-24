import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { parsePptxTemplate } from '@axis/ingestion'

const router = Router()

// Store uploads in memory (max 20 MB for a .pptx)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        || file.originalname.toLowerCase().endsWith('.pptx')) {
      cb(null, true)
    } else {
      cb(new Error('Only .pptx files are accepted — PDF cannot be used as a template'))
    }
  },
})

/**
 * GET /api/pitch-deck/template — return the user's current template (without the binary)
 */
router.get('/template', async (req: Request, res: Response) => {
  try {
    const template = await prisma.pitchDeckTemplate.findFirst({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, themeJson: true, slotMap: true, createdAt: true },
    })
    res.json({ template: template ?? null, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch template', code: 'TEMPLATE_FETCH_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * POST /api/pitch-deck/template — upload a .pptx template file
 */
router.post('/template', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE', requestId: req.requestId })
      return
    }

    const buffer = req.file.buffer
    let parsed: Awaited<ReturnType<typeof parsePptxTemplate>>
    try {
      parsed = parsePptxTemplate(buffer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      res.status(422).json({ error: 'Could not parse PPTX file — ensure it is a valid .pptx', code: 'PARSE_ERROR', details: msg, requestId: req.requestId })
      return
    }

    // Delete the user's previous template to avoid accumulation
    await prisma.pitchDeckTemplate.deleteMany({ where: { userId: req.userId! } })

    const template = await prisma.pitchDeckTemplate.create({
      data: {
        userId:     req.userId!,
        name:       req.file.originalname,
        pptxBuffer: buffer,
        themeJson:  parsed.theme as object,
        slotMap:    parsed.slotMap as object,
      },
      select: { id: true, name: true, themeJson: true, slotMap: true, createdAt: true },
    })

    res.status(201).json({ template, slideCount: parsed.slideCount, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to save template', code: 'TEMPLATE_SAVE_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * DELETE /api/pitch-deck/template — remove the user's template (revert to default styling)
 */
router.delete('/template', async (req: Request, res: Response) => {
  try {
    await prisma.pitchDeckTemplate.deleteMany({ where: { userId: req.userId! } })
    res.json({ ok: true, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to delete template', code: 'TEMPLATE_DELETE_ERROR', details: msg, requestId: req.requestId })
  }
})

export { router as pitchDeckTemplateRouter }
