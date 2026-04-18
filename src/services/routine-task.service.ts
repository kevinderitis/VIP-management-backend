import { TaskCategory, TaskPriority, TaskSource, Weekday } from '../domain/enums.js'
import { HttpError } from '../lib/http-error.js'
import { RoutineTaskAssignmentModel, RoutineTaskTemplateModel } from '../models/routine-task.model.js'
import { TaskCompletionModel } from '../models/task-completion.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { addThailandDays, combineDateAndTime, getThailandWeekday, startOfThailandDay } from '../utils/date.js'
import { serializeRoutineAssignment, serializeRoutineTask } from '../utils/serializers.js'
import { createActivityService } from './activity.service.js'
import { sendPushNotificationsToUsers } from './push-notification.service.js'

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
  (Object.keys(weekdayIndexes) as Weekday[]).find((weekday) => weekdayIndexes[weekday] === getThailandWeekday(date))

const eachDateInRange = (startsOn: Date, endsOn: Date) => {
  const dates: Date[] = []
  let cursor = startOfThailandDay(startsOn)
  const limit = startOfThailandDay(endsOn)

  while (cursor.getTime() <= limit.getTime()) {
    dates.push(new Date(cursor))
    cursor = addThailandDays(cursor, 1)
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

      const startsOn = startOfThailandDay(new Date(startsOnInput))
      const endsOn = startOfThailandDay(new Date(endsOnInput))

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
      await sendPushNotificationsToUsers([volunteerId], {
        title: 'Recurring tasks assigned',
        body: `${template.name} was scheduled for ${tasksToCreate.length} time slot${tasksToCreate.length === 1 ? '' : 's'}.`,
        tag: `routine-${String(assignment._id)}`,
        url: '/app/my-tasks',
      })
      emitRealtimeEvent('routines:assigned', { taskId, volunteerId, generated: tasksToCreate.length })
      return serializeRoutineAssignment(assignment.toObject())
    },

    async removeAssignment(assignmentId: string) {
      const assignment = await RoutineTaskAssignmentModel.findById(assignmentId)
      if (!assignment) throw new HttpError(404, 'Recurring assignment not found')

      const generatedTasks = await TaskModel.find({ routineAssignmentId: assignment._id })

      const completedTasks = generatedTasks.filter((task) => task.status === 'COMPLETED' && task.assignedToId)
      const impactedUserIds = [...new Set(completedTasks.map((task) => String(task.assignedToId)))]

      if (impactedUserIds.length > 0) {
        const users = await UserModel.find({ _id: { $in: impactedUserIds } })
        const userMap = new Map(users.map((user) => [String(user._id), user]))

        completedTasks.forEach((task) => {
          const user = userMap.get(String(task.assignedToId))
          if (!user) return
          user.completedTasks = Math.max(0, user.completedTasks - 1)
          user.points = Math.max(0, user.points - task.points)
          user.lifetimePoints = Math.max(0, user.lifetimePoints - task.points)
        })

        await Promise.all(users.map((user) => user.save()))
      }

      await TaskCompletionModel.deleteMany({
        taskId: { $in: generatedTasks.map((task) => task._id) },
      })
      await TaskModel.deleteMany({ routineAssignmentId: assignment._id })
      await assignment.deleteOne()

      emitRealtimeEvent('routines:assignment-deleted', { assignmentId })
      return { success: true }
    },

    async reassignAssignment(assignmentId: string, volunteerId: string) {
      const assignment = await RoutineTaskAssignmentModel.findById(assignmentId)
      if (!assignment) throw new HttpError(404, 'Recurring assignment not found')

      const volunteer = await UserModel.findById(volunteerId)
      if (!volunteer || volunteer.role !== 'VOLUNTEER') {
        throw new HttpError(404, 'Volunteer not found')
      }

      assignment.volunteerId = volunteer._id
      await assignment.save()

      await TaskModel.updateMany(
        { routineAssignmentId: assignment._id, status: { $in: ['ASSIGNED', 'SCHEDULED'] } },
        {
          $set: {
            assignedToId: volunteer._id,
            lastAssignedToId: volunteer._id,
          },
        },
      )

      await activityService.create(
        'ROUTINE_ASSIGNED',
        'Recurring assignment reassigned',
        `${volunteer.name} is now responsible for the selected recurring assignment.`,
      )
      await sendPushNotificationsToUsers([volunteerId], {
        title: 'Recurring assignment updated',
        body: `You are now assigned to a recurring task schedule.`,
        tag: `routine-reassign-${String(assignment._id)}`,
        url: '/app/my-tasks',
      })

      emitRealtimeEvent('routines:assignment-reassigned', { assignmentId, volunteerId })
      return serializeRoutineAssignment(assignment.toObject())
    },
  }
}
