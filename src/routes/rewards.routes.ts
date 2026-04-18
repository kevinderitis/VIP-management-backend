import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { createRewardService } from '../services/reward.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const rewardService = createRewardService()

const rewardSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().int().positive(),
  category: z.string().min(1),
  icon: z.string().min(1),
  stock: z.number().int().nonnegative().optional(),
})

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_request, response) => {
    response.json(await rewardService.list())
  }),
)

router.get(
  '/redemptions',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await rewardService.redemptions())
  }),
)

router.post(
  '/redemptions/:redemptionId/confirm-delivered',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await rewardService.confirmDelivered(getParam(request.params.redemptionId), request.auth!.userId))
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = rewardSchema.parse(request.body)
    response.status(201).json(await rewardService.create(payload))
  }),
)

router.put(
  '/:rewardId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = rewardSchema.parse(request.body)
    response.json(await rewardService.update(getParam(request.params.rewardId), payload))
  }),
)

router.patch(
  '/:rewardId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await rewardService.toggle(getParam(request.params.rewardId)))
  }),
)

router.delete(
  '/:rewardId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await rewardService.remove(getParam(request.params.rewardId)))
  }),
)

router.post(
  '/:rewardId/redeem',
  requireRole('VOLUNTEER'),
  asyncHandler(async (request, response) => {
    response.status(201).json(await rewardService.redeem(getParam(request.params.rewardId), request.auth!.userId))
  }),
)

export { router as rewardsRouter }
