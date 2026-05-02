import path from 'node:path'
import { GuestModel } from '../models/guest.model.js'
import { CheckinStayModel } from '../models/checkin-stay.model.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { CleaningRoomModel } from '../models/cleaning-room.model.js'
import { HttpError } from '../lib/http-error.js'
import { BED_STATUS_PRESETS, normalizeStatusLabel } from '../domain/cleaning-places.js'
import {
  ddMmYyyyToIsoDate,
  isDateActiveOn,
  isoDateRangesOverlap,
  normalizeDdMmYyyy,
  normalizeIsoDate,
  todayInThailand,
} from '../utils/thailand-date.js'
import { generateTm30Excel } from './tm30-excel.service.js'

const NATIONALITY_ALIASES: Record<string, string> = {
  D: 'DEU',
  DE: 'DEU',
  GER: 'DEU',
  UK: 'GBR',
  GB: 'GBR',
  ENG: 'GBR',
  US: 'USA',
  UAE: 'ARE',
}

const normalizeNationality = (value = '') => {
  const normalized = String(value).trim().toUpperCase()
  if (!normalized) return ''
  return NATIONALITY_ALIASES[normalized] || normalized
}

const normalizeGender = (value = ''): 'M' | 'F' | '' =>
  value === 'male' ? 'M' :
    value === 'female' ? 'F' :
      value === 'M' ? 'M' :
        value === 'F' ? 'F' :
          ''

const guestPayloadFromMrz = (input: {
  passportNo: string
  firstName: string
  middleName?: string
  lastName: string
  gender: string
  nationality: string
  birthDate?: string
}) => ({
  passportNo: input.passportNo.trim().toUpperCase(),
  firstName: input.firstName.trim(),
  middleName: input.middleName?.trim() || '',
  lastName: input.lastName.trim(),
  gender: normalizeGender(input.gender),
  nationality: normalizeNationality(input.nationality),
  birthDateDDMMYYYY: normalizeDdMmYyyy(input.birthDate),
})

const serializeGuest = (guest: Record<string, unknown>) => ({
  id: String(guest._id),
  passportNo: guest.passportNo,
  firstName: guest.firstName,
  middleName: guest.middleName,
  lastName: guest.lastName,
  gender: guest.gender,
  nationality: guest.nationality,
  birthDate: guest.birthDateDDMMYYYY,
  birthDateDDMMYYYY: guest.birthDateDDMMYYYY,
})

const serializeStay = (stay: Record<string, unknown>, guest?: Record<string, unknown> | null) => ({
  id: String(stay._id),
  status: stay.status,
  checkInDate: stay.checkInDate,
  checkOutDate: stay.checkOutDDMMYYYY,
  phoneNo: stay.phoneNo,
  mrzScore: stay.mrzScore || 0,
  roomCode: stay.roomCode,
  roomSection: stay.roomSection,
  roomLabel: stay.roomLabel,
  roomType: typeof stay.roomType === 'string' ? stay.roomType.toLowerCase() : undefined,
  bedNumber: stay.bedNumber,
  guest: guest ? serializeGuest(guest) : null,
})

const buildStayResponse = (input: {
  stay: Record<string, unknown>
  guest: Record<string, unknown>
  warnings?: string[]
}) => ({
  stayId: String(input.stay._id),
  ...serializeStay(input.stay, input.guest),
  warnings: input.warnings ?? [],
})

const blockIfRoomUnavailable = async (input: {
  roomCode: string
  roomType: 'PRIVATE' | 'SHARED'
  bedNumber?: number
}) => {
  const roomStatus = await CleaningPlaceStatusModel.findOne({
    placeType: 'ROOM',
    roomCode: input.roomCode,
  })

  if (!roomStatus) return

  const roomServiceLabel = normalizeStatusLabel(roomStatus.roomServiceLabel || roomStatus.label)
  if (roomServiceLabel === 'needs cleaning' || roomServiceLabel === 'need cleaning') {
    throw new HttpError(409, `Room ${input.roomCode} needs cleaning before check-in`)
  }

  if (input.roomType === 'PRIVATE') {
    const privateBed = roomStatus.beds?.[0]
    const privateLabel = normalizeStatusLabel(privateBed?.label)
    if (privateLabel === 'needs cleaning' || privateLabel === 'need cleaning') {
      throw new HttpError(409, `Room ${input.roomCode} needs cleaning before check-in`)
    }
    return
  }

  const selectedBed = roomStatus.beds?.find((bed) => bed.bedNumber === input.bedNumber)
  const selectedLabel = normalizeStatusLabel(selectedBed?.label)
  if (selectedLabel === 'occupied') {
    throw new HttpError(409, `Bed ${input.bedNumber} in room ${input.roomCode} is already occupied`)
  }
  if (selectedLabel === 'needs cleaning' || selectedLabel === 'need cleaning') {
    throw new HttpError(
      409,
      `Bed ${input.bedNumber} in room ${input.roomCode} needs cleaning before check-in`,
    )
  }
}

const syncRoomOccupancyState = async (input: {
  roomCode?: string
  roomType?: 'PRIVATE' | 'SHARED' | null
  bedNumber?: number
  occupied: boolean
}) => {
  if (!input.roomCode || !input.roomType) return

  const roomStatus = await CleaningPlaceStatusModel.findOne({
    placeType: 'ROOM',
    roomCode: input.roomCode,
  })

  if (!roomStatus) return

  const nextLabel = input.occupied
    ? BED_STATUS_PRESETS.OCCUPIED.label
    : 'Needs cleaning'
  const nextColor = input.occupied
    ? BED_STATUS_PRESETS.OCCUPIED.color
    : '#ef4444'

  if (input.roomType === 'PRIVATE') {
    const currentBed = roomStatus.beds?.[0]
    roomStatus.set('beds', [
      {
        bedNumber: 1,
        label: nextLabel,
        color: nextColor,
      },
    ])

    if (!currentBed || currentBed.label !== nextLabel || currentBed.color !== nextColor) {
      await roomStatus.save()
    }
    return
  }

  const existingBeds = roomStatus.beds ?? []
  const hasBed = existingBeds.some((bed) => bed.bedNumber === input.bedNumber)
  roomStatus.set(
    'beds',
    hasBed
      ? existingBeds.map((bed) =>
        bed.bedNumber === input.bedNumber
          ? {
              ...bed,
              label: nextLabel,
              color: nextColor,
            }
          : bed,
        )
      : [
          ...existingBeds,
          {
            bedNumber: input.bedNumber ?? 1,
            label: nextLabel,
            color: nextColor,
          },
        ].sort((left, right) => left.bedNumber - right.bedNumber),
  )

  await roomStatus.save()
}

const releasePreviousOccupancyIfNeeded = async (input: {
  roomCode?: string
  roomType?: 'PRIVATE' | 'SHARED' | null
  bedNumber?: number
  excludeStayId?: string
}) => {
  if (!input.roomCode || !input.roomType) return

  const activeStays = await CheckinStayModel.find({
    _id: input.excludeStayId ? { $ne: input.excludeStayId } : { $exists: true },
    roomCode: input.roomCode,
    ...(input.roomType === 'SHARED' ? { bedNumber: input.bedNumber } : {}),
  }).lean()

  const currentDate = todayInThailand()
  const stillOccupied = activeStays.some((stay) =>
    isDateActiveOn({
      currentDate,
      checkInDate: stay.checkInDate,
      checkOutDate: stay.checkOutDDMMYYYY,
    }),
  )

  if (!stillOccupied) {
    await syncRoomOccupancyState({
      roomCode: input.roomCode,
      roomType: input.roomType,
      bedNumber: input.bedNumber,
      occupied: false,
    })
  }
}

const ensureRoomAssignmentIsValid = async (input: {
  roomCode?: string
  roomType?: 'PRIVATE' | 'SHARED'
  bedNumber?: number
  checkInDate: string
  checkOutDDMMYYYY: string
  excludeStayId?: string
}) => {
  if (!input.roomCode) return null

  const room = await CleaningRoomModel.findOne({ code: input.roomCode, isActive: true }).lean()
  if (!room) {
    throw new HttpError(400, 'Selected room was not found')
  }

  const roomType = input.roomType ?? room.roomType
  const bedNumber = roomType === 'PRIVATE' ? undefined : input.bedNumber

  if (roomType === 'SHARED') {
    if (!bedNumber) {
      throw new HttpError(400, 'A shared room requires a bed number')
    }

    if (bedNumber > room.bedCount) {
      throw new HttpError(400, `Bed ${bedNumber} does not exist in room ${room.code}`)
    }
  }

  await blockIfRoomUnavailable({
    roomCode: room.code,
    roomType,
    bedNumber,
  })

  const checkOutIso = ddMmYyyyToIsoDate(input.checkOutDDMMYYYY)
  if (!checkOutIso) {
    throw new HttpError(400, 'Check-out date is required to assign a room')
  }

  const overlappingStays = await CheckinStayModel.find({
    _id: input.excludeStayId ? { $ne: input.excludeStayId } : { $exists: true },
    roomCode: room.code,
    ...(roomType === 'SHARED' ? { bedNumber } : {}),
  }).populate('guestId')

  const overlappingConflicts = overlappingStays.filter((stay) =>
    isoDateRangesOverlap({
      startA: input.checkInDate,
      endA: checkOutIso,
      startB: stay.checkInDate,
      endB: ddMmYyyyToIsoDate(stay.checkOutDDMMYYYY),
    }),
  )

  if (roomType === 'PRIVATE' && overlappingConflicts.length < 2) {
    return room
  }

  const conflict = overlappingConflicts[0]
  if (conflict) {
    const guestNames = overlappingConflicts
      .map((stay) => {
        const guest = stay.guestId as unknown as { firstName?: string; lastName?: string }
        return [guest?.firstName, guest?.lastName].filter(Boolean).join(' ')
      })
      .filter(Boolean)
    const guestName = guestNames.join(', ')
    throw new HttpError(
      409,
      roomType === 'SHARED'
        ? `Bed ${bedNumber} in room ${room.code} is already occupied${guestName ? ` by ${guestName}` : ''} for those dates`
        : `Room ${room.code} is already occupied${guestName ? ` by ${guestName}` : ''} for those dates`,
    )
  }

  return room
}

const upsertGuest = async (input: {
  passportNo: string
  firstName: string
  middleName?: string
  lastName: string
  gender: string
  nationality: string
  birthDate?: string
}) => {
  const payload = guestPayloadFromMrz(input)
  let guest = await GuestModel.findOne({ passportNo: payload.passportNo })

  if (!guest) {
    guest = await GuestModel.create(payload)
  } else {
    guest.firstName = payload.firstName
    guest.middleName = payload.middleName
    guest.lastName = payload.lastName
    guest.gender = payload.gender
    guest.nationality = payload.nationality
    guest.birthDateDDMMYYYY = payload.birthDateDDMMYYYY
    await guest.save()
  }

  return guest
}

export const createCheckinService = (options?: {
  exportDir?: string
}) => {
  const exportDir = options?.exportDir ?? path.join(process.cwd(), 'exports')

  return {
    async createDraftFromScan(input: {
      guest: {
        passportNo: string
        firstName: string
        middleName?: string
        lastName: string
        gender: string
        nationality: string
        birthDate?: string
      }
      checkInDate?: string
      phoneNo?: string
      passportImageMrzPath?: string
      passportImageFullPath?: string
      mrzScore?: number
      mrzLine1?: string
      mrzLine2?: string
      createdById: string
      warnings?: string[]
    }) {
      const guest = await upsertGuest(input.guest)
      const checkInDate = normalizeIsoDate(input.checkInDate) || todayInThailand()

      const stay = await CheckinStayModel.create({
        guestId: guest._id,
        checkInDate,
        checkOutDDMMYYYY: '',
        phoneNo: input.phoneNo || '',
        passportImageMrzPath: input.passportImageMrzPath || '',
        passportImageFullPath: input.passportImageFullPath || '',
        mrzScore: input.mrzScore || 0,
        mrzLine1: input.mrzLine1 || '',
        mrzLine2: input.mrzLine2 || '',
        status: 'draft',
        createdById: input.createdById,
      })

      return buildStayResponse({ stay: stay.toObject(), guest: guest.toObject(), warnings: input.warnings })
    },

    async createManual(input: {
      guest: {
        passportNo: string
        firstName: string
        middleName?: string
        lastName: string
        gender: string
        nationality: string
        birthDate?: string
      }
      checkInDate?: string
      checkOutDate: string
      phoneNo?: string
      status?: 'draft' | 'confirmed' | 'exported'
      roomCode?: string
      bedNumber?: number
      createdById: string
    }) {
      const guest = await upsertGuest(input.guest)
      const checkInDate = normalizeIsoDate(input.checkInDate) || todayInThailand()
      const checkOutDDMMYYYY = normalizeDdMmYyyy(input.checkOutDate)
      const room = await ensureRoomAssignmentIsValid({
        roomCode: input.roomCode,
        bedNumber: input.bedNumber,
        checkInDate,
        checkOutDDMMYYYY,
      })

      const stay = await CheckinStayModel.create({
        guestId: guest._id,
        checkInDate,
        checkOutDDMMYYYY,
        phoneNo: input.phoneNo || '',
        status: input.status || 'confirmed',
        createdById: input.createdById,
        roomCode: room?.code,
        roomSection: room?.section,
        roomLabel: room?.label,
        roomType: room?.roomType,
        bedNumber: room?.roomType === 'SHARED' ? input.bedNumber : undefined,
      })

      await syncRoomOccupancyState({
        roomCode: room?.code,
        roomType: room?.roomType,
        bedNumber: room?.roomType === 'SHARED' ? input.bedNumber : undefined,
        occupied: true,
      })

      return buildStayResponse({ stay: stay.toObject(), guest: guest.toObject() })
    },

    async listByDate(date?: string) {
      const normalizedDate = normalizeIsoDate(date) || todayInThailand()
      const stays = await CheckinStayModel.find({ checkInDate: normalizedDate })
        .sort({ createdAt: -1 })
        .populate('guestId')
        .lean()

      return {
        date: normalizedDate,
        stays: stays.map((stay) =>
          serializeStay(stay, stay.guestId as unknown as Record<string, unknown> | null),
        ),
      }
    },

    async updateStay(stayId: string, input: {
      guest?: {
        firstName?: string
        middleName?: string
        lastName?: string
        gender?: string
        nationality?: string
        birthDate?: string
      }
      status?: 'draft' | 'confirmed' | 'exported'
      checkInDate?: string
      checkOutDate?: string
      phoneNo?: string
      roomCode?: string
      bedNumber?: number
    }) {
      const stay = await CheckinStayModel.findById(stayId)
      if (!stay) throw new HttpError(404, 'Check-in record not found')
      const previousOccupancy = {
        roomCode: stay.roomCode,
        roomType: stay.roomType,
        bedNumber: stay.bedNumber ?? undefined,
      }

      const nextCheckInDate = normalizeIsoDate(input.checkInDate) || stay.checkInDate
      const nextCheckOutDate = normalizeDdMmYyyy(input.checkOutDate) || stay.checkOutDDMMYYYY

      const room = await ensureRoomAssignmentIsValid({
        roomCode: input.roomCode || stay.roomCode || undefined,
        roomType: stay.roomType ?? undefined,
        bedNumber: input.roomCode !== undefined ? input.bedNumber : input.bedNumber ?? stay.bedNumber ?? undefined,
        checkInDate: nextCheckInDate,
        checkOutDDMMYYYY: nextCheckOutDate,
        excludeStayId: stayId,
      })

      if (input.status) stay.status = input.status
      stay.checkInDate = nextCheckInDate
      stay.checkOutDDMMYYYY = nextCheckOutDate
      if (input.phoneNo !== undefined) stay.phoneNo = input.phoneNo || ''
      if (input.roomCode !== undefined) {
        stay.roomCode = room?.code
        stay.roomSection = room?.section
        stay.roomLabel = room?.label
        stay.roomType = room?.roomType
        stay.bedNumber = room?.roomType === 'SHARED' ? input.bedNumber : undefined
      }

      await stay.save()

      if (
        previousOccupancy.roomCode &&
        (previousOccupancy.roomCode !== stay.roomCode ||
          previousOccupancy.bedNumber !== (stay.bedNumber ?? undefined))
      ) {
        await releasePreviousOccupancyIfNeeded({
          roomCode: previousOccupancy.roomCode ?? undefined,
          roomType: previousOccupancy.roomType ?? undefined,
          bedNumber: previousOccupancy.bedNumber,
          excludeStayId: stayId,
        })
      }

      await syncRoomOccupancyState({
        roomCode: stay.roomCode ?? undefined,
        roomType: stay.roomType,
        bedNumber: stay.bedNumber ?? undefined,
        occupied: true,
      })

      if (input.guest) {
        await GuestModel.findByIdAndUpdate(stay.guestId, {
          ...(input.guest.firstName !== undefined ? { firstName: input.guest.firstName.trim() } : {}),
          ...(input.guest.middleName !== undefined ? { middleName: input.guest.middleName.trim() } : {}),
          ...(input.guest.lastName !== undefined ? { lastName: input.guest.lastName.trim() } : {}),
          ...(input.guest.gender !== undefined ? { gender: normalizeGender(input.guest.gender) } : {}),
          ...(input.guest.nationality !== undefined
            ? { nationality: normalizeNationality(input.guest.nationality) }
            : {}),
          ...(input.guest.birthDate !== undefined
            ? { birthDateDDMMYYYY: normalizeDdMmYyyy(input.guest.birthDate) }
            : {}),
        })
      }

      const populated = await CheckinStayModel.findById(stayId).populate('guestId').lean()
      if (!populated) throw new HttpError(404, 'Check-in record not found')

      return serializeStay(populated, populated.guestId as unknown as Record<string, unknown> | null)
    },

    async moveStay(stayId: string, input: {
      roomCode: string
      bedNumber?: number
    }) {
      const stay = await CheckinStayModel.findById(stayId)
      if (!stay) throw new HttpError(404, 'Check-in record not found')

      return this.updateStay(stayId, {
        roomCode: input.roomCode,
        bedNumber: input.bedNumber,
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDDMMYYYY,
      })
    },

    async clearStayRoom(stayId: string) {
      const stay = await CheckinStayModel.findById(stayId)
      if (!stay) throw new HttpError(404, 'Check-in record not found')

      const previousOccupancy = {
        roomCode: stay.roomCode,
        roomType: stay.roomType,
        bedNumber: stay.bedNumber ?? undefined,
      }

      stay.roomCode = undefined
      stay.roomSection = undefined
      stay.roomLabel = undefined
      stay.roomType = undefined
      stay.bedNumber = undefined
      await stay.save()

      await releasePreviousOccupancyIfNeeded({
        roomCode: previousOccupancy.roomCode ?? undefined,
        roomType: previousOccupancy.roomType ?? undefined,
        bedNumber: previousOccupancy.bedNumber,
        excludeStayId: stayId,
      })

      const populated = await CheckinStayModel.findById(stayId).populate('guestId').lean()
      if (!populated) throw new HttpError(404, 'Check-in record not found')

      return serializeStay(populated, populated.guestId as unknown as Record<string, unknown> | null)
    },

    async removeStay(stayId: string) {
      const stay = await CheckinStayModel.findByIdAndDelete(stayId)
      if (!stay) throw new HttpError(404, 'Check-in record not found')
      await releasePreviousOccupancyIfNeeded({
        roomCode: stay.roomCode ?? undefined,
        roomType: stay.roomType ?? undefined,
        bedNumber: stay.bedNumber ?? undefined,
        excludeStayId: stayId,
      })
      return { ok: true }
    },

    async exportTm30(date?: string) {
      const normalizedDate = normalizeIsoDate(date) || todayInThailand()
      const stays = await CheckinStayModel.find({ checkInDate: normalizedDate })
        .sort({ createdAt: 1 })
        .populate('guestId')
        .lean()

      if (!stays.length) {
        throw new HttpError(404, 'No TM30 records exist for that date')
      }

      const missing = stays.filter((stay) => !stay.checkOutDDMMYYYY)
      if (missing.length) {
        throw new HttpError(400, 'Some records are missing the check-out date', {
          stayIds: missing.map((stay) => String(stay._id)),
        })
      }

      const fileBase = `TM30_InformAccom_${normalizedDate.replaceAll('-', '')}`
      const outFileXlsx = path.join(exportDir, `${fileBase}.xlsx`)

      await generateTm30Excel({
        outFileXlsx,
        rows: stays.map((stay) => {
          const guest = stay.guestId as unknown as Record<string, unknown>
          return {
            firstName: String(guest.firstName ?? ''),
            middleName: String(guest.middleName ?? ''),
            lastName: String(guest.lastName ?? ''),
            gender: String(guest.gender ?? ''),
            passportNo: String(guest.passportNo ?? ''),
            nationality: String(guest.nationality ?? ''),
            birthDate: String(guest.birthDateDDMMYYYY ?? ''),
            checkOut: String(stay.checkOutDDMMYYYY ?? ''),
            phoneNo: String(stay.phoneNo ?? ''),
          }
        }),
      })

      await CheckinStayModel.updateMany(
        { checkInDate: normalizedDate },
        { $set: { status: 'exported' } },
      )

      return {
        filePath: outFileXlsx,
        fileName: path.basename(outFileXlsx),
      }
    },

    async listActiveOccupancies(currentDate = todayInThailand()) {
      const stays = await CheckinStayModel.find({
        roomCode: { $exists: true, $ne: null },
      })
        .populate('guestId')
        .lean()

      return stays
        .filter((stay) =>
          isDateActiveOn({
            currentDate,
            checkInDate: stay.checkInDate,
            checkOutDate: stay.checkOutDDMMYYYY,
          }),
        )
        .map((stay) => {
          const guest = stay.guestId as unknown as Record<string, unknown>
          const guestName = [guest.firstName, guest.middleName, guest.lastName]
            .filter(Boolean)
            .join(' ')

          return {
            id: String(stay._id),
            guestId: String(guest._id),
            guestName,
            passportNo: guest.passportNo,
            nationality: guest.nationality,
            roomCode: stay.roomCode,
            roomSection: stay.roomSection,
            roomLabel: stay.roomLabel,
            roomType: stay.roomType ?? undefined,
            bedNumber: stay.bedNumber,
            checkInDate: stay.checkInDate,
            checkOutDate: stay.checkOutDDMMYYYY,
            status: stay.status,
          }
        })
    },
  }
}
