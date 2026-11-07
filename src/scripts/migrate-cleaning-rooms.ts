import { connectDatabase } from '../db/mongoose.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { CleaningRoomModel } from '../models/cleaning-room.model.js'
import { TaskModel } from '../models/task.model.js'
import { defaultCleaningRoomCatalog } from '../domain/cleaning-room-catalog.js'

async function main() {
  await connectDatabase()

  const desiredCodes = new Set(defaultCleaningRoomCatalog.map((room) => room.code))

  for (const room of defaultCleaningRoomCatalog) {
    const existing = await CleaningRoomModel.findOne({ code: room.code })
    if (!existing) {
      await CleaningRoomModel.create({
        code: room.code,
        section: room.section,
        label: `Room ${room.code}`,
        roomType: room.roomType,
        bedCount: room.roomType === 'PRIVATE' ? 1 : room.bedCount,
        isActive: true,
      })
      continue
    }

    const previousSection = existing.section
    existing.section = room.section
    existing.label = `Room ${room.code}`
    existing.roomType = room.roomType
    existing.bedCount = room.roomType === 'PRIVATE' ? 1 : room.bedCount
    existing.isActive = true
    await existing.save()

    if (previousSection !== room.section) {
      await Promise.all([
        CleaningPlaceStatusModel.updateMany(
          { placeType: 'ROOM', roomCode: room.code },
          { roomSection: room.section, roomType: room.roomType, placeLabel: `Room ${room.code}` },
        ),
        TaskModel.updateMany(
          { cleaningLocationType: 'ROOM', cleaningRoomCode: room.code },
          { cleaningRoomSection: room.section, cleaningLocationLabel: `Room ${room.code}` },
        ),
      ])
    }
  }

  await CleaningRoomModel.updateMany(
    { code: { $nin: [...desiredCodes] } },
    { $set: { isActive: false } },
  )

  console.log('Cleaning rooms migrated successfully.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
