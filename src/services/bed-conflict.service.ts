import { presetForStatus, statusFromLabel } from '../domain/cleaning-places.js'
import { HttpError } from '../lib/http-error.js'
import { BedConflictModel } from '../models/bed-conflict.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { serializeBedConflict } from '../utils/serializers.js'

type TransitionInput = {
  roomCode?: string
  roomSection?: string
  roomLabel: string
  bedNumber: number
  previousLabel?: string
  nextLabel?: string
}

const conflictingFromStates = new Set(['CHECK', 'NEEDS_MAKING'])

const shouldCreateConflict = (previousLabel?: string, nextLabel?: string) => {
  const previous = statusFromLabel(previousLabel)
  const next = statusFromLabel(nextLabel)
  return Boolean(previous && conflictingFromStates.has(previous) && next === 'OCCUPIED')
}

export const registerBedConflictIfNeeded = async (input: TransitionInput) => {
  if (!input.roomCode) return null
  if (!shouldCreateConflict(input.previousLabel, input.nextLabel)) return null

  const fromPreset = presetForStatus(input.previousLabel)
  const toPreset = presetForStatus(input.nextLabel)
  const existing = await BedConflictModel.findOne({
    roomCode: input.roomCode,
    bedNumber: input.bedNumber,
    resolvedAt: null,
  })

  const conflict = existing
    ? await BedConflictModel.findByIdAndUpdate(
        existing._id,
        {
          roomSection: input.roomSection,
          roomLabel: input.roomLabel,
          fromLabel: fromPreset.label,
          fromColor: fromPreset.color,
          toLabel: toPreset.label,
          toColor: toPreset.color,
          resolvedAt: null,
          resolvedById: null,
        },
        { new: true },
      )
    : await BedConflictModel.create({
        roomCode: input.roomCode,
        roomSection: input.roomSection,
        roomLabel: input.roomLabel,
        bedNumber: input.bedNumber,
        fromLabel: fromPreset.label,
        fromColor: fromPreset.color,
        toLabel: toPreset.label,
        toColor: toPreset.color,
      })

  if (!conflict) return null

  emitRealtimeEvent('tasks:updated', {
    type: 'bed-conflict-created',
    roomCode: input.roomCode,
    bedNumber: input.bedNumber,
  })

  return serializeBedConflict(conflict.toObject())
}

export const createBedConflictService = () => ({
  async listActive() {
    const conflicts = await BedConflictModel.find({ resolvedAt: null }).sort({ createdAt: -1 }).lean()
    return conflicts.map(serializeBedConflict)
  },

  async resolve(conflictId: string, adminUserId: string) {
    const conflict = await BedConflictModel.findById(conflictId)
    if (!conflict) throw new HttpError(404, 'Bed conflict not found')

    conflict.resolvedAt = new Date()
    conflict.set('resolvedById', adminUserId)
    await conflict.save()

    emitRealtimeEvent('tasks:updated', { type: 'bed-conflict-resolved', conflictId })
    return serializeBedConflict(conflict.toObject())
  },
})
