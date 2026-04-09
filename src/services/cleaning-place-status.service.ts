import { BED_STATUS_PRESETS, presetForStatus, RoomType, statusFromLabel, summarizeBeds } from '../domain/cleaning-places.js'
import { HttpError } from '../lib/http-error.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { serializeCleaningPlaceStatus } from '../utils/serializers.js'

type BedInput = {
  bedNumber: number
  label: string
  color: string
}

type UpsertInput = {
  placeType: 'ROOM' | 'CUSTOM'
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  roomType?: RoomType
  cleaningAreaId?: string
  placeLabel: string
  label: string
  color: string
  beds?: BedInput[]
  assignCleanerId?: string
  assignVolunteerId?: string
  adminUserId: string
}

const ACTIVE_TASK_STATUSES = ['DRAFT', 'SCHEDULED', 'AVAILABLE', 'ASSIGNED'] as const
const REUSABLE_BED_TASK_STATUSES = [...ACTIVE_TASK_STATUSES, 'CANCELLED', 'COMPLETED'] as const
const cleaningRequestLabels = ['need cleaning', 'needs cleaning']

const roomTitle = (roomCode?: string, roomNumber?: number) => `Room ${roomCode ?? roomNumber}`
const needsCleaningRequest = (value?: string) => cleaningRequestLabels.includes(value?.trim().toLowerCase() ?? '')

const deriveBoardStatus = (input: {
  roomServiceLabel?: string
  roomServiceColor?: string
  beds: BedInput[]
}) => {
  if (needsCleaningRequest(input.roomServiceLabel)) {
    return {
      label: input.roomServiceLabel ?? 'Needs cleaning',
      color: input.roomServiceColor ?? '#ef4444',
    }
  }

  return summarizeBeds(input.beds)
}

const buildBedTaskTitle = (roomCode: string | undefined, roomNumber: number | undefined, bedNumber?: number) =>
  bedNumber
    ? `Make bed · ${roomTitle(roomCode, roomNumber)} · Bed ${bedNumber}`
    : `Make bed · ${roomTitle(roomCode, roomNumber)}`

const buildBedTaskDescription = (roomCode: string | undefined, roomNumber: number | undefined, bedNumber?: number) =>
  bedNumber
    ? `Prepare bed ${bedNumber} in ${roomTitle(roomCode, roomNumber)}. Replace linen, tidy pillows, and leave the bed ready for the next guest.`
    : `Make the bed in private ${roomTitle(roomCode, roomNumber)}, refresh the linen setup, and leave the room ready for the next guest.`

const normalizeBeds = (beds: BedInput[] | undefined, roomType: RoomType) => {
  if (roomType === 'PRIVATE') {
    const firstBed = beds?.[0]
    const preset = presetForStatus(firstBed?.label)
    return [
      {
        bedNumber: 1,
        label: firstBed?.label ?? preset.label,
        color: firstBed?.color ?? preset.color,
      },
    ]
  }

  const source = beds?.length
    ? beds
    : Array.from({ length: 4 }, (_, index) => ({
        bedNumber: index + 1,
        label: BED_STATUS_PRESETS.READY.label,
        color: BED_STATUS_PRESETS.READY.color,
      }))

  return source
    .slice()
    .sort((left, right) => left.bedNumber - right.bedNumber)
    .map((bed) => {
      const preset = presetForStatus(bed.label)
      return {
        bedNumber: bed.bedNumber,
        label: bed.label || preset.label,
        color: bed.color || preset.color,
      }
    })
}

const syncBedTask = async (input: {
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  bedNumber?: number
  placeLabel: string
  adminUserId: string
  assignVolunteerId?: string
  shouldBeActive: boolean
}) => {
  const query = {
    audience: 'VOLUNTEER' as const,
    bedTask: true,
    cleaningLocationType: 'ROOM' as const,
    ...(input.roomCode ? { cleaningRoomCode: input.roomCode } : { cleaningRoomNumber: input.roomNumber }),
    ...(input.bedNumber ? { cleaningBedNumber: input.bedNumber } : {}),
  }

  const candidates = await TaskModel.find({
    ...query,
    status: { $in: REUSABLE_BED_TASK_STATUSES },
  }).sort({ createdAt: -1 })

  const existingTask =
    input.bedNumber == null
      ? candidates.find((task) => !task.cleaningBedNumber)
      : candidates.find((task) => task.cleaningBedNumber === input.bedNumber)

  if (!input.shouldBeActive) {
    if (existingTask && existingTask.status !== 'COMPLETED' && existingTask.status !== 'CANCELLED') {
      existingTask.status = 'CANCELLED'
      existingTask.set('assignedToId', undefined)
      await existingTask.save()
    }
    return
  }

  const title = buildBedTaskTitle(input.roomCode, input.roomNumber, input.bedNumber)
  const description = buildBedTaskDescription(input.roomCode, input.roomNumber, input.bedNumber)

  if (existingTask) {
    existingTask.title = title
    existingTask.description = description
    existingTask.publishedAt = new Date()
    if (input.assignVolunteerId) {
      existingTask.set('assignedToId', input.assignVolunteerId)
      existingTask.set('lastAssignedToId', input.assignVolunteerId)
    } else {
      existingTask.set('assignedToId', undefined)
    }
    existingTask.status = existingTask.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
    await existingTask.save()
    return
  }

  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)

  await TaskModel.create({
    title,
    description,
    category: 'HOUSEKEEPING',
    priority: 'MEDIUM',
    audience: 'VOLUNTEER',
    points: 10,
    publishedAt: startsAt,
    startsAt,
    endsAt,
    source: 'MANUAL',
    createdById: input.adminUserId,
    assignedToId: input.assignVolunteerId,
    lastAssignedToId: input.assignVolunteerId,
    cleaningLocationType: 'ROOM',
    cleaningLocationLabel: input.placeLabel,
    cleaningRoomNumber: input.roomNumber,
    cleaningRoomCode: input.roomCode,
    cleaningRoomSection: input.roomSection,
    cleaningBedNumber: input.bedNumber,
    bedTask: true,
    status: input.assignVolunteerId ? 'ASSIGNED' : 'AVAILABLE',
  })
}

const syncRoomBedTasks = async (input: {
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  roomType: RoomType
  placeLabel: string
  beds: BedInput[]
  adminUserId: string
  assignVolunteerId?: string
}) => {
  const expectedActiveKeys = new Set(
    input.beds
      .filter((bed) => statusFromLabel(bed.label) === 'NEEDS_MAKING')
      .map((bed) => (input.roomType === 'PRIVATE' ? 'private' : String(bed.bedNumber))),
  )

  const existingTasks = await TaskModel.find({
    audience: 'VOLUNTEER',
    bedTask: true,
    cleaningLocationType: 'ROOM',
    ...(input.roomCode ? { cleaningRoomCode: input.roomCode } : { cleaningRoomNumber: input.roomNumber }),
    status: { $in: ACTIVE_TASK_STATUSES },
  })

  for (const task of existingTasks) {
    const key = task.cleaningBedNumber ? String(task.cleaningBedNumber) : 'private'
    if (!expectedActiveKeys.has(key)) {
      task.status = 'CANCELLED'
      task.set('assignedToId', undefined)
      await task.save()
    }
  }

  for (const bed of input.beds) {
    await syncBedTask({
      roomNumber: input.roomNumber,
      roomCode: input.roomCode,
      roomSection: input.roomSection,
      bedNumber: input.roomType === 'PRIVATE' ? undefined : bed.bedNumber,
      placeLabel: input.placeLabel,
      adminUserId: input.adminUserId,
      assignVolunteerId:
        statusFromLabel(bed.label) === 'NEEDS_MAKING' ? input.assignVolunteerId : undefined,
      shouldBeActive: statusFromLabel(bed.label) === 'NEEDS_MAKING',
    })
  }
}

const syncCleaningServiceTask = async (input: {
  placeType: 'ROOM' | 'CUSTOM'
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  placeLabel: string
  adminUserId: string
  assignCleanerId?: string
}) => {
  const autoTitle = input.placeType === 'ROOM' ? `Clean ${roomTitle(input.roomCode, input.roomNumber)}` : `Clean ${input.placeLabel}`
  const autoDescription =
    input.placeType === 'ROOM'
      ? `Clean ${roomTitle(input.roomCode, input.roomNumber)} and leave it ready for the next guest. Make the bed, refresh surfaces, check the bathroom, and restock essentials if needed.`
      : `Clean ${input.placeLabel} and leave the area tidy, sanitized, and ready for normal hostel use. Check surfaces, supplies, and the overall presentation of the space.`

  const existingTask = await TaskModel.findOne({
    audience: 'CLEANING',
    cleaningLocationType: input.placeType,
    ...(input.placeType === 'ROOM'
      ? input.roomCode
        ? { cleaningRoomCode: input.roomCode }
        : { cleaningRoomNumber: input.roomNumber }
      : { cleaningLocationLabel: input.placeLabel }),
    status: { $in: ACTIVE_TASK_STATUSES },
  }).sort({ createdAt: -1 })

  if (existingTask) {
    existingTask.title = autoTitle
    existingTask.description = autoDescription
    existingTask.publishedAt = new Date()
    if (input.assignCleanerId) {
      existingTask.set('assignedToId', input.assignCleanerId)
    }
    existingTask.status = existingTask.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
    await existingTask.save()
    return
  }

  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)
  await TaskModel.create({
    title: autoTitle,
    description: autoDescription,
    category: 'HOUSEKEEPING',
    priority: 'MEDIUM',
    status: input.assignCleanerId ? 'ASSIGNED' : 'AVAILABLE',
    audience: 'CLEANING',
    points: 0,
    publishedAt: startsAt,
    startsAt,
    endsAt,
    source: 'MANUAL',
    createdById: input.adminUserId,
    assignedToId: input.assignCleanerId,
    cleaningLocationType: input.placeType,
    cleaningLocationLabel: input.placeLabel,
    cleaningRoomNumber: input.roomNumber,
    cleaningRoomCode: input.roomCode,
    cleaningRoomSection: input.roomSection,
  })
}

export const createCleaningPlaceStatusService = () => ({
  async list() {
    const statuses = await CleaningPlaceStatusModel.find().sort({ updatedAt: -1 }).lean()
    return statuses.map(serializeCleaningPlaceStatus)
  },

  async upsert(input: UpsertInput) {
    if (input.placeType === 'ROOM' && !input.roomNumber && !input.roomCode) {
      throw new HttpError(400, 'Room code is required for room statuses')
    }

    if (input.placeType === 'CUSTOM' && !input.cleaningAreaId) {
      throw new HttpError(400, 'Custom place id is required for custom place statuses')
    }

    let assigneeId: string | undefined
    let volunteerAssigneeId: string | undefined
    if (input.assignCleanerId) {
      const cleaner = await UserModel.findOne({ _id: input.assignCleanerId, role: 'CLEANER' }).lean()
      if (!cleaner) throw new HttpError(404, 'Cleaner not found')
      assigneeId = String(cleaner._id)
    }
    if (input.assignVolunteerId) {
      const volunteer = await UserModel.findOne({ _id: input.assignVolunteerId, role: 'VOLUNTEER' }).lean()
      if (!volunteer) throw new HttpError(404, 'Volunteer not found')
      volunteerAssigneeId = String(volunteer._id)
    }

    const query =
      input.placeType === 'ROOM'
        ? input.roomCode
          ? { placeType: input.placeType, roomCode: input.roomCode }
          : { placeType: input.placeType, roomNumber: input.roomNumber }
        : { placeType: input.placeType, cleaningAreaId: input.cleaningAreaId }

    if (input.placeType === 'ROOM') {
      const roomType = input.roomType ?? 'PRIVATE'
      const beds = normalizeBeds(input.beds, roomType)
      const roomServiceLabel = input.label
      const roomServiceColor = input.color
      const summary = roomType === 'SHARED'
        ? deriveBoardStatus({ roomServiceLabel, roomServiceColor, beds })
        : { label: roomServiceLabel, color: roomServiceColor }

      const status = await CleaningPlaceStatusModel.findOneAndUpdate(
        query,
        {
          ...query,
          roomCode: input.roomCode,
          roomSection: input.roomSection,
          roomType,
          placeLabel: input.placeLabel,
          label: summary.label,
          color: summary.color,
          roomServiceLabel,
          roomServiceColor,
          beds,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )

      if (!status) throw new HttpError(500, 'Could not save room status')

      await syncRoomBedTasks({
        roomNumber: input.roomNumber!,
        roomCode: input.roomCode,
        roomSection: input.roomSection,
        roomType,
        placeLabel: input.placeLabel,
        beds,
        adminUserId: input.adminUserId,
        assignVolunteerId: volunteerAssigneeId,
      })

      if (needsCleaningRequest(input.label)) {
        await syncCleaningServiceTask({
          placeType: 'ROOM',
          roomNumber: input.roomNumber,
          roomCode: input.roomCode,
          roomSection: input.roomSection,
          placeLabel: input.placeLabel,
          adminUserId: input.adminUserId,
          assignCleanerId: assigneeId,
        })
      }

      emitRealtimeEvent('tasks:updated', { type: 'room-beds-updated', roomCode: input.roomCode ?? input.roomNumber })
      return serializeCleaningPlaceStatus(status.toObject())
    }

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
      await syncCleaningServiceTask({
        placeType: 'CUSTOM',
        placeLabel: input.placeLabel,
        adminUserId: input.adminUserId,
        assignCleanerId: assigneeId,
      })
    }

    emitRealtimeEvent('tasks:updated', { type: 'cleaning-place-updated', placeLabel: input.placeLabel })
    return serializeCleaningPlaceStatus(status.toObject())
  },
})
