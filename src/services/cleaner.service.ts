import { hashPassword } from '../lib/auth.js'
import { HttpError } from '../lib/http-error.js'
import { TaskCompletionModel } from '../models/task-completion.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { serializeTask, serializeUser } from '../utils/serializers.js'

export const createCleanerService = () => ({
  async list(filters: { search?: string; status?: 'active' | 'inactive' | 'all' }) {
    const query: Record<string, unknown> = { role: 'CLEANER' }
    if (filters.search) query.name = { $regex: filters.search, $options: 'i' }
    if (filters.status === 'active') query.isActive = true
    if (filters.status === 'inactive') query.isActive = false

    const cleaners = await UserModel.find(query).sort({ name: 1 }).lean()
    return cleaners.map(serializeUser)
  },

  async detail(userId: string) {
    const [cleaner, pendingTasks, completedTasks] = await Promise.all([
      UserModel.findOne({ _id: userId, role: 'CLEANER' }).lean(),
      TaskModel.find({
        audience: 'CLEANING',
        assignedToId: userId,
        status: { $in: ['ASSIGNED', 'SCHEDULED'] },
      }).sort({ startsAt: 1 }).lean(),
      TaskModel.find({
        audience: 'CLEANING',
        assignedToId: userId,
        status: 'COMPLETED',
      }).sort({ endsAt: -1, updatedAt: -1 }).lean(),
    ])

    if (!cleaner) throw new HttpError(404, 'Cleaner not found')

    return {
      cleaner: serializeUser(cleaner),
      pendingTasks: pendingTasks.map(serializeTask),
      completedTasks: completedTasks.map(serializeTask),
    }
  },

  async create(input: {
    name: string
    username: string
    password: string
    title: string
    shift: string
    email?: string
  }) {
    const user = await UserModel.create({
      role: 'CLEANER',
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
      isActive: true,
      points: 0,
      lifetimePoints: 0,
      completedTasks: 0,
    })

    return serializeUser(user.toObject())
  },

  async update(
    userId: string,
    input: {
      name: string
      username: string
      password?: string
      title: string
      shift: string
      email?: string
    },
  ) {
    const user = await UserModel.findOne({ _id: userId, role: 'CLEANER' })
    if (!user) throw new HttpError(404, 'Cleaner not found')

    user.name = input.name
    user.email = input.email || undefined
    user.username = input.username
    user.title = input.title
    user.shift = input.shift
    if (input.password) {
      user.passwordHash = await hashPassword(input.password)
      user.passwordPreview = input.password
    }

    await user.save()
    return serializeUser(user.toObject())
  },

  async toggleActive(userId: string) {
    const user = await UserModel.findOne({ _id: userId, role: 'CLEANER' })
    if (!user) throw new HttpError(404, 'Cleaner not found')
    user.isActive = !user.isActive
    await user.save()
    return serializeUser(user.toObject())
  },

  async remove(userId: string) {
    const user = await UserModel.findOne({ _id: userId, role: 'CLEANER' })
    if (!user) throw new HttpError(404, 'Cleaner not found')

    const now = new Date()
    const assignedTasks = await TaskModel.find({
      audience: 'CLEANING',
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

    await TaskCompletionModel.deleteMany({ volunteerId: user._id })
    await user.deleteOne()
    return { success: true }
  },
})
