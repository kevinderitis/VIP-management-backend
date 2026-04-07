import { Router } from 'express'
import { z } from 'zod'
import { CLEANING_LOCATION_TYPES, TASK_CATEGORIES, TASK_PRIORITIES } from '../domain/enums.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { createTaskService } from '../services/task.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const taskService = createTaskService()

const taskSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(TASK_CATEGORIES),
    priority: z.enum(TASK_PRIORITIES),
    notes: z.string().optional(),
    publishAt: z.coerce.date().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    cleaningLocationType: z.enum(CLEANING_LOCATION_TYPES),
    cleaningLocationLabel: z.string().min(1),
    cleaningRoomNumber: z.number().int().min(1).max(300).optional(),
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: 'End time must be later than start time',
    path: ['endsAt'],
  })
  .refine((value) => !value.publishAt || value.publishAt.getTime() <= value.startsAt.getTime(), {
    message: 'Publish time must be before the task start time',
    path: ['publishAt'],
  })

router.get(
  '/',
  requireAuth,
  asyncHandler(async (request, response) => {
    const status = z.string().optional().parse(request.query.status)
    const search = z.string().optional().parse(request.query.search)
    response.json(await taskService.list({ status, search, audience: 'CLEANING' }))
  }),
)

router.get(
  '/available',
  requireRole('CLEANER'),
  asyncHandler(async (_request, response) => {
    response.json(await taskService.available('CLEANING'))
  }),
)

router.get(
  '/mine',
  requireRole('CLEANER'),
  asyncHandler(async (request, response) => {
    const date = z.string().optional().parse(request.query.date)
    response.json(await taskService.mine(request.auth!.userId, date, 'CLEANING'))
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = taskSchema.parse(request.body)
    response.status(201).json(
      await taskService.create({
        ...payload,
        points: 0,
        audience: 'CLEANING',
        createdById: request.auth!.userId,
      }),
    )
  }),
)

router.put(
  '/:taskId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = taskSchema.parse(request.body)
    response.json(await taskService.update(getParam(request.params.taskId), { ...payload, points: 0 }))
  }),
)

router.patch(
  '/:taskId/publish',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await taskService.publish(getParam(request.params.taskId)))
  }),
)

router.patch(
  '/:taskId/toggle-cancelled',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await taskService.toggleCancelled(getParam(request.params.taskId)))
  }),
)

router.delete(
  '/:taskId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await taskService.remove(getParam(request.params.taskId), 'CLEANING'))
  }),
)

router.post(
  '/:taskId/assign',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = z.object({ cleanerId: z.string().min(1) }).parse(request.body)
    response.json(await taskService.assign(getParam(request.params.taskId), payload.cleanerId, 'CLEANING'))
  }),
)

router.post(
  '/:taskId/claim',
  requireRole('CLEANER'),
  asyncHandler(async (request, response) => {
    response.json(await taskService.claim(getParam(request.params.taskId), request.auth!.userId, 'CLEANER'))
  }),
)

router.post(
  '/:taskId/release',
  requireRole('CLEANER'),
  asyncHandler(async (request, response) => {
    response.json(await taskService.release(getParam(request.params.taskId), request.auth!.userId, 'CLEANER'))
  }),
)

router.post(
  '/:taskId/complete',
  requireRole('CLEANER'),
  asyncHandler(async (request, response) => {
    response.json(await taskService.complete(getParam(request.params.taskId), request.auth!.userId, 'CLEANER'))
  }),
)

export { router as cleaningTasksRouter }
