import { HttpError } from '../lib/http-error.js'
import { CleaningPlaceStatusModel } from '../models/cleaning-place-status.model.js'
import { CleaningAreaModel } from '../models/cleaning-area.model.js'
import { TaskModel } from '../models/task.model.js'

const serializeCleaningArea = (area: { _id: unknown; name: string; isActive: boolean }) => ({
  id: String(area._id),
  name: area.name,
  isActive: area.isActive,
})

export const createCleaningAreaService = () => ({
  async list() {
    const areas = await CleaningAreaModel.find().sort({ name: 1 }).lean()
    return areas.map(serializeCleaningArea)
  },

  async create(input: { name: string }) {
    const area = await CleaningAreaModel.create({
      name: input.name,
      isActive: true,
    })

    return serializeCleaningArea(area.toObject())
  },

  async update(areaId: string, input: { name: string }) {
    const area = await CleaningAreaModel.findById(areaId)
    if (!area) throw new HttpError(404, 'Cleaning location not found')
    area.name = input.name
    await area.save()
    return serializeCleaningArea(area.toObject())
  },

  async toggleActive(areaId: string) {
    const area = await CleaningAreaModel.findById(areaId)
    if (!area) throw new HttpError(404, 'Cleaning location not found')
    area.isActive = !area.isActive
    await area.save()
    return serializeCleaningArea(area.toObject())
  },

  async remove(areaId: string) {
    const area = await CleaningAreaModel.findById(areaId)
    if (!area) throw new HttpError(404, 'Cleaning location not found')

    await Promise.all([
      CleaningPlaceStatusModel.deleteMany({ cleaningAreaId: area._id }),
      TaskModel.deleteMany({
        audience: 'CLEANING',
        cleaningLocationType: 'CUSTOM',
        cleaningLocationLabel: area.name,
      }),
    ])
    await area.deleteOne()

    return { success: true }
  },
})
