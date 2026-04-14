import {
  BED_STATUS_PRESETS,
  BedStateKey,
  presetForStatus,
  RoomType,
  statusFromLabel,
  summarizeBeds,
} from '../domain/cleaning-places.js'
import { HttpError } from '../lib/http-error.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { CleaningRoomModel } from '../models/cleaning-room.model.js'
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
  applyVolunteerAssignment?: boolean
  adminUserId: string
}

type BulkBedTaskInput = {
  selections: Array<{
    roomCode: string
    roomSection?: string
    roomType: RoomType
    placeLabel: string
    bedNumbers: number[]
  }>
  assignVolunteerId?: string
  label: string
  color: string
  adminUserId: string
}

const ACTIVE_TASK_STATUSES = ['DRAFT', 'SCHEDULED', 'AVAILABLE', 'ASSIGNED'] as const
const REUSABLE_BED_TASK_STATUSES = [...ACTIVE_TASK_STATUSES, 'CANCELLED', 'COMPLETED'] as const
const cleaningRequestLabels = ['need cleaning', 'needs cleaning']
const activeBedStateKeys = new Set<BedStateKey>(['NEEDS_MAKING', 'CHECK'])
const bedStateRequiresTask = (stateKey?: BedStateKey) => Boolean(stateKey && activeBedStateKeys.has(stateKey))

const roomTitle = (roomCode?: string, roomNumber?: number) => `Room ${roomCode ?? roomNumber}`
const needsCleaningRequest = (value?: string) => cleaningRequestLabels.includes(value?.trim().toLowerCase() ?? '')
const bedKeyFor = (roomType: RoomType, bedNumber?: number) => (roomType === 'PRIVATE' ? 'private' : String(bedNumber))

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

const buildBedTaskCopy = (input: {
  roomCode?: string
  roomNumber?: number
  bedNumber?: number
  stateKey: BedStateKey
}) => {
  const roomLabel = roomTitle(input.roomCode, input.roomNumber)

  if (input.stateKey === 'CHECK') {
    return {
      title: input.bedNumber ? `Check bed · ${roomLabel} · Bed ${input.bedNumber}` : `Check bed · ${roomLabel}`,
      description: input.bedNumber
        ? `Inspect bed ${input.bedNumber} in ${roomLabel}. Verify linen, occupancy, and bed presentation, then mark it as ready or occupied when the check is complete.`
        : `Inspect the bed in private ${roomLabel}. Verify linen and occupancy, then mark it as ready or occupied when the check is complete.`,
    }
  }

  return {
    title: input.bedNumber ? `Make bed · ${roomLabel} · Bed ${input.bedNumber}` : `Make bed · ${roomLabel}`,
    description: input.bedNumber
      ? `Prepare bed ${input.bedNumber} in ${roomLabel}. Replace linen, tidy pillows, and leave the bed ready for the next guest.`
      : `Make the bed in private ${roomLabel}, refresh the linen setup, and leave the room ready for the next guest.`,
  }
}

const normalizeBeds = (beds: BedInput[] | undefined, roomType: RoomType, bedCount?: number) => {
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
    : Array.from({ length: Math.max(2, Math.min(14, bedCount ?? 4)) }, (_, index) => ({
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
  bedStateKey: BedStateKey
  shouldBeActive: boolean
  assignmentAction?: {
    volunteerId?: string
  }
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

  const { title, description } = buildBedTaskCopy({
    roomCode: input.roomCode,
    roomNumber: input.roomNumber,
    bedNumber: input.bedNumber,
    stateKey: input.bedStateKey,
  })

  if (existingTask) {
    existingTask.title = title
    existingTask.description = description
    existingTask.publishedAt = new Date()
    if (input.assignmentAction) {
      if (input.assignmentAction.volunteerId) {
        existingTask.set('assignedToId', input.assignmentAction.volunteerId)
        existingTask.set('lastAssignedToId', input.assignmentAction.volunteerId)
      } else {
        existingTask.set('assignedToId', undefined)
      }
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
    assignedToId: input.assignmentAction?.volunteerId,
    lastAssignedToId: input.assignmentAction?.volunteerId,
    cleaningLocationType: 'ROOM',
    cleaningLocationLabel: input.placeLabel,
    cleaningRoomNumber: input.roomNumber,
    cleaningRoomCode: input.roomCode,
    cleaningRoomSection: input.roomSection,
    cleaningBedNumber: input.bedNumber,
    bedTask: true,
    status: input.assignmentAction?.volunteerId ? 'ASSIGNED' : 'AVAILABLE',
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
  applyVolunteerAssignment?: boolean
  assignmentBedKeys?: Set<string>
}) => {
  const expectedActiveKeys = new Set(
    input.beds
      .filter((bed) => {
        const stateKey = statusFromLabel(bed.label)
        return bedStateRequiresTask(stateKey)
      })
      .map((bed) => bedKeyFor(input.roomType, bed.bedNumber)),
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
    const stateKey = statusFromLabel(bed.label) ?? 'READY'
    const taskKey = bedKeyFor(input.roomType, bed.bedNumber)
    const shouldApplyAssignment =
      input.assignmentBedKeys?.has(taskKey) ?? Boolean(input.applyVolunteerAssignment)
    const shouldKeepTaskActive = bedStateRequiresTask(stateKey)

    await syncBedTask({
      roomNumber: input.roomNumber,
      roomCode: input.roomCode,
      roomSection: input.roomSection,
      bedNumber: input.roomType === 'PRIVATE' ? undefined : bed.bedNumber,
      placeLabel: input.placeLabel,
      adminUserId: input.adminUserId,
      bedStateKey: stateKey,
      assignmentAction:
        shouldKeepTaskActive && shouldApplyAssignment
          ? { volunteerId: input.assignVolunteerId }
          : undefined,
      shouldBeActive: shouldKeepTaskActive,
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

const resolveVolunteerAssignee = async (assignVolunteerId?: string) => {
  if (!assignVolunteerId) return undefined
  const volunteer = await UserModel.findOne({ _id: assignVolunteerId, role: 'VOLUNTEER' }).lean()
  if (!volunteer) throw new HttpError(404, 'Volunteer not found')
  return String(volunteer._id)
}

const resolveCleanerAssignee = async (assignCleanerId?: string) => {
  if (!assignCleanerId) return undefined
  const cleaner = await UserModel.findOne({ _id: assignCleanerId, role: 'CLEANER' }).lean()
  if (!cleaner) throw new HttpError(404, 'Cleaner not found')
  return String(cleaner._id)
}

const upsertRoomStatus = async (input: UpsertInput, volunteerAssigneeId?: string, cleanerAssigneeId?: string) => {
  const query =
    input.roomCode
      ? { placeType: input.placeType, roomCode: input.roomCode }
      : { placeType: input.placeType, roomNumber: input.roomNumber }

  const roomType = input.roomType ?? 'PRIVATE'
  const roomDefinition = input.roomCode
    ? await CleaningRoomModel.findOne({ code: input.roomCode }).lean()
    : null
  const beds = normalizeBeds(input.beds, roomType, roomDefinition?.bedCount)
  const roomServiceLabel = input.label
  const roomServiceColor = input.color
  const summary =
    roomType === 'SHARED'
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
    roomNumber: input.roomNumber,
    roomCode: input.roomCode,
    roomSection: input.roomSection,
    roomType,
    placeLabel: input.placeLabel,
    beds,
    adminUserId: input.adminUserId,
    assignVolunteerId: volunteerAssigneeId,
    applyVolunteerAssignment: input.applyVolunteerAssignment,
  })

  if (needsCleaningRequest(input.label)) {
    await syncCleaningServiceTask({
      placeType: 'ROOM',
      roomNumber: input.roomNumber,
      roomCode: input.roomCode,
      roomSection: input.roomSection,
      placeLabel: input.placeLabel,
      adminUserId: input.adminUserId,
      assignCleanerId: cleanerAssigneeId,
    })
  }

  emitRealtimeEvent('tasks:updated', { type: 'room-beds-updated', roomCode: input.roomCode ?? input.roomNumber })
  return serializeCleaningPlaceStatus(status.toObject())
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

    const cleanerAssigneeId = await resolveCleanerAssignee(input.assignCleanerId)
    const volunteerAssigneeId = await resolveVolunteerAssignee(input.assignVolunteerId)

    if (input.placeType === 'ROOM') {
      return upsertRoomStatus(input, volunteerAssigneeId, cleanerAssigneeId)
    }

    const status = await CleaningPlaceStatusModel.findOneAndUpdate(
      { placeType: input.placeType, cleaningAreaId: input.cleaningAreaId },
      {
        placeType: input.placeType,
        cleaningAreaId: input.cleaningAreaId,
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
        assignCleanerId: cleanerAssigneeId,
      })
    }

    emitRealtimeEvent('tasks:updated', { type: 'cleaning-place-updated', placeLabel: input.placeLabel })
    return serializeCleaningPlaceStatus(status.toObject())
  },

  async bulkCreateBedTasks(input: BulkBedTaskInput) {
    const volunteerAssigneeId = await resolveVolunteerAssignee(input.assignVolunteerId)
    const preset = presetForStatus(input.label)
    const results = []

    for (const selection of input.selections) {
      const existingStatus = await CleaningPlaceStatusModel.findOne({
        placeType: 'ROOM',
        roomCode: selection.roomCode,
      }).lean()

      const currentBeds = normalizeBeds(
        Array.isArray(existingStatus?.beds)
          ? existingStatus.beds.map((bed) => ({
              bedNumber: Number(bed.bedNumber),
              label: String(bed.label),
              color: String(bed.color),
            }))
          : undefined,
        selection.roomType,
        (await CleaningRoomModel.findOne({ code: selection.roomCode }).lean())?.bedCount,
      )

      const selectedSet = new Set(selection.bedNumbers.map(String))
      const nextBeds = currentBeds.map((bed) =>
        selectedSet.has(String(bed.bedNumber))
          ? { ...bed, label: input.label, color: input.color || preset.color }
          : bed,
      )

      const roomServiceLabel =
        typeof existingStatus?.roomServiceLabel === 'string' ? existingStatus.roomServiceLabel : 'Clean'
      const roomServiceColor =
        typeof existingStatus?.roomServiceColor === 'string' ? existingStatus.roomServiceColor : '#22c55e'
      const summary = deriveBoardStatus({ roomServiceLabel, roomServiceColor, beds: nextBeds })

      const status = await CleaningPlaceStatusModel.findOneAndUpdate(
        { placeType: 'ROOM', roomCode: selection.roomCode },
        {
          placeType: 'ROOM',
          roomCode: selection.roomCode,
          roomSection: selection.roomSection,
          roomType: selection.roomType,
          placeLabel: selection.placeLabel,
          label: summary.label,
          color: summary.color,
          roomServiceLabel,
          roomServiceColor,
          beds: nextBeds,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )

      if (!status) throw new HttpError(500, `Could not save status for room ${selection.roomCode}`)

      await syncRoomBedTasks({
        roomCode: selection.roomCode,
        roomSection: selection.roomSection,
        roomType: selection.roomType,
        placeLabel: selection.placeLabel,
        beds: nextBeds,
        adminUserId: input.adminUserId,
        assignVolunteerId: volunteerAssigneeId,
        assignmentBedKeys: new Set(
          selection.bedNumbers.map((bedNumber) =>
            bedKeyFor(selection.roomType, selection.roomType === 'PRIVATE' ? undefined : bedNumber),
          ),
        ),
      })

      results.push(serializeCleaningPlaceStatus(status.toObject()))
    }

    emitRealtimeEvent('tasks:updated', { type: 'bulk-bed-tasks-created', count: results.length })
    return results
  },
})
