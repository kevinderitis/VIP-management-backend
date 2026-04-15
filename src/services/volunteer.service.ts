import { UserModel } from '../models/user.model.js'
import { TaskModel } from '../models/task.model.js'
import { TaskCompletionModel } from '../models/task-completion.model.js'
import { TaskPackAssignmentModel } from '../models/task-pack-assignment.model.js'
import { RoutineTaskAssignmentModel } from '../models/routine-task.model.js'
import { RedemptionModel } from '../models/reward.model.js'
import { hashPassword } from '../lib/auth.js'
import { HttpError } from '../lib/http-error.js'
import { serializeCompletion, serializeTask, serializeUser } from '../utils/serializers.js'
import { UserRole, Weekday } from '../domain/enums.js'

export const createVolunteerService = () => ({
  async list(filters: { search?: string; status?: 'active' | 'inactive' | 'all' }) {
    const query: Record<string, unknown> = { role: 'VOLUNTEER' satisfies UserRole }
    if (filters.search) query.name = { $regex: filters.search, $options: 'i' }
    if (filters.status === 'active') query.isActive = true
    if (filters.status === 'inactive') query.isActive = false

    const volunteers = await UserModel.find(query).sort({ name: 1 }).lean()
    return volunteers.map(serializeUser)
  },

  async detail(userId: string) {
    const [volunteer, pendingTasks, completions] = await Promise.all([
      UserModel.findOne({ _id: userId, role: 'VOLUNTEER' }).lean(),
      TaskModel.find({
        assignedToId: userId,
        status: { $in: ['ASSIGNED', 'SCHEDULED'] },
      }).sort({ startsAt: 1 }).lean(),
      TaskCompletionModel.find({ volunteerId: userId }).sort({ completedAt: -1 }).lean(),
    ])

    if (!volunteer) throw new HttpError(404, 'Volunteer not found')

    return {
      volunteer: serializeUser(volunteer),
      pendingTasks: pendingTasks.map(serializeTask),
      completions: completions.map(serializeCompletion),
    }
  },

  async create(input: {
    name: string
    email?: string
    username: string
    password: string
    title: string
    shift: string
    offDay: Weekday
    badge?: string
  }) {
    const existingByUsername = await UserModel.findOne({ username: input.username }).lean()
    if (existingByUsername) {
      throw new HttpError(409, 'This username is already in use')
    }

    if (input.email) {
      const existingByEmail = await UserModel.findOne({ email: input.email }).lean()
      if (existingByEmail) {
        throw new HttpError(409, 'This email is already in use')
      }
    }

    const user = await UserModel.create({
      role: 'VOLUNTEER',
      name: input.name,
      email: input.email || undefined,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      passwordPreview: input.password,
      avatar: input.name
        .split(' ')
        .map((item) => item[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      title: input.title,
      shift: input.shift,
      offDay: input.offDay,
      badge: input.badge,
    })

    return serializeUser(user.toObject())
  },

  async update(
    userId: string,
    input: {
      name: string
      email?: string
      username: string
      password?: string
      title: string
      shift: string
      offDay: Weekday
      badge?: string
    },
  ) {
    const user = await UserModel.findOne({ _id: userId, role: 'VOLUNTEER' })
    if (!user) throw new HttpError(404, 'Volunteer not found')

    const existingByUsername = await UserModel.findOne({
      username: input.username,
      _id: { $ne: userId },
    }).lean()
    if (existingByUsername) {
      throw new HttpError(409, 'This username is already in use')
    }

    if (input.email) {
      const existingByEmail = await UserModel.findOne({
        email: input.email,
        _id: { $ne: userId },
      }).lean()
      if (existingByEmail) {
        throw new HttpError(409, 'This email is already in use')
      }
    }

    user.name = input.name
    user.email = input.email || undefined
    user.username = input.username
    user.title = input.title
    user.shift = input.shift
    user.offDay = input.offDay
    user.badge = input.badge
    if (input.password) {
      user.passwordHash = await hashPassword(input.password)
      user.passwordPreview = input.password
    }
    await user.save()

    return serializeUser(user.toObject())
  },

  async toggleActive(userId: string) {
    const user = await UserModel.findOne({ _id: userId, role: 'VOLUNTEER' })
    if (!user) throw new HttpError(404, 'Volunteer not found')
    user.isActive = !user.isActive
    await user.save()
    return serializeUser(user.toObject())
  },

  async remove(userId: string) {
    const user = await UserModel.findOne({ _id: userId, role: 'VOLUNTEER' })
    if (!user) throw new HttpError(404, 'Volunteer not found')

    const now = new Date()
    const assignedTasks = await TaskModel.find({
      assignedToId: user._id,
      status: { $in: ['ASSIGNED', 'SCHEDULED'] },
    })

    await Promise.all(
      assignedTasks.map(async (task) => {
        task.set('assignedToId', undefined)
        task.status = task.publishedAt.getTime() > now.getTime() ? 'SCHEDULED' : 'AVAILABLE'
        await task.save()
      }),
    )

    await Promise.all([
      TaskCompletionModel.deleteMany({ volunteerId: user._id }),
      TaskPackAssignmentModel.deleteMany({ volunteerId: user._id }),
      RoutineTaskAssignmentModel.deleteMany({ volunteerId: user._id }),
      RedemptionModel.deleteMany({ volunteerId: user._id }),
    ])

    await user.deleteOne()
    return { success: true }
  },
})
