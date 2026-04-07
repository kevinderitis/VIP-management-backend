import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCleanerService } from '../services/cleaner.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const cleanerService = createCleanerService()

const cleanerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  username: z.string().min(1),
  password: z.string().min(6).optional(),
  title: z.string().min(1),
  shift: z.string().min(1),
})

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const search = z.string().optional().parse(request.query.search)
    const status = z.enum(['all', 'active', 'inactive']).default('all').parse(request.query.status)
    response.json(await cleanerService.list({ search, status }))
  }),
)

router.get(
  '/:userId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await cleanerService.detail(getParam(request.params.userId)))
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = cleanerSchema.extend({ password: z.string().min(6) }).parse(request.body)
    response.status(201).json(await cleanerService.create(payload))
  }),
)

router.put(
  '/:userId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = cleanerSchema.parse(request.body)
    response.json(await cleanerService.update(getParam(request.params.userId), payload))
  }),
)

router.patch(
  '/:userId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await cleanerService.toggleActive(getParam(request.params.userId)))
  }),
)

router.delete(
  '/:userId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await cleanerService.remove(getParam(request.params.userId)))
  }),
)

export { router as cleanersRouter }
