import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCleaningAreaService } from '../services/cleaning-area.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const cleaningAreaService = createCleaningAreaService()

const areaSchema = z.object({
  name: z.string().min(1),
})

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await cleaningAreaService.list())
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = areaSchema.parse(request.body)
    response.status(201).json(await cleaningAreaService.create(payload))
  }),
)

router.put(
  '/:areaId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = areaSchema.parse(request.body)
    response.json(await cleaningAreaService.update(getParam(request.params.areaId), payload))
  }),
)

router.patch(
  '/:areaId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await cleaningAreaService.toggleActive(getParam(request.params.areaId)))
  }),
)

router.delete(
  '/:areaId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await cleaningAreaService.remove(getParam(request.params.areaId)))
  }),
)

export { router as cleaningAreasRouter }
