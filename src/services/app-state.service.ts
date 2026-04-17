import { ActivityModel } from '../models/activity.model.js'
import { BedConflictModel } from '../models/bed-conflict.model.js'
import { CleaningAreaModel } from '../models/cleaning-area.model.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { CleaningRoomModel } from '../models/cleaning-room.model.js'
import { OfficeCallModel } from '../models/office-call.model.js'
import { RedemptionModel, RewardModel } from '../models/reward.model.js'
import { RoutineTaskAssignmentModel, RoutineTaskTemplateModel } from '../models/routine-task.model.js'
import { TaskCompletionModel } from '../models/task-completion.model.js'
import { TaskPackAssignmentModel } from '../models/task-pack-assignment.model.js'
import { TaskPackModel } from '../models/task-pack.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { createCleaningRoomService } from './cleaning-room.service.js'
import {
  serializeActivity,
  serializeBedConflict,
  serializeCompletion,
  serializeCleaningPlaceStatus,
  serializeCleaningRoom,
  serializeOfficeCall,
  serializePack,
  serializePackAssignment,
  serializeRedemption,
  serializeReward,
  serializeRoutineAssignment,
  serializeRoutineTask,
  serializeTask,
  serializeUser,
} from '../utils/serializers.js'
import { UserRole } from '../domain/enums.js'

export const createAppStateService = () => ({
  async getState(userId: string, role: UserRole) {
    await createCleaningRoomService().ensureDefaults()

    const isAdmin = role === 'ADMIN'
    const isCleaner = role === 'CLEANER'

    const [users, tasks, packs, packAssignments, routineTasks, routineAssignments, taskHistory, rewards, redemptions, activities, cleaningAreas, cleaningPlaceStatuses, cleaningRooms, officeCalls, bedConflicts] =
      await Promise.all([
        UserModel.find(
          isAdmin ? {} : isCleaner ? { role: 'CLEANER' } : { role: 'VOLUNTEER' },
        )
          .sort({ name: 1 })
          .lean(),
        TaskModel.find(
          isAdmin ? {} : { audience: isCleaner ? 'CLEANING' : 'VOLUNTEER' },
        )
          .sort({ startsAt: 1, createdAt: -1 })
          .lean(),
        isCleaner ? Promise.resolve([]) : TaskPackModel.find().sort({ name: 1 }).lean(),
        isCleaner
          ? Promise.resolve([])
          : TaskPackAssignmentModel.find(isAdmin ? {} : { volunteerId: userId }).sort({ createdAt: -1 }).lean(),
        isCleaner ? Promise.resolve([]) : RoutineTaskTemplateModel.find().sort({ name: 1 }).lean(),
        isCleaner
          ? Promise.resolve([])
          : RoutineTaskAssignmentModel.find(isAdmin ? {} : { volunteerId: userId }).sort({ createdAt: -1 }).lean(),
        TaskCompletionModel.find(isAdmin ? {} : { volunteerId: userId }).sort({ completedAt: -1 }).lean(),
        isCleaner ? Promise.resolve([]) : RewardModel.find().sort({ cost: 1 }).lean(),
        isCleaner
          ? Promise.resolve([])
          : RedemptionModel.find(isAdmin ? {} : { volunteerId: userId }).sort({ createdAt: -1 }).lean(),
        ActivityModel.find().sort({ createdAt: -1 }).limit(200).lean(),
        CleaningAreaModel.find().sort({ name: 1 }).lean(),
        CleaningPlaceStatusModel.find().sort({ updatedAt: -1 }).lean(),
        CleaningRoomModel.find().sort({ section: 1, code: 1 }).lean(),
        role === 'VOLUNTEER'
          ? OfficeCallModel.find({ volunteerId: userId, status: 'ACTIVE' }).sort({ createdAt: -1 }).lean()
          : Promise.resolve([]),
        isAdmin ? BedConflictModel.find({ resolvedAt: null }).sort({ createdAt: -1 }).lean() : Promise.resolve([]),
      ])

    return {
      users: users.map(serializeUser),
      tasks: tasks.map(serializeTask),
      groups: packs.map(serializePack),
      packAssignments: packAssignments.map(serializePackAssignment),
      routineTasks: routineTasks.map(serializeRoutineTask),
      routineAssignments: routineAssignments.map(serializeRoutineAssignment),
      taskHistory: taskHistory.map(serializeCompletion),
      rewards: rewards.map(serializeReward),
      redemptions: redemptions.map(serializeRedemption),
      activities: activities.map(serializeActivity),
      officeCalls: officeCalls.map(serializeOfficeCall),
      bedConflicts: bedConflicts.map(serializeBedConflict),
      cleaningAreas: cleaningAreas.map((area) => ({
        id: String(area._id),
        name: area.name,
        isActive: area.isActive,
      })),
      cleaningPlaceStatuses: cleaningPlaceStatuses.map(serializeCleaningPlaceStatus),
      cleaningRooms: cleaningRooms.map(serializeCleaningRoom),
    }
  },
})
