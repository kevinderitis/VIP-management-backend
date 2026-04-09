import { TaskAudience, TaskCategory, TaskPriority, TaskSource, TaskStatus, UserRole } from '../domain/enums.js'
import { HttpError } from '../lib/http-error.js'
import { CleaningAreaModel } from '../models/cleaning-area.model.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { TaskCompletionModel } from '../models/task-completion.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { serializeTask } from '../utils/serializers.js'
import { createActivityService } from './activity.service.js'

export const createTaskService = () => {
  const activityService = createActivityService()
  const audienceForRole = (role: UserRole): TaskAudience => (role === 'CLEANER' ? 'CLEANING' : 'VOLUNTEER')

  return {
    async list(filters: { status?: string; search?: string; audience?: TaskAudience }) {
      const query: Record<string, unknown> = {}
      if (filters.status && filters.status !== 'all') query.status = filters.status.toUpperCase()
      if (filters.audience) query.audience = filters.audience
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
        ]
      }

      const tasks = await TaskModel.find(query).sort({ startsAt: 1, createdAt: -1 }).lean()
      return tasks.map(serializeTask)
    },

    async available(audience: TaskAudience = 'VOLUNTEER') {
      const tasks = await TaskModel.find({ status: 'AVAILABLE', audience }).sort({ startsAt: 1, createdAt: -1 }).lean()
      return tasks.map(serializeTask)
    },

    async mine(userId: string, date?: string, audience: TaskAudience = 'VOLUNTEER') {
      const query: Record<string, unknown> = {
        assignedToId: userId,
        audience,
        status: { $in: ['ASSIGNED', 'SCHEDULED'] satisfies TaskStatus[] },
      }
      if (date) {
        query.startsAt = {
          $gte: new Date(`${date}T00:00:00.000Z`),
          $lte: new Date(`${date}T23:59:59.999Z`),
        }
      }

      const tasks = await TaskModel.find(query).sort({ startsAt: 1 }).lean()
      return tasks.map(serializeTask)
    },

    async create(input: {
      title: string
      description: string
      category: TaskCategory
      priority: TaskPriority
      points: number
      notes?: string
      publishAt?: Date
      startsAt?: Date
      endsAt?: Date
      audience?: TaskAudience
      cleaningLocationType?: 'ROOM' | 'CUSTOM'
      cleaningLocationLabel?: string
      cleaningRoomNumber?: number
      createdById: string
    }) {
      const startsAt = input.startsAt
      if (!startsAt || !input.endsAt) {
        throw new HttpError(400, 'Task schedule is required')
      }

      if (input.endsAt.getTime() <= startsAt.getTime()) {
        throw new HttpError(400, 'End time must be later than start time')
      }

      if (input.publishAt && input.publishAt.getTime() > startsAt.getTime()) {
        throw new HttpError(400, 'Publish time must be before the task start time')
      }

      const publishedAt = input.publishAt ?? new Date()

      const task = await TaskModel.create({
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        points: input.points,
        audience: input.audience ?? 'VOLUNTEER',
        notes: input.notes,
        startsAt,
        endsAt: input.endsAt,
        publishedAt,
        status: publishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'AVAILABLE',
        source: 'MANUAL' satisfies TaskSource,
        createdById: input.createdById,
        cleaningLocationType: input.cleaningLocationType,
        cleaningLocationLabel: input.cleaningLocationLabel,
        cleaningRoomNumber: input.cleaningRoomNumber,
      })

      await activityService.create(
        'TASK_CREATED',
        `New task created: ${task.title}`,
        task.status === 'SCHEDULED'
          ? 'It was scheduled for automatic publishing.'
          : 'It is already available to the volunteer team.',
      )
      emitRealtimeEvent('tasks:updated', { type: 'created', taskId: String(task._id) })
      return serializeTask(task.toObject())
    },

    async update(taskId: string, input: {
      title: string
      description: string
      category: TaskCategory
      priority: TaskPriority
      points: number
      notes?: string
      publishAt?: Date
      startsAt?: Date
      endsAt?: Date
      cleaningLocationType?: 'ROOM' | 'CUSTOM'
      cleaningLocationLabel?: string
      cleaningRoomNumber?: number
    }) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      if (!input.startsAt || !input.endsAt) throw new HttpError(400, 'Task schedule is required')
      if (input.endsAt.getTime() <= input.startsAt.getTime()) {
        throw new HttpError(400, 'End time must be later than start time')
      }
      if (input.publishAt && input.publishAt.getTime() > input.startsAt.getTime()) {
        throw new HttpError(400, 'Publish time must be before the task start time')
      }

      const nextPublishedAt =
        input.publishAt ??
        (task.publishedAt && task.publishedAt.getTime() <= Date.now() ? task.publishedAt : new Date())

      task.title = input.title
      task.description = input.description
      task.category = input.category
      task.priority = input.priority
      task.points = input.points ?? task.points
      task.notes = input.notes
      task.startsAt = input.startsAt
      task.endsAt = input.endsAt
      task.cleaningLocationType = input.cleaningLocationType
      task.cleaningLocationLabel = input.cleaningLocationLabel
      task.cleaningRoomNumber = input.cleaningRoomNumber
      task.publishedAt = nextPublishedAt
      if (task.source === 'MANUAL') {
        task.status =
          task.publishedAt.getTime() > Date.now()
            ? 'SCHEDULED'
            : task.assignedToId
              ? 'ASSIGNED'
              : 'AVAILABLE'
      }

      await task.save()
      emitRealtimeEvent('tasks:updated', { type: 'updated', taskId })
      return serializeTask(task.toObject())
    },

    async publish(taskId: string) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      task.status = task.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
      task.publishedAt = new Date()
      await task.save()
      return serializeTask(task.toObject())
    },

    async toggleCancelled(taskId: string) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      task.status = task.status === 'CANCELLED' ? 'DRAFT' : 'CANCELLED'
      await task.save()
      return serializeTask(task.toObject())
    },

    async remove(taskId: string, audience?: TaskAudience) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      if (audience && task.audience !== audience) {
        throw new HttpError(400, 'Task audience does not match this deletion flow')
      }

      if (task.status === 'COMPLETED' && task.assignedToId) {
        const user = await UserModel.findById(task.assignedToId)
        if (user) {
          user.completedTasks = Math.max(0, user.completedTasks - 1)
          if (task.audience === 'VOLUNTEER') {
            user.points = Math.max(0, user.points - task.points)
            user.lifetimePoints = Math.max(0, user.lifetimePoints - task.points)
          }
          await user.save()
        }
      }

      await TaskCompletionModel.deleteMany({ taskId: task._id })
      await task.deleteOne()
      emitRealtimeEvent('tasks:updated', { type: 'deleted', taskId })
      return { success: true }
    },

    async assign(taskId: string, assigneeId: string, audience?: TaskAudience) {
      const [task, assignee] = await Promise.all([
        TaskModel.findById(taskId),
        UserModel.findById(assigneeId),
      ])

      if (!task) throw new HttpError(404, 'Task not found')
      if (audience && task.audience !== audience) {
        throw new HttpError(400, 'Task audience does not match this assignment flow')
      }

      const expectedRole = task.audience === 'CLEANING' ? 'CLEANER' : 'VOLUNTEER'
      if (!assignee || assignee.role !== expectedRole) {
        throw new HttpError(404, task.audience === 'CLEANING' ? 'Cleaner not found' : 'Volunteer not found')
      }

      task.assignedToId = assignee._id
      task.status = task.publishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'ASSIGNED'
      await task.save()

      await activityService.create(
        'TASK_TAKEN',
        `Task assigned: ${task.title}`,
        `${assignee.name} was assigned directly from the admin backoffice.`,
      )
      emitRealtimeEvent('tasks:updated', { type: 'admin-assigned', taskId, assigneeId })
      return serializeTask(task.toObject())
    },

    async claim(taskId: string, userId: string, actorRole: UserRole = 'VOLUNTEER') {
      const task = await TaskModel.findById(taskId)
      if (!task || task.status !== 'AVAILABLE') throw new HttpError(400, 'Task is not available')
      if (task.audience !== audienceForRole(actorRole)) throw new HttpError(403, 'This task does not belong to your workspace')
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, actorRole === 'CLEANER' ? 'Cleaner not found' : 'Volunteer not found')
      task.status = 'ASSIGNED'
      task.set('assignedToId', userId)
      await task.save()
      await activityService.create(
        'TASK_TAKEN',
        `Task claimed: ${task.title}`,
        `${user.name} claimed this task from the shared board.`,
      )
      emitRealtimeEvent('tasks:updated', { type: 'claimed', taskId })
      return serializeTask(task.toObject())
    },

    async release(taskId: string, userId: string, actorRole: UserRole = 'VOLUNTEER') {
      const task = await TaskModel.findById(taskId)
      if (!task || String(task.assignedToId) !== userId) throw new HttpError(400, 'Task cannot be released by this user')
      if (task.audience !== audienceForRole(actorRole)) throw new HttpError(403, 'This task does not belong to your workspace')
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, actorRole === 'CLEANER' ? 'Cleaner not found' : 'Volunteer not found')
      task.status = 'AVAILABLE'
      task.set('assignedToId', undefined)
      task.publishedAt = new Date()
      await task.save()
      await activityService.create(
        'TASK_RELEASED',
        `Task released: ${task.title}`,
        `${user.name} released this task back to the shared board.`,
      )
      emitRealtimeEvent('tasks:updated', { type: 'released', taskId })
      return serializeTask(task.toObject())
    },

    async complete(taskId: string, userId: string, actorRole: UserRole = 'VOLUNTEER') {
      const task = await TaskModel.findById(taskId)
      if (!task || String(task.assignedToId) !== userId) throw new HttpError(400, 'Task cannot be completed by this user')
      if (task.audience !== audienceForRole(actorRole)) throw new HttpError(403, 'This task does not belong to your workspace')
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, actorRole === 'CLEANER' ? 'Cleaner not found' : 'Volunteer not found')

      task.status = 'COMPLETED'
      await task.save()

      if (actorRole === 'VOLUNTEER') {
        user.points += task.points
        user.lifetimePoints += task.points
      }
      user.completedTasks += 1
      await user.save()

      await TaskCompletionModel.create({
        taskId: task._id,
        volunteerId: userId,
        points: task.points,
        source: task.source,
        routineTemplateId: task.routineTemplateId,
        packId: task.packId,
      })

      if (actorRole === 'CLEANER' && task.cleaningLocationType && task.cleaningLocationLabel) {
        if (task.cleaningLocationType === 'ROOM' && task.cleaningRoomNumber) {
          await CleaningPlaceStatusModel.findOneAndUpdate(
            { placeType: 'ROOM', roomNumber: task.cleaningRoomNumber },
            {
              placeType: 'ROOM',
              roomNumber: task.cleaningRoomNumber,
              placeLabel: task.cleaningLocationLabel,
              label: 'Clean',
              color: '#22c55e',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          )
        } else if (task.cleaningLocationType === 'CUSTOM') {
          const area = await CleaningAreaModel.findOne({ name: task.cleaningLocationLabel }).lean()
          const existingStatus =
            (await CleaningPlaceStatusModel.findOne({
              placeType: 'CUSTOM',
              ...(area ? { cleaningAreaId: area._id } : { placeLabel: task.cleaningLocationLabel }),
            })) ??
            undefined

          const query = existingStatus
            ? { _id: existingStatus._id }
            : area
              ? { placeType: 'CUSTOM', cleaningAreaId: area._id }
              : { placeType: 'CUSTOM', placeLabel: task.cleaningLocationLabel }

          await CleaningPlaceStatusModel.findOneAndUpdate(
            query,
            {
              placeType: 'CUSTOM',
              cleaningAreaId: area?._id,
              placeLabel: task.cleaningLocationLabel,
              label: 'Clean',
              color: '#22c55e',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          )
        }
      }

      await activityService.create(
        'TASK_COMPLETED',
        `Task completed: ${task.title}`,
        actorRole === 'CLEANER'
          ? 'The cleaning completion was recorded in the service history.'
          : `${task.points} points were credited to the volunteer.`,
      )
      emitRealtimeEvent('tasks:updated', { type: 'completed', taskId })
      return serializeTask(task.toObject())
    },

    async runScheduler() {
      const dueTasks = await TaskModel.find({
        status: 'SCHEDULED',
        publishedAt: { $lte: new Date() },
      })

      for (const task of dueTasks) {
        task.status = task.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
        task.publishedAt = new Date()
        await task.save()
      }

      emitRealtimeEvent('tasks:updated', { type: 'scheduler', count: dueTasks.length })
      return { updated: dueTasks.length }
    },
  }
}
