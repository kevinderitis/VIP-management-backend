import { TaskCategory, TaskPriority, TaskSource, Weekday } from '../domain/enums.js'
import { HttpError } from '../lib/http-error.js'
import { RoutineTaskAssignmentModel, RoutineTaskTemplateModel } from '../models/routine-task.model.js'
import { TaskModel } from '../models/task.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { combineDateAndTime } from '../utils/date.js'
import { serializeRoutineAssignment, serializeRoutineTask } from '../utils/serializers.js'
import { createActivityService } from './activity.service.js'

const weekdayIndexes: Record<Weekday, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 0,
}

const weekdayFromDate = (date: Date) =>
  (Object.keys(weekdayIndexes) as Weekday[]).find((weekday) => weekdayIndexes[weekday] === date.getDay())

const eachDateInRange = (startsOn: Date, endsOn: Date) => {
  const dates: Date[] = []
  const cursor = new Date(startsOn)
  cursor.setHours(0, 0, 0, 0)
  const limit = new Date(endsOn)
  limit.setHours(0, 0, 0, 0)

  while (cursor.getTime() <= limit.getTime()) {
    dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

export const createRoutineTaskService = () => {
  const activityService = createActivityService()

  return {
    async list() {
      const tasks = await RoutineTaskTemplateModel.find().sort({ name: 1 }).lean()
      return tasks.map(serializeRoutineTask)
    },

    async create(input: {
      name: string
      description: string
      category: TaskCategory
      priority: TaskPriority
      points: number
      notes?: string
    }) {
      const task = await RoutineTaskTemplateModel.create(input)
      return serializeRoutineTask(task.toObject())
    },

    async update(taskId: string, input: {
      name: string
      description: string
      category: TaskCategory
      priority: TaskPriority
      points: number
      notes?: string
    }) {
      const task = await RoutineTaskTemplateModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Standard task not found')
      Object.assign(task, input)
      await task.save()
      return serializeRoutineTask(task.toObject())
    },

    async toggle(taskId: string) {
      const task = await RoutineTaskTemplateModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Standard task not found')
      task.isActive = !task.isActive
      await task.save()
      return serializeRoutineTask(task.toObject())
    },

    async remove(taskId: string) {
      const task = await RoutineTaskTemplateModel.findById(taskId)
      if (!task) throw new HttpError(404, 'Standard task not found')

      await Promise.all([
        TaskModel.deleteMany({ routineTemplateId: task._id }),
        RoutineTaskAssignmentModel.deleteMany({ templateId: task._id }),
      ])
      await task.deleteOne()
      emitRealtimeEvent('routines:deleted', { taskId })
      return { success: true }
    },

    async assign(
      taskId: string,
      volunteerId: string,
      startsOnInput: Date,
      endsOnInput: Date,
      weekdays: Weekday[],
      startTime: string,
      endTime: string,
      createdById?: string,
    ) {
      const template = await RoutineTaskTemplateModel.findById(taskId).lean()
      if (!template) throw new HttpError(404, 'Standard task not found')
      if (new Date(endsOnInput).getTime() < new Date(startsOnInput).getTime()) {
        throw new HttpError(400, 'End date must be later than or equal to start date')
      }

      const startsOn = new Date(startsOnInput)
      startsOn.setHours(0, 0, 0, 0)
      const endsOn = new Date(endsOnInput)
      endsOn.setHours(0, 0, 0, 0)

      const assignment = await RoutineTaskAssignmentModel.create({
        templateId: taskId,
        volunteerId,
        startsOn,
        endsOn,
        weekdays,
        startTime,
        endTime,
      })

      const weekdaySet = new Set(weekdays)
      const dates = eachDateInRange(startsOn, endsOn).filter((date) => {
        const weekday = weekdayFromDate(date)
        return weekday ? weekdaySet.has(weekday) : false
      })

      const tasksToCreate = dates.map((date) => {
        const startsAt = combineDateAndTime(date, startTime)
        const endsAt = combineDateAndTime(date, endTime)

        return {
          title: template.name,
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
          source: 'ROUTINE' satisfies TaskSource,
          routineTemplateId: taskId,
          routineAssignmentId: assignment._id,
          notes: template.notes,
        }
      })

      if (tasksToCreate.length === 0) {
        throw new HttpError(400, 'No matching dates were generated for the selected range and weekdays')
      }

      await TaskModel.insertMany(tasksToCreate)

      await activityService.create(
        'ROUTINE_ASSIGNED',
        'Recurring task assigned',
        'Scheduled task instances were generated for the selected dates, weekdays, and time window.',
      )
      emitRealtimeEvent('routines:assigned', { taskId, volunteerId, generated: tasksToCreate.length })
      return serializeRoutineAssignment(assignment.toObject())
    },
  }
}
