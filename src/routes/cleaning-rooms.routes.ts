import { Router } from 'express'
import { z } from 'zod'
import { ROOM_TYPES } from '../domain/cleaning-places.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCleaningRoomService } from '../services/cleaning-room.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const service = createCleaningRoomService()

const payloadSchema = z.object({
  code: z.string().min(1),
  section: z.string().min(1),
  roomType: z.enum(ROOM_TYPES),
  bedCount: z.number().int().min(1).max(14),
  bedTaskPoints: z.number().int().min(1).max(100).optional(),
  checkTaskPoints: z.number().int().min(1).max(100).optional(),
  trashTaskPoints: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
})

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.status(201).json(await service.create(payloadSchema.parse(request.body)))
  }),
)

router.put(
  '/:roomId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await service.update(getParam(request.params.roomId), payloadSchema.parse(request.body)))
  }),
)

router.patch(
  '/:roomId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await service.toggle(getParam(request.params.roomId)))
  }),
)

router.delete(
  '/:roomId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await service.remove(getParam(request.params.roomId)))
  }),
)

export { router as cleaningRoomsRouter }
