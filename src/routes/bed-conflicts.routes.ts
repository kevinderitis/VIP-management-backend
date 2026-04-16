import { Router } from 'express'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createBedConflictService } from '../services/bed-conflict.service.js'

const router = Router()
const service = createBedConflictService()

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await service.listActive())
  }),
)

router.patch(
  '/:conflictId/resolve',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const conflictId = Array.isArray(request.params.conflictId) ? request.params.conflictId[0] : request.params.conflictId
    response.json(await service.resolve(conflictId, request.auth!.userId))
  }),
)

export { router as bedConflictsRouter }
