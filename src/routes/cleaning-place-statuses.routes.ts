import { Router } from 'express'
import { z } from 'zod'
import { ROOM_TYPES } from '../domain/cleaning-places.js'
import { CLEANING_LOCATION_TYPES } from '../domain/enums.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCleaningPlaceStatusService } from '../services/cleaning-place-status.service.js'

const router = Router()
const service = createCleaningPlaceStatusService()

const payloadSchema = z.object({
  placeType: z.enum(CLEANING_LOCATION_TYPES),
  roomNumber: z.number().int().min(1).max(300).optional(),
  roomCode: z.string().min(1).optional(),
  roomSection: z.string().min(1).optional(),
  roomType: z.enum(ROOM_TYPES).optional(),
  cleaningAreaId: z.string().optional(),
  placeLabel: z.string().min(1),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  trashRequested: z.boolean().optional(),
  beds: z
    .array(
      z.object({
        bedNumber: z.number().int().min(1).max(24),
        label: z.string().min(1),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }),
    )
    .optional(),
  assignCleanerId: z.string().optional(),
  assignVolunteerId: z.string().optional(),
  applyVolunteerAssignment: z.boolean().optional(),
})

const bulkBedTaskSchema = z.object({
  selections: z
    .array(
      z.object({
        roomCode: z.string().min(1),
        roomSection: z.string().min(1).optional(),
        roomType: z.enum(ROOM_TYPES),
        placeLabel: z.string().min(1),
        bedNumbers: z.array(z.number().int().min(1).max(24)).min(1),
      }),
    )
    .min(1),
  assignVolunteerId: z.string().optional(),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
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

router.post(
  '/bulk-bed-tasks',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = bulkBedTaskSchema.parse(request.body)
    response.json(await service.bulkCreateBedTasks({ ...payload, adminUserId: request.auth!.userId }))
  }),
)

export { router as cleaningPlaceStatusesRouter }
