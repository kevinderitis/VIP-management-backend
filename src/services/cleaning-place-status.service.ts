import { HttpError } from '../lib/http-error.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'

const serializeCleaningPlaceStatus = (status: {
  _id: unknown
  placeType: string
  roomNumber?: number | null
  cleaningAreaId?: unknown | null
  placeLabel: string
  label: string
  color: string
}) => ({
  id: String(status._id),
  placeType: String(status.placeType).toLowerCase().replaceAll('_', '-'),
  roomNumber: status.roomNumber ?? undefined,
  cleaningAreaId: status.cleaningAreaId ? String(status.cleaningAreaId) : undefined,
  placeLabel: status.placeLabel,
  label: status.label,
  color: status.color,
})

export const createCleaningPlaceStatusService = () => ({
  async list() {
    const statuses = await CleaningPlaceStatusModel.find().sort({ updatedAt: -1 }).lean()
    return statuses.map(serializeCleaningPlaceStatus)
  },

  async upsert(input: {
    placeType: 'ROOM' | 'CUSTOM'
    roomNumber?: number
    cleaningAreaId?: string
    placeLabel: string
    label: string
    color: string
    assignCleanerId?: string
    adminUserId: string
  }) {
    if (input.placeType === 'ROOM' && !input.roomNumber) {
      throw new HttpError(400, 'Room number is required for room statuses')
    }

    if (input.placeType === 'CUSTOM' && !input.cleaningAreaId) {
      throw new HttpError(400, 'Custom place id is required for custom place statuses')
    }

    let assigneeId: string | undefined
    if (input.assignCleanerId) {
      const cleaner = await UserModel.findOne({ _id: input.assignCleanerId, role: 'CLEANER' }).lean()
      if (!cleaner) throw new HttpError(404, 'Cleaner not found')
      assigneeId = String(cleaner._id)
    }

    const query =
      input.placeType === 'ROOM'
        ? { placeType: input.placeType, roomNumber: input.roomNumber }
        : { placeType: input.placeType, cleaningAreaId: input.cleaningAreaId }

    const status = await CleaningPlaceStatusModel.findOneAndUpdate(
      query,
      {
        ...query,
        placeLabel: input.placeLabel,
        label: input.label,
        color: input.color,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )

    if (!status) throw new HttpError(500, 'Could not save cleaning place status')

    const normalizedLabel = input.label.trim().toLowerCase()
    if (normalizedLabel === 'need cleaning' || normalizedLabel === 'needs cleaning') {
      const autoTitle =
        input.placeType === 'ROOM' ? `Clean Room ${input.roomNumber}` : `Clean ${input.placeLabel}`
      const autoDescription =
        input.placeType === 'ROOM'
          ? `Clean room ${input.roomNumber} and leave it ready for the next guest. Make the bed, refresh surfaces, check the bathroom, and restock essentials if needed.`
          : `Clean ${input.placeLabel} and leave the area tidy, sanitized, and ready for normal hostel use. Check surfaces, supplies, and the overall presentation of the space.`

      const taskQuery =
        input.placeType === 'ROOM'
          ? {
              audience: 'CLEANING',
              cleaningLocationType: 'ROOM',
              cleaningRoomNumber: input.roomNumber,
              status: { $in: ['DRAFT', 'SCHEDULED', 'AVAILABLE', 'ASSIGNED'] },
            }
          : {
              audience: 'CLEANING',
              cleaningLocationType: 'CUSTOM',
              cleaningLocationLabel: input.placeLabel,
              status: { $in: ['DRAFT', 'SCHEDULED', 'AVAILABLE', 'ASSIGNED'] },
            }

      const existingTask = await TaskModel.findOne(taskQuery).sort({ createdAt: -1 })

      if (existingTask) {
        existingTask.title = autoTitle
        existingTask.description = autoDescription
        existingTask.publishedAt = new Date()
        if (assigneeId) {
          existingTask.set('assignedToId', assigneeId)
        }
        existingTask.status = existingTask.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
        await existingTask.save()
      } else {
        const startsAt = new Date()
        const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)
        await TaskModel.create({
          title: autoTitle,
          description: autoDescription,
          category: 'HOUSEKEEPING',
          priority: 'MEDIUM',
          status: assigneeId ? 'ASSIGNED' : 'AVAILABLE',
          audience: 'CLEANING',
          points: 0,
          publishedAt: startsAt,
          startsAt,
          endsAt,
          source: 'MANUAL',
          createdById: input.adminUserId,
          assignedToId: assigneeId,
          cleaningLocationType: input.placeType,
          cleaningLocationLabel: input.placeLabel,
          cleaningRoomNumber: input.roomNumber,
        })
      }

      emitRealtimeEvent('tasks:updated', { type: 'cleaning-place-updated', placeLabel: input.placeLabel })
    }

    return serializeCleaningPlaceStatus(status.toObject())
  },
})
