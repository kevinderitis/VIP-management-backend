import { Router } from 'express'
import { z } from 'zod'
import { TASK_CATEGORIES, TASK_PRIORITIES } from '../domain/enums.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createPackService } from '../services/pack.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const packService = createPackService()

const packSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  durationDays: z.number().int().positive(),
  templates: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      category: z.enum(TASK_CATEGORIES),
      priority: z.enum(TASK_PRIORITIES),
      dayOffset: z.number().int().positive(),
      startTime: z.string().min(4),
      endTime: z.string().min(4),
      points: z.number().int().positive(),
    }),
  ),
})

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await packService.list())
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = packSchema.parse(request.body)
    response.status(201).json(await packService.create(payload))
  }),
)

router.put(
  '/:packId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = packSchema.parse(request.body)
    response.json(await packService.update(getParam(request.params.packId), payload))
  }),
)

router.patch(
  '/:packId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await packService.toggle(getParam(request.params.packId)))
  }),
)

router.delete(
  '/:packId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await packService.remove(getParam(request.params.packId)))
  }),
)

router.post(
  '/:packId/assign',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = z
      .object({
        volunteerId: z.string().min(1),
        startDate: z.coerce.date(),
        durationDays: z.number().int().positive().optional(),
      })
      .parse(request.body)

    response
      .status(201)
      .json(await packService.assign(getParam(request.params.packId), payload.volunteerId, payload.startDate, payload.durationDays, request.auth!.userId))
  }),
)

export { router as packsRouter }
