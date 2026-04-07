import { ActivityModel } from '../models/activity.model.js'
import { RedemptionModel } from '../models/reward.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { serializeActivity, serializeRedemption } from '../utils/serializers.js'

export const createDashboardService = () => ({
  async adminOverview() {
    const [activeVolunteers, availableTasks, scheduledTasks, completedTasks, volunteers, redemptions, activities] =
      await Promise.all([
        UserModel.countDocuments({ role: 'VOLUNTEER', isActive: true }),
        TaskModel.countDocuments({ audience: 'VOLUNTEER', status: 'AVAILABLE' }),
        TaskModel.countDocuments({ audience: 'VOLUNTEER', status: 'SCHEDULED' }),
        TaskModel.countDocuments({ audience: 'VOLUNTEER', status: 'COMPLETED' }),
        UserModel.find({ role: 'VOLUNTEER' }).select({ lifetimePoints: 1 }).lean(),
        RedemptionModel.find().sort({ createdAt: -1 }).limit(10).lean(),
        ActivityModel.find().sort({ createdAt: -1 }).limit(12).lean(),
      ])

    return {
      metrics: {
        activeVolunteers,
        availableTasks,
        scheduledTasks,
        completedTasks,
        pointsDelivered: volunteers.reduce((sum, volunteer) => sum + (volunteer.lifetimePoints ?? 0), 0),
      },
      recentRedemptions: redemptions.map(serializeRedemption),
      recentActivity: activities.map(serializeActivity),
    }
  },
})
