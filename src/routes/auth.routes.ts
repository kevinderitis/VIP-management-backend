import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireAuth } from '../middlewares/auth.js'
import { createAuthService } from '../services/auth.service.js'

const router = Router()
const authService = createAuthService()

router.post(
  '/login',
  asyncHandler(async (request, response) => {
    const payload = z
      .object({
        identifier: z.string().min(1),
        password: z.string().min(1),
      })
      .parse(request.body)

    response.json(await authService.login(payload.identifier, payload.password))
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (request, response) => {
    response.json(await authService.me(request.auth!.userId))
  }),
)

export { router as authRouter }
