import { ActivityType } from '../domain/enums.js'
import { ActivityModel } from '../models/activity.model.js'
import { serializeActivity } from '../utils/serializers.js'

export const createActivityService = () => ({
  async create(type: ActivityType, title: string, description: string) {
    return ActivityModel.create({ type, title, description })
  },

  async listRecent(limit = 20) {
    const activities = await ActivityModel.find().sort({ createdAt: -1 }).limit(limit).lean()
    return activities.map(serializeActivity)
  },
})
