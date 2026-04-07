import { TaskCategory, TaskPriority, TaskSource } from '../domain/enums.js'
import { HttpError } from '../lib/http-error.js'
import { TaskPackAssignmentModel } from '../models/task-pack-assignment.model.js'
import { TaskPackModel } from '../models/task-pack.model.js'
import { TaskModel } from '../models/task.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { combineDateAndTime } from '../utils/date.js'
import { serializePack, serializePackAssignment } from '../utils/serializers.js'
import { createActivityService } from './activity.service.js'

export const createPackService = () => {
  const activityService = createActivityService()

  return {
    async list() {
      const packs = await TaskPackModel.find().sort({ name: 1 }).lean()
      return packs.map(serializePack)
    },

    async create(input: {
      name: string
      description: string
      durationDays: number
      templates: Array<{
        title: string
        description: string
        category: TaskCategory
        priority: TaskPriority
        dayOffset: number
        startTime: string
        endTime: string
        points: number
      }>
    }) {
      const pack = await TaskPackModel.create(input)
      return serializePack(pack.toObject())
    },

    async update(packId: string, input: {
      name: string
      description: string
      durationDays: number
      templates: Array<{
        title: string
        description: string
        category: TaskCategory
        priority: TaskPriority
        dayOffset: number
        startTime: string
        endTime: string
        points: number
      }>
    }) {
      const pack = await TaskPackModel.findById(packId)
      if (!pack) throw new HttpError(404, 'Pack not found')
      pack.name = input.name
      pack.description = input.description
      pack.durationDays = input.durationDays
      pack.templates = input.templates as never
      await pack.save()
      return serializePack(pack.toObject())
    },

    async toggle(packId: string) {
      const pack = await TaskPackModel.findById(packId)
      if (!pack) throw new HttpError(404, 'Pack not found')
      pack.isActive = !pack.isActive
      await pack.save()
      return serializePack(pack.toObject())
    },

    async remove(packId: string) {
      const pack = await TaskPackModel.findById(packId)
      if (!pack) throw new HttpError(404, 'Pack not found')

      await Promise.all([
        TaskModel.deleteMany({ packId: pack._id }),
        TaskPackAssignmentModel.deleteMany({ packId: pack._id }),
      ])
      await pack.deleteOne()
      emitRealtimeEvent('packs:deleted', { packId })
      return { success: true }
    },

    async assign(packId: string, volunteerId: string, startDate: Date, durationDays?: number, createdById?: string) {
      const pack = await TaskPackModel.findById(packId).lean()
      if (!pack) throw new HttpError(404, 'Pack not found')

      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + (durationDays ?? pack.durationDays))

      const assignment = await TaskPackAssignmentModel.create({
        packId,
        volunteerId,
        startDate,
        endDate,
      })

      for (const template of pack.templates) {
        const taskDay = new Date(startDate)
        taskDay.setDate(taskDay.getDate() + template.dayOffset - 1)
        const startsAt = combineDateAndTime(taskDay, template.startTime)
        const endsAt = combineDateAndTime(taskDay, template.endTime)

        await TaskModel.create({
          title: `${pack.name} - ${template.title}`,
          description: template.description,
          category: template.category,
          priority: template.priority,
          status: startsAt.getTime() > Date.now() ? 'SCHEDULED' : 'ASSIGNED',
          points: template.points,
          publishedAt: startsAt,
          startsAt,
          endsAt,
          assignedToId: volunteerId,
          createdById: createdById ?? volunteerId,
          source: 'PACK' satisfies TaskSource,
          packId,
          packAssignmentId: assignment._id,
        })
      }

      await activityService.create('PACK_ASSIGNED', 'Task pack assigned', 'Tasks were generated automatically from the reusable pack.')
      emitRealtimeEvent('packs:assigned', { packId, volunteerId })
      return serializePackAssignment(assignment.toObject())
    },
  }
}
