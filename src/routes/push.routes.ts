import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  getWebPushPublicKey,
  isUsingEphemeralVapidKeys,
  registerPushSubscription,
  removePushSubscription,
} from '../services/push-notification.service.js'

const router = Router()

const subscriptionSchema = z.object({
  endpoint: z.string().min(1),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
})

router.get(
  '/public-key',
  asyncHandler(async (_request, response) => {
    response.json({
      publicKey: getWebPushPublicKey(),
      ephemeral: isUsingEphemeralVapidKeys(),
    })
  }),
)

router.post(
  '/subscriptions',
  requireRole('VOLUNTEER', 'CLEANER'),
  asyncHandler(async (request, response) => {
    const subscription = subscriptionSchema.parse(request.body)
    const result = await registerPushSubscription({
      userId: request.auth!.userId,
      role: request.auth!.role,
      subscription,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    })

    response.status(201).json(result)
  }),
)

router.delete(
  '/subscriptions',
  requireAuth,
  asyncHandler(async (request, response) => {
    const payload = z.object({ endpoint: z.string().min(1) }).parse(request.body ?? {})
    response.json(await removePushSubscription(request.auth!.userId, payload.endpoint))
  }),
)

export { router as pushRouter }
