import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { createOfficeCallService } from '../services/office-call.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const officeCallService = createOfficeCallService()

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = z
      .object({
        volunteerIds: z.array(z.string().min(1)).min(1),
      })
      .parse(request.body)

    response.status(201).json(await officeCallService.create(request.auth!.userId, payload.volunteerIds))
  }),
)

router.patch(
  '/:callId/acknowledge',
  requireAuth,
  requireRole('VOLUNTEER'),
  asyncHandler(async (request, response) => {
    response.json(await officeCallService.acknowledge(getParam(request.params.callId), request.auth!.userId))
  }),
)

export { router as officeCallsRouter }
