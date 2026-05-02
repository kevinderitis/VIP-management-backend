import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCheckinService } from '../services/checkin.service.js'
import { readMrzBestEffort } from '../services/passport-mrz.service.js'
import { getParam } from '../utils/http.js'

const uploadsDir = path.join(process.cwd(), 'uploads', 'passports')
const exportDir = path.join(process.cwd(), 'exports')
fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(exportDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDir),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg'
    callback(
      null,
      `passport_${Date.now()}_${Math.random().toString(16).slice(2)}${extension}`,
    )
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype)
    if (allowed) {
      callback(null, true)
      return
    }

    callback(new Error('Only JPG and PNG files are allowed'))
  },
})

const router = Router()
const checkinService = createCheckinService({ exportDir })

const guestSchema = z.object({
  firstName: z.string().trim().min(1),
  middleName: z.string().optional(),
  lastName: z.string().trim().min(1),
  gender: z.enum(['M', 'F']),
  passportNo: z.string().trim().min(1),
  nationality: z.string().trim().length(3),
  birthDate: z.string().trim().optional(),
})

const manualStaySchema = z.object({
  checkInDate: z.string().optional(),
  checkOutDate: z.string().min(1),
  phoneNo: z.string().optional(),
  status: z.enum(['draft', 'confirmed', 'exported']).optional(),
  roomCode: z.string().optional(),
  bedNumber: z.number().int().positive().optional(),
  guest: guestSchema,
})

const updateStaySchema = z.object({
  status: z.enum(['draft', 'confirmed', 'exported']).optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  phoneNo: z.string().optional(),
  roomCode: z.string().optional(),
  bedNumber: z.number().int().positive().optional(),
  guest: guestSchema.partial().optional(),
})

const moveStaySchema = z.object({
  roomCode: z.string().min(1),
  bedNumber: z.number().int().positive().optional(),
})

router.use(requireRole('ADMIN'))

router.post(
  '/mrz/scan',
  upload.single('passportImageMrz'),
  asyncHandler(async (request, response) => {
    const file = request.file
    if (!file) {
      response.status(400).json({ error: 'passportImageMrz is required' })
      return
    }

    const best = await readMrzBestEffort(file.path)
    if (!best) {
      response.json({
        detected: false,
        guest: null,
        mrzScore: 0,
        warnings: ['mrz_not_detected'],
      })
      return
    }

    const data = best.data
    const fullFirstName = (data.firstName || '').trim()
    const nameParts = fullFirstName.split(/\s+/).filter(Boolean)

    response.json({
      detected: true,
      guest: {
        passportNo: (data.passportNo || '').trim(),
        firstName: nameParts[0] || '',
        middleName: data.middleName || nameParts.slice(1).join(' '),
        lastName: data.lastName || '',
        gender:
          data.gender === 'male' ? 'M' :
            data.gender === 'female' ? 'F' :
              data.gender === 'M' ? 'M' :
                data.gender === 'F' ? 'F' :
                  '',
        nationality: data.nationality || '',
        birthDate: data.birthDateDDMMYYYY || '',
      },
      mrzScore: best.score,
      warnings: best.warnings || [],
      mrzLines: {
        line1: best.l1,
        line2: best.l2,
      },
    })
  }),
)

router.post(
  '/',
  upload.fields([
    { name: 'passportImageMrz', maxCount: 1 },
    { name: 'passportImageFull', maxCount: 1 },
  ]),
  asyncHandler(async (request, response) => {
    const schema = z.object({
      checkInDate: z.string().optional(),
    })
    const parsed = schema.parse(request.body)
    const files = request.files as
      | {
          passportImageMrz?: Express.Multer.File[]
          passportImageFull?: Express.Multer.File[]
        }
      | undefined

    const mrzFile = files?.passportImageMrz?.[0]
    const fullFile = files?.passportImageFull?.[0]
    const inputForMrz = mrzFile?.path || fullFile?.path

    if (!inputForMrz) {
      response.status(400).json({ error: 'passportImageMrz or passportImageFull is required' })
      return
    }

    const best = await readMrzBestEffort(inputForMrz)
    if (!best) {
      response.status(422).json({
        error: 'MRZ could not be detected. Please try another photo.',
      })
      return
    }

    const data = best.data
    const fullFirstName = (data.firstName || '').trim()
    const nameParts = fullFirstName.split(/\s+/).filter(Boolean)

    const result = await checkinService.createDraftFromScan({
      createdById: request.auth!.userId,
      checkInDate: parsed.checkInDate,
      passportImageMrzPath: mrzFile?.path,
      passportImageFullPath: fullFile?.path,
      mrzScore: best.score,
      mrzLine1: best.l1,
      mrzLine2: best.l2,
      warnings: best.warnings || [],
      guest: {
        passportNo: (data.passportNo || '').trim(),
        firstName: nameParts[0] || '',
        middleName: data.middleName || nameParts.slice(1).join(' '),
        lastName: data.lastName || '',
        gender:
          data.gender === 'male' ? 'M' :
            data.gender === 'female' ? 'F' :
              data.gender === 'M' ? 'M' :
                data.gender === 'F' ? 'F' :
                  '',
        nationality: data.nationality || '',
        birthDate: data.birthDateDDMMYYYY || '',
      },
    })

    response.status(201).json(result)
  }),
)

router.post(
  '/manual',
  asyncHandler(async (request, response) => {
    const payload = manualStaySchema.parse(request.body)
    response.status(201).json(
      await checkinService.createManual({
        ...payload,
        createdById: request.auth!.userId,
      }),
    )
  }),
)

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const date = z.string().optional().parse(request.query.date)
    response.json(await checkinService.listByDate(date))
  }),
)

router.patch(
  '/:stayId',
  asyncHandler(async (request, response) => {
    const payload = updateStaySchema.parse(request.body)
    response.json(await checkinService.updateStay(getParam(request.params.stayId), payload))
  }),
)

router.post(
  '/:stayId/move',
  asyncHandler(async (request, response) => {
    const payload = moveStaySchema.parse(request.body)
    response.json(await checkinService.moveStay(getParam(request.params.stayId), payload))
  }),
)

router.post(
  '/:stayId/clear-room',
  asyncHandler(async (request, response) => {
    response.json(await checkinService.clearStayRoom(getParam(request.params.stayId)))
  }),
)

router.delete(
  '/:stayId',
  asyncHandler(async (request, response) => {
    response.json(await checkinService.removeStay(getParam(request.params.stayId)))
  }),
)

export { router as checkinsRouter }
