import { Router } from 'express'
import { z } from 'zod'
import { CLEANING_LOCATION_TYPES } from '../domain/enums.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCleaningPlaceStatusService } from '../services/cleaning-place-status.service.js'

const router = Router()
const service = createCleaningPlaceStatusService()

const payloadSchema = z.object({
  placeType: z.enum(CLEANING_LOCATION_TYPES),
  roomNumber: z.number().int().min(1).max(300).optional(),
  cleaningAreaId: z.string().optional(),
  placeLabel: z.string().min(1),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  assignCleanerId: z.string().optional(),
})

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await service.list())
  }),
)

router.post(
  '/upsert',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = payloadSchema.parse(request.body)
    response.json(await service.upsert({ ...payload, adminUserId: request.auth!.userId }))
  }),
)

export { router as cleaningPlaceStatusesRouter }
