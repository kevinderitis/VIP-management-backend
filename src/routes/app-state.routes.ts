import { Router } from 'express'
import { asyncHandler } from '../lib/async-handler.js'
import { requireAuth } from '../middlewares/auth.js'
import { createAppStateService } from '../services/app-state.service.js'

const router = Router()
const appStateService = createAppStateService()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (request, response) => {
    response.json(await appStateService.getState(request.auth!.userId, request.auth!.role))
  }),
)

export { router as appStateRouter }
