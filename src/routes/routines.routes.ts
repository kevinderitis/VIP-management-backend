import { Router } from 'express'
import { z } from 'zod'
import { TASK_CATEGORIES, TASK_PRIORITIES, WEEKDAYS } from '../domain/enums.js'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createRoutineTaskService } from '../services/routine-task.service.js'
import { getParam } from '../utils/http.js'

const router = Router()
const routineService = createRoutineTaskService()

const routineSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(TASK_CATEGORIES),
  priority: z.enum(TASK_PRIORITIES),
  points: z.number().int().positive(),
  notes: z.string().optional(),
})

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await routineService.list())
  }),
)

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = routineSchema.parse(request.body)
    response.status(201).json(await routineService.create(payload))
  }),
)

router.put(
  '/:taskId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = routineSchema.parse(request.body)
    response.json(await routineService.update(getParam(request.params.taskId), payload))
  }),
)

router.patch(
  '/:taskId/toggle-active',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await routineService.toggle(getParam(request.params.taskId)))
  }),
)

router.delete(
  '/:taskId',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    response.json(await routineService.remove(getParam(request.params.taskId)))
  }),
)

router.post(
  '/:taskId/assign',
  requireRole('ADMIN'),
  asyncHandler(async (request, response) => {
    const payload = z
      .object({
        volunteerId: z.string().min(1),
        startsOn: z.coerce.date(),
        endsOn: z.coerce.date(),
        weekdays: z.array(z.enum(WEEKDAYS)).min(1),
        startTime: z.string().min(4),
        endTime: z.string().min(4),
      })
      .refine((value) => value.endsOn.getTime() >= value.startsOn.getTime(), {
        message: 'End date must be later than or equal to start date',
        path: ['endsOn'],
      })
      .parse(request.body)

    response.status(201).json(
      await routineService.assign(
        getParam(request.params.taskId),
        payload.volunteerId,
        payload.startsOn,
        payload.endsOn,
        payload.weekdays,
        payload.startTime,
        payload.endTime,
        request.auth!.userId,
      ),
    )
  }),
)

export { router as routinesRouter }
