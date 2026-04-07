import { Router } from 'express'
import { z } from 'zod'
import { WEEKDAYS } from '../domain/enums.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createVolunteerService } from '../services/volunteer.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const volunteerService = createVolunteerService()

const volunteerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  username: z.string().min(1),
  password: z.string().min(6).optional(),
  title: z.string().min(1),
  shift: z.string().min(1),
  offDay: z.enum(WEEKDAYS),
  badge: z.string().optional(),
})

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const search = z.string().optional().parse(request.query.search)
    const status = z.enum(['all', 'active', 'inactive']).default('all').parse(request.query.status)
    response.json(await volunteerService.list({ search, status }))
  }),
)

router.get(
  '/:userId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await volunteerService.detail(getParam(request.params.userId)))
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = volunteerSchema.extend({ password: z.string().min(6) }).parse(request.body)
    response.status(201).json(await volunteerService.create(payload))
  }),
)

router.put(
  '/:userId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = volunteerSchema.parse(request.body)
    response.json(await volunteerService.update(getParam(request.params.userId), payload))
  }),
)

router.patch(
  '/:userId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await volunteerService.toggleActive(getParam(request.params.userId)))
  }),
)

router.delete(
  '/:userId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await volunteerService.remove(getParam(request.params.userId)))
  }),
)

export { router as volunteersRouter }
