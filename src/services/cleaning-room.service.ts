import { defaultCleaningRoomCatalog } from '../domain/cleaning-room-catalog.js'
import { HttpError } from '../lib/http-error.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { CleaningRoomModel } from '../models/cleaning-room.model.js'
import { TaskModel } from '../models/task.model.js'
import { serializeCleaningRoom } from '../utils/serializers.js'

export const createCleaningRoomService = () => ({
  async ensureDefaults() {
    const count = await CleaningRoomModel.countDocuments()
    if (count > 0) return

    await CleaningRoomModel.insertMany(
      defaultCleaningRoomCatalog.map((room) => ({
        ...room,
        label: `Room ${room.code}`,
        isActive: true,
      })),
    )
  },

  async create(input: {
    code: string
    section: string
    roomType: 'PRIVATE' | 'SHARED'
    bedCount: number
  }) {
    const code = input.code.trim()
    const section = input.section.trim()
    if (!code || !section) throw new HttpError(400, 'Room code and section are required')

    const room = await CleaningRoomModel.create({
      code,
      section,
      label: `Room ${code}`,
      roomType: input.roomType,
      bedCount: input.roomType === 'PRIVATE' ? 1 : input.bedCount,
      isActive: true,
    })

    return serializeCleaningRoom(room.toObject())
  },

  async update(
    roomId: string,
    input: {
      code: string
      section: string
      roomType: 'PRIVATE' | 'SHARED'
      bedCount: number
      isActive?: boolean
    },
  ) {
    const room = await CleaningRoomModel.findById(roomId)
    if (!room) throw new HttpError(404, 'Room not found')
    const previousCode = room.code

    room.code = input.code.trim()
    room.section = input.section.trim()
    room.label = `Room ${room.code}`
    room.roomType = input.roomType
    room.bedCount = input.roomType === 'PRIVATE' ? 1 : input.bedCount
    if (typeof input.isActive === 'boolean') room.isActive = input.isActive
    await room.save()

    await Promise.all([
      CleaningPlaceStatusModel.updateMany(
        { placeType: 'ROOM', roomCode: previousCode },
        { roomCode: room.code, roomSection: room.section, roomType: room.roomType, placeLabel: room.label },
      ),
      TaskModel.updateMany(
        { cleaningLocationType: 'ROOM', cleaningRoomCode: previousCode },
        { cleaningRoomCode: room.code, cleaningRoomSection: room.section, cleaningLocationLabel: room.label },
      ),
    ])

    return serializeCleaningRoom(room.toObject())
  },

  async toggle(roomId: string) {
    const room = await CleaningRoomModel.findById(roomId)
    if (!room) throw new HttpError(404, 'Room not found')
    room.isActive = !room.isActive
    await room.save()
    return serializeCleaningRoom(room.toObject())
  },

  async remove(roomId: string) {
    const room = await CleaningRoomModel.findById(roomId)
    if (!room) throw new HttpError(404, 'Room not found')

    await Promise.all([
      CleaningPlaceStatusModel.deleteMany({ placeType: 'ROOM', roomCode: room.code }),
      TaskModel.deleteMany({ cleaningLocationType: 'ROOM', cleaningRoomCode: room.code }),
      room.deleteOne(),
    ])

    return { success: true }
  },
})
