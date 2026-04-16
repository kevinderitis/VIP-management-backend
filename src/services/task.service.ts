import mongoose from 'mongoose'
import { BED_STATUS_PRESETS, summarizeBeds } from '../domain/cleaning-places.js'
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
import { registerBedConflictIfNeeded } from './bed-conflict.service.js'

export const createTaskService = () => {
  const activityService = createActivityService()
  const audienceForRole = (role: UserRole): TaskAudience => (role === 'CLEANER' ? 'CLEANING' : 'VOLUNTEER')
  const unassignedQuery = () => ({
    $or: [{ assignedToId: { $exists: false } }, { assignedToId: null }],
  })
  const updateRoomBedStateFromTask = async (
    task: {
      cleaningRoomNumber?: number | null
      cleaningRoomCode?: string | null
      cleaningRoomSection?: string | null
      cleaningLocationLabel?: string | null
      cleaningBedNumber?: number | null
    },
    resultingBedState: 'READY' | 'OCCUPIED',
  ) => {
    if (!task.cleaningRoomNumber && !task.cleaningRoomCode) return

    const preset = BED_STATUS_PRESETS[resultingBedState]
    const existingStatus = await CleaningPlaceStatusModel.findOne({
      placeType: 'ROOM',
      ...(task.cleaningRoomCode ? { roomCode: task.cleaningRoomCode } : { roomNumber: task.cleaningRoomNumber }),
    })

    const roomType = existingStatus?.roomType ?? 'PRIVATE'
    const currentBeds = Array.isArray(existingStatus?.beds) && existingStatus.beds.length
      ? existingStatus.beds.map((bed) => ({
          bedNumber: bed.bedNumber,
          label: bed.label,
          color: bed.color,
        }))
      : [{ bedNumber: 1, label: preset.label, color: preset.color }]

    const targetBedNumber = task.cleaningBedNumber ?? 1
    const previousBed = currentBeds.find((bed) => bed.bedNumber === targetBedNumber)
    const nextBeds = currentBeds.some((bed) => bed.bedNumber === targetBedNumber)
      ? currentBeds.map((bed) =>
          bed.bedNumber === targetBedNumber ? { ...bed, label: preset.label, color: preset.color } : bed,
        )
      : [...currentBeds, { bedNumber: targetBedNumber, label: preset.label, color: preset.color }]

    const serviceNeedsCleaning =
      ['need cleaning', 'needs cleaning'].includes(existingStatus?.roomServiceLabel?.trim().toLowerCase() ?? '')
    const roomSummary =
      roomType === 'SHARED'
        ? serviceNeedsCleaning
          ? {
              label: existingStatus?.roomServiceLabel ?? 'Needs cleaning',
              color: existingStatus?.roomServiceColor ?? '#ef4444',
            }
          : summarizeBeds(nextBeds)
        : undefined

    await CleaningPlaceStatusModel.findOneAndUpdate(
      {
        placeType: 'ROOM',
        ...(task.cleaningRoomCode ? { roomCode: task.cleaningRoomCode } : { roomNumber: task.cleaningRoomNumber }),
      },
      {
        placeType: 'ROOM',
        roomNumber: task.cleaningRoomNumber,
        roomCode: task.cleaningRoomCode,
        roomSection: task.cleaningRoomSection,
        roomType,
        placeLabel: task.cleaningLocationLabel ?? `Room ${task.cleaningRoomCode ?? task.cleaningRoomNumber}`,
        label: roomSummary?.label ?? existingStatus?.label ?? 'Clean',
        color: roomSummary?.color ?? existingStatus?.color ?? '#22c55e',
        roomServiceLabel: existingStatus?.roomServiceLabel,
        roomServiceColor: existingStatus?.roomServiceColor,
        beds: nextBeds,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    await registerBedConflictIfNeeded({
      roomCode: task.cleaningRoomCode ?? undefined,
      roomSection: task.cleaningRoomSection ?? undefined,
      roomLabel: task.cleaningLocationLabel ?? `Room ${task.cleaningRoomCode ?? task.cleaningRoomNumber}`,
      bedNumber: targetBedNumber,
      previousLabel: previousBed?.label,
      nextLabel: preset.label,
    })
  }

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
      volunteerSlots?: number
      notes?: string
      publishAt?: Date
      startsAt?: Date
      endsAt?: Date
      audience?: TaskAudience
      cleaningLocationType?: 'ROOM' | 'CUSTOM'
      cleaningLocationLabel?: string
      cleaningRoomNumber?: number
      cleaningRoomCode?: string
      cleaningRoomSection?: string
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
      const volunteerSlots =
        input.audience === 'VOLUNTEER' || !input.audience
          ? Math.max(1, input.volunteerSlots ?? 1)
          : 1
      const sharedTaskGroupId =
        volunteerSlots > 1 ? new mongoose.Types.ObjectId().toString() : undefined

      const baseTask = {
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
        cleaningRoomCode: input.cleaningRoomCode,
        cleaningRoomSection: input.cleaningRoomSection,
        volunteerSlots,
        sharedTaskGroupId,
      }

      const createdTasks =
        volunteerSlots > 1
          ? await TaskModel.insertMany(Array.from({ length: volunteerSlots }, () => ({ ...baseTask })))
          : [await TaskModel.create(baseTask)]
      const primaryTask = createdTasks[0]

      await activityService.create(
        'TASK_CREATED',
        `New task created: ${primaryTask.title}`,
        primaryTask.status === 'SCHEDULED'
          ? 'It was scheduled for automatic publishing.'
          : volunteerSlots > 1
            ? `It was created with ${volunteerSlots} volunteer slots.`
            : 'It is already available to the volunteer team.',
      )
      emitRealtimeEvent('tasks:updated', { type: 'created', taskId: String(primaryTask._id) })
      return serializeTask(primaryTask.toObject())
    },

    async update(taskId: string, input: {
      title: string
      description: string
      category: TaskCategory
      priority: TaskPriority
      points: number
      volunteerSlots?: number
      notes?: string
      publishAt?: Date
      startsAt?: Date
      endsAt?: Date
      cleaningLocationType?: 'ROOM' | 'CUSTOM'
      cleaningLocationLabel?: string
      cleaningRoomNumber?: number
      cleaningRoomCode?: string
      cleaningRoomSection?: string
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
      task.cleaningRoomCode = input.cleaningRoomCode
      task.cleaningRoomSection = input.cleaningRoomSection
      task.publishedAt = nextPublishedAt
      const requestedVolunteerSlots =
        task.audience === 'VOLUNTEER' ? Math.max(1, input.volunteerSlots ?? task.volunteerSlots ?? 1) : 1
      const nextStatus =
        task.publishedAt.getTime() > Date.now()
          ? 'SCHEDULED'
          : task.assignedToId
            ? 'ASSIGNED'
            : 'AVAILABLE'

      if (task.source === 'MANUAL' && task.sharedTaskGroupId) {
        const siblingTasks = await TaskModel.find({ sharedTaskGroupId: task.sharedTaskGroupId }).sort({ createdAt: 1 })
        const lockedTasks = siblingTasks.filter((item) => item.status === 'COMPLETED' || Boolean(item.assignedToId))

        if (requestedVolunteerSlots < lockedTasks.length) {
          throw new HttpError(
            400,
            `You cannot reduce this task below ${lockedTasks.length} slots because some slots are already assigned or completed.`,
          )
        }

        if (requestedVolunteerSlots > siblingTasks.length) {
          const additionalTasks = Array.from({ length: requestedVolunteerSlots - siblingTasks.length }, () => ({
            title: input.title,
            description: input.description,
            category: input.category,
            priority: input.priority,
            points: input.points ?? task.points,
            audience: task.audience,
            notes: input.notes,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            publishedAt: nextPublishedAt,
            status: nextPublishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'AVAILABLE',
            source: task.source,
            createdById: task.createdById,
            cleaningLocationType: input.cleaningLocationType,
            cleaningLocationLabel: input.cleaningLocationLabel,
            cleaningRoomNumber: input.cleaningRoomNumber,
            cleaningRoomCode: input.cleaningRoomCode,
            cleaningRoomSection: input.cleaningRoomSection,
            volunteerSlots: requestedVolunteerSlots,
            sharedTaskGroupId: task.sharedTaskGroupId,
          }))
          await TaskModel.insertMany(additionalTasks)
        } else if (requestedVolunteerSlots < siblingTasks.length) {
          const removableTasks = siblingTasks.filter(
            (item) => item.status !== 'COMPLETED' && !item.assignedToId,
          )
          const removeCount = siblingTasks.length - requestedVolunteerSlots
          if (removableTasks.length < removeCount) {
            throw new HttpError(400, 'There are not enough free slots to reduce this task to that number.')
          }
          const removableIds = removableTasks.slice(0, removeCount).map((item) => item._id)
          await TaskModel.deleteMany({ _id: { $in: removableIds } })
        }

        await TaskModel.updateMany(
          { sharedTaskGroupId: task.sharedTaskGroupId },
          {
            $set: {
              title: input.title,
              description: input.description,
              category: input.category,
              priority: input.priority,
              points: input.points ?? task.points,
              notes: input.notes,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              cleaningLocationType: input.cleaningLocationType,
              cleaningLocationLabel: input.cleaningLocationLabel,
              cleaningRoomNumber: input.cleaningRoomNumber,
              cleaningRoomCode: input.cleaningRoomCode,
              cleaningRoomSection: input.cleaningRoomSection,
              publishedAt: nextPublishedAt,
              volunteerSlots: requestedVolunteerSlots,
            },
          },
        )

        await TaskModel.updateMany(
          { sharedTaskGroupId: task.sharedTaskGroupId, ...unassignedQuery() },
          { $set: { status: nextStatus } },
        )
        await TaskModel.updateMany(
          { sharedTaskGroupId: task.sharedTaskGroupId, assignedToId: { $exists: true } },
          { $set: { status: task.publishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'ASSIGNED' } },
        )
        const updated = await TaskModel.findById(taskId).lean()
        emitRealtimeEvent('tasks:updated', { type: 'updated', taskId })
        return serializeTask(updated!)
      }

      if (task.source === 'MANUAL' && task.audience === 'VOLUNTEER' && requestedVolunteerSlots > 1) {
        const sharedTaskGroupId = new mongoose.Types.ObjectId().toString()
        task.sharedTaskGroupId = sharedTaskGroupId
        task.volunteerSlots = requestedVolunteerSlots
        task.status = nextStatus
        await task.save()

        await TaskModel.insertMany(
          Array.from({ length: requestedVolunteerSlots - 1 }, () => ({
            title: input.title,
            description: input.description,
            category: input.category,
            priority: input.priority,
            points: input.points ?? task.points,
            audience: task.audience,
            notes: input.notes,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            publishedAt: nextPublishedAt,
            status: nextPublishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'AVAILABLE',
            source: task.source,
            createdById: task.createdById,
            cleaningLocationType: input.cleaningLocationType,
            cleaningLocationLabel: input.cleaningLocationLabel,
            cleaningRoomNumber: input.cleaningRoomNumber,
            cleaningRoomCode: input.cleaningRoomCode,
            cleaningRoomSection: input.cleaningRoomSection,
            volunteerSlots: requestedVolunteerSlots,
            sharedTaskGroupId,
          })),
        )

        emitRealtimeEvent('tasks:updated', { type: 'updated', taskId })
        return serializeTask(task.toObject())
      }

      if (task.source === 'MANUAL') {
        task.volunteerSlots = requestedVolunteerSlots
        task.status = nextStatus
      }
      await task.save()
      emitRealtimeEvent('tasks:updated', { type: 'updated', taskId })
      return serializeTask(task.toObject())
    },

    async publish(taskId: string) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      if (task.sharedTaskGroupId) {
        const now = new Date()
        await TaskModel.updateMany(
          { sharedTaskGroupId: task.sharedTaskGroupId },
          [
            {
              $set: {
                status: {
                  $cond: [{ $ifNull: ['$assignedToId', false] }, 'ASSIGNED', 'AVAILABLE'],
                },
                publishedAt: now,
              },
            },
          ],
        )
        const updated = await TaskModel.findById(taskId).lean()
        return serializeTask(updated!)
      }
      task.status = task.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
      task.publishedAt = new Date()
      await task.save()
      return serializeTask(task.toObject())
    },

    async toggleCancelled(taskId: string) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      if (task.sharedTaskGroupId) {
        const nextStatus = task.status === 'CANCELLED' ? 'DRAFT' : 'CANCELLED'
        await TaskModel.updateMany({ sharedTaskGroupId: task.sharedTaskGroupId }, { $set: { status: nextStatus } })
        const updated = await TaskModel.findById(taskId).lean()
        return serializeTask(updated!)
      }
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

      const relatedTasks = task.sharedTaskGroupId
        ? await TaskModel.find({ sharedTaskGroupId: task.sharedTaskGroupId })
        : [task]

      for (const relatedTask of relatedTasks) {
        if (relatedTask.status === 'COMPLETED' && relatedTask.assignedToId) {
          const user = await UserModel.findById(relatedTask.assignedToId)
          if (user) {
            user.completedTasks = Math.max(0, user.completedTasks - 1)
            if (relatedTask.audience === 'VOLUNTEER') {
              user.points = Math.max(0, user.points - relatedTask.points)
              user.lifetimePoints = Math.max(0, user.lifetimePoints - relatedTask.points)
            }
            await user.save()
          }
        }
      }

      await TaskCompletionModel.deleteMany({ taskId: { $in: relatedTasks.map((relatedTask) => relatedTask._id) } })
      if (task.sharedTaskGroupId) {
        await TaskModel.deleteMany({ sharedTaskGroupId: task.sharedTaskGroupId })
      } else {
        await task.deleteOne()
      }
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

      const targetTask =
        task.sharedTaskGroupId && task.audience === 'VOLUNTEER'
          ? await TaskModel.findOne({
              sharedTaskGroupId: task.sharedTaskGroupId,
              status: { $in: ['AVAILABLE', 'SCHEDULED'] },
              assignedToId: { $exists: false },
            }).sort({ createdAt: 1 })
          : task

      if (!targetTask) {
        throw new HttpError(400, 'No open slot is available for this task')
      }

      targetTask.assignedToId = assignee._id
      targetTask.lastAssignedToId = assignee._id
      targetTask.status = targetTask.publishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'ASSIGNED'
      await targetTask.save()

      await activityService.create(
        'TASK_TAKEN',
        `Task assigned: ${targetTask.title}`,
        `${assignee.name} was assigned directly from the admin backoffice.`,
      )
      emitRealtimeEvent('tasks:updated', { type: 'admin-assigned', taskId, assigneeId })
      return serializeTask(targetTask.toObject())
    },

    async unassign(taskId: string, audience?: TaskAudience) {
      const task = await TaskModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Task not found')
      if (audience && task.audience !== audience) {
        throw new HttpError(400, 'Task audience does not match this assignment flow')
      }

      const previousAssigneeId = task.assignedToId ? String(task.assignedToId) : undefined
      const previousAssignee = previousAssigneeId ? await UserModel.findById(previousAssigneeId) : null

      task.status = task.publishedAt.getTime() > Date.now() ? 'SCHEDULED' : 'AVAILABLE'
      task.set('assignedToId', undefined)
      task.publishedAt = new Date()
      await task.save()

      await activityService.create(
        'TASK_RELEASED',
        `Task unassigned: ${task.title}`,
        previousAssignee
          ? `${previousAssignee.name} was removed from this task in assignment control.`
          : 'This task was returned to the shared board from assignment control.',
      )
      emitRealtimeEvent('tasks:updated', { type: 'admin-unassigned', taskId, previousAssigneeId })
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
      task.set('lastAssignedToId', userId)
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

    async complete(
      taskId: string,
      userId: string,
      actorRole: UserRole = 'VOLUNTEER',
      resultingBedState?: 'READY' | 'OCCUPIED',
    ) {
      const task = await TaskModel.findById(taskId)
      if (!task || String(task.assignedToId) !== userId) throw new HttpError(400, 'Task cannot be completed by this user')
      if (task.audience !== audienceForRole(actorRole)) throw new HttpError(403, 'This task does not belong to your workspace')
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, actorRole === 'CLEANER' ? 'Cleaner not found' : 'Volunteer not found')
      if (actorRole === 'VOLUNTEER' && task.bedTask && !resultingBedState) {
        throw new HttpError(400, 'A resulting bed state is required for bed-making tasks')
      }

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
        if (task.cleaningLocationType === 'ROOM' && (task.cleaningRoomNumber || task.cleaningRoomCode)) {
          const existingStatus = await CleaningPlaceStatusModel.findOne({
            placeType: 'ROOM',
            ...(task.cleaningRoomCode ? { roomCode: task.cleaningRoomCode } : { roomNumber: task.cleaningRoomNumber }),
          })
          const currentBeds = Array.isArray(existingStatus?.beds)
            ? existingStatus.beds.map((bed) => ({
                bedNumber: bed.bedNumber,
                label: bed.label,
                color: bed.color,
              }))
            : []
          const roomType = existingStatus?.roomType ?? 'PRIVATE'
          const roomSummary = roomType === 'SHARED' ? summarizeBeds(currentBeds) : undefined

          await CleaningPlaceStatusModel.findOneAndUpdate(
            {
              placeType: 'ROOM',
              ...(task.cleaningRoomCode ? { roomCode: task.cleaningRoomCode } : { roomNumber: task.cleaningRoomNumber }),
            },
            {
              placeType: 'ROOM',
              roomNumber: task.cleaningRoomNumber,
              roomCode: task.cleaningRoomCode,
              roomSection: task.cleaningRoomSection,
              roomType,
              placeLabel: task.cleaningLocationLabel,
              label: roomSummary?.label ?? 'Clean',
              color: roomSummary?.color ?? '#22c55e',
              roomServiceLabel: 'Clean',
              roomServiceColor: '#22c55e',
              beds: currentBeds,
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

      if (actorRole === 'VOLUNTEER' && task.bedTask && resultingBedState) {
        await updateRoomBedStateFromTask(task, resultingBedState)
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
