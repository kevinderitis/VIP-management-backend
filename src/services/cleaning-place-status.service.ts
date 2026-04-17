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
import { registerBedConflictIfNeeded } from './bed-conflict.service.js'
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
  trashRequested?: boolean
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
const roomBedReference = (roomCode?: string, roomNumber?: number, bedNumber?: number) =>
  bedNumber ? `Room ${roomCode ?? roomNumber}-${bedNumber}` : roomTitle(roomCode, roomNumber)
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
  const bedReference = roomBedReference(input.roomCode, input.roomNumber, input.bedNumber)

  if (input.stateKey === 'CHECK') {
    return {
      title: `${bedReference} · Check bed`,
      description: input.bedNumber
        ? `Inspect bed ${input.bedNumber} in ${roomLabel}. Verify linen, occupancy, and bed presentation, then mark it as ready or occupied when the check is complete.`
        : `Inspect the bed in private ${roomLabel}. Verify linen and occupancy, then mark it as ready or occupied when the check is complete.`,
    }
  }

  return {
    title: `${bedReference} · Make bed`,
    description: input.bedNumber
      ? `Prepare bed ${input.bedNumber} in ${roomLabel}. Replace linen, tidy pillows, and leave the bed ready for the next guest.`
      : `Make the bed in private ${roomLabel}, refresh the linen setup, and leave the room ready for the next guest.`,
  }
}

const buildTrashTaskCopy = (input: { roomCode?: string; roomNumber?: number }) => {
  const roomLabel = roomTitle(input.roomCode, input.roomNumber)
  return {
    title: `${roomLabel} · Take out trash`,
    description: `Collect the trash in ${roomLabel}, replace the liner if needed, and leave the room clean and ready for the next guest.`,
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

const registerBedConflicts = async (input: {
  roomCode?: string
  roomSection?: string
  placeLabel: string
  previousBeds: BedInput[]
  nextBeds: BedInput[]
}) => {
  if (!input.roomCode) return

  for (const nextBed of input.nextBeds) {
    const previousBed = input.previousBeds.find((bed) => bed.bedNumber === nextBed.bedNumber)
    await registerBedConflictIfNeeded({
      roomCode: input.roomCode,
      roomSection: input.roomSection,
      roomLabel: input.placeLabel,
      bedNumber: nextBed.bedNumber,
      previousLabel: previousBed?.label,
      nextLabel: nextBed.label,
    })
  }
}

const syncBedTask = async (input: {
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  bedNumber?: number
  placeLabel: string
  adminUserId: string
  bedStateKey: BedStateKey
  points: number
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
    existingTask.points = input.points
    existingTask.roomTaskType = input.bedStateKey === 'CHECK' ? 'CHECK' : 'BED_MAKING'
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
    points: input.points,
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
    roomTaskType: input.bedStateKey === 'CHECK' ? 'CHECK' : 'BED_MAKING',
    status: input.assignmentAction?.volunteerId ? 'ASSIGNED' : 'AVAILABLE',
  })
}

const syncTrashTask = async (input: {
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  placeLabel: string
  adminUserId: string
  points: number
  trashRequested: boolean
  assignVolunteerId?: string
}) => {
  const taskQuery = {
    audience: 'VOLUNTEER',
    cleaningLocationType: 'ROOM',
    ...(input.roomCode ? { cleaningRoomCode: input.roomCode } : { cleaningRoomNumber: input.roomNumber }),
    status: { $in: REUSABLE_BED_TASK_STATUSES },
    $or: [
      { roomTaskType: 'TRASH' },
      {
        bedTask: false,
        title: { $regex: 'trash|take out trash|garbage', $options: 'i' },
      },
      {
        bedTask: false,
        description: { $regex: 'trash|garbage|liner', $options: 'i' },
      },
    ],
  }
  const existingTasks = await TaskModel.find(taskQuery).sort({ createdAt: -1 })
  const existingTask = existingTasks[0]

  if (!input.trashRequested) {
    for (const task of existingTasks) {
      if (task.status !== 'COMPLETED' && task.status !== 'CANCELLED') {
        task.status = 'CANCELLED'
        task.set('assignedToId', undefined)
        task.roomTaskType = 'TRASH'
        await task.save()
      }
    }
    return
  }

  const { title, description } = buildTrashTaskCopy({
    roomCode: input.roomCode,
    roomNumber: input.roomNumber,
  })

  if (existingTask) {
    existingTask.title = title
    existingTask.description = description
    existingTask.points = input.points
    existingTask.roomTaskType = 'TRASH'
    existingTask.publishedAt = new Date()
    if (input.assignVolunteerId) {
      existingTask.set('assignedToId', input.assignVolunteerId)
      existingTask.set('lastAssignedToId', input.assignVolunteerId)
    } else {
      existingTask.set('assignedToId', undefined)
    }
    existingTask.status = existingTask.assignedToId ? 'ASSIGNED' : 'AVAILABLE'
    await existingTask.save()

    for (const duplicateTask of existingTasks.slice(1)) {
      if (duplicateTask.status !== 'COMPLETED' && duplicateTask.status !== 'CANCELLED') {
        duplicateTask.status = 'CANCELLED'
        duplicateTask.set('assignedToId', undefined)
        duplicateTask.roomTaskType = 'TRASH'
        await duplicateTask.save()
      }
    }
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
    points: input.points,
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
    roomTaskType: 'TRASH',
    bedTask: false,
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
  applyVolunteerAssignment?: boolean
  assignmentBedKeys?: Set<string>
  trashRequested?: boolean
  bedTaskPoints: number
  checkTaskPoints: number
  trashTaskPoints: number
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
      points: stateKey === 'CHECK' ? input.checkTaskPoints : input.bedTaskPoints,
      assignmentAction:
        shouldKeepTaskActive && shouldApplyAssignment
          ? { volunteerId: input.assignVolunteerId }
          : undefined,
      shouldBeActive: shouldKeepTaskActive,
    })
  }

  await syncTrashTask({
    roomNumber: input.roomNumber,
    roomCode: input.roomCode,
    roomSection: input.roomSection,
    placeLabel: input.placeLabel,
    adminUserId: input.adminUserId,
    points: input.trashTaskPoints,
    trashRequested: Boolean(input.trashRequested),
    assignVolunteerId: input.assignVolunteerId,
  })
}

const syncCleaningServiceTask = async (input: {
  placeType: 'ROOM' | 'CUSTOM'
  roomNumber?: number
  roomCode?: string
  roomSection?: string
  placeLabel: string
  adminUserId: string
  assignCleanerId?: string
  shouldBeActive?: boolean
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

  if (input.shouldBeActive === false) {
    if (existingTask) {
      existingTask.status = 'CANCELLED'
      existingTask.set('assignedToId', undefined)
      await existingTask.save()
    }
    return
  }

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
  const existingStatus =
    (await CleaningPlaceStatusModel.findOne(query).lean()) ??
    undefined
  const previousBeds = normalizeBeds(
    Array.isArray(existingStatus?.beds)
      ? existingStatus.beds.map((bed) => ({
          bedNumber: Number(bed.bedNumber),
          label: String(bed.label),
          color: String(bed.color),
        }))
      : undefined,
    roomType,
    roomDefinition?.bedCount,
  )
  const beds = normalizeBeds(input.beds, roomType, roomDefinition?.bedCount)
  const roomServiceLabel = input.label
  const roomServiceColor = input.color
  const trashRequested = Boolean(input.trashRequested ?? existingStatus?.trashRequested)
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
      trashRequested,
      beds,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )

  if (!status) throw new HttpError(500, 'Could not save room status')

  await registerBedConflicts({
    roomCode: input.roomCode,
    roomSection: input.roomSection,
    placeLabel: input.placeLabel,
    previousBeds,
    nextBeds: beds,
  })

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
    trashRequested,
    bedTaskPoints: roomDefinition?.bedTaskPoints ?? 10,
    checkTaskPoints: roomDefinition?.checkTaskPoints ?? 10,
    trashTaskPoints: roomDefinition?.trashTaskPoints ?? 10,
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
      shouldBeActive: true,
    })
  } else {
    await syncCleaningServiceTask({
      placeType: 'ROOM',
      roomNumber: input.roomNumber,
      roomCode: input.roomCode,
      roomSection: input.roomSection,
      placeLabel: input.placeLabel,
      adminUserId: input.adminUserId,
      shouldBeActive: false,
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
    await syncCleaningServiceTask({
      placeType: 'CUSTOM',
      placeLabel: input.placeLabel,
      adminUserId: input.adminUserId,
      assignCleanerId: normalizedLabel === 'need cleaning' || normalizedLabel === 'needs cleaning' ? cleanerAssigneeId : undefined,
      shouldBeActive: normalizedLabel === 'need cleaning' || normalizedLabel === 'needs cleaning',
    })

    emitRealtimeEvent('tasks:updated', { type: 'cleaning-place-updated', placeLabel: input.placeLabel })
    return serializeCleaningPlaceStatus(status.toObject())
  },

  async bulkCreateBedTasks(input: BulkBedTaskInput) {
    const volunteerAssigneeId = await resolveVolunteerAssignee(input.assignVolunteerId)
    const preset = presetForStatus(input.label)
    const results = []

    for (const selection of input.selections) {
      const roomDefinition = await CleaningRoomModel.findOne({ code: selection.roomCode }).lean()
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
        roomDefinition?.bedCount,
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
          trashRequested: Boolean(existingStatus?.trashRequested),
          beds: nextBeds,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )

      if (!status) throw new HttpError(500, `Could not save status for room ${selection.roomCode}`)

      await registerBedConflicts({
        roomCode: selection.roomCode,
        roomSection: selection.roomSection,
        placeLabel: selection.placeLabel,
        previousBeds: currentBeds,
        nextBeds,
      })

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
        trashRequested: Boolean(existingStatus?.trashRequested),
        bedTaskPoints: roomDefinition?.bedTaskPoints ?? 10,
        checkTaskPoints: roomDefinition?.checkTaskPoints ?? 10,
        trashTaskPoints: roomDefinition?.trashTaskPoints ?? 10,
      })

      results.push(serializeCleaningPlaceStatus(status.toObject()))
    }

    emitRealtimeEvent('tasks:updated', { type: 'bulk-bed-tasks-created', count: results.length })
    return results
  },
})
