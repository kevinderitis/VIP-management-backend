export const ROOM_TYPES = ['PRIVATE', 'SHARED'] as const

export const BED_STATUS_PRESETS = {
  READY: { label: 'Ready', color: '#22c55e' },
  NEEDS_MAKING: { label: 'Needs making', color: '#ef4444' },
  CHECK: { label: 'Check', color: '#f59e0b' },
  OCCUPIED: { label: 'Occupied', color: '#3b82f6' },
} as const

export type RoomType = (typeof ROOM_TYPES)[number]
export type BedStateKey = keyof typeof BED_STATUS_PRESETS

export const normalizeStatusLabel = (value?: string) => value?.trim().toLowerCase() ?? ''

export const statusFromLabel = (value?: string): BedStateKey | undefined => {
  const normalized = normalizeStatusLabel(value)

  if (['ready', 'clean'].includes(normalized)) return 'READY'
  if (['needs making', 'needs to be made', 'need making', 'needs bed service'].includes(normalized)) {
    return 'NEEDS_MAKING'
  }
  if (['check', 'needs checking', 'need checking', 'check bed'].includes(normalized)) return 'CHECK'
  if (['occupied', 'in use'].includes(normalized)) return 'OCCUPIED'

  return undefined
}

export const presetForStatus = (value?: string) => {
  const key = statusFromLabel(value) ?? 'READY'
  return BED_STATUS_PRESETS[key]
}

export const summarizeBeds = (beds: Array<{ label: string }>) => {
  if (beds.some((bed) => statusFromLabel(bed.label) === 'NEEDS_MAKING')) {
    return BED_STATUS_PRESETS.NEEDS_MAKING
  }

  if (beds.some((bed) => statusFromLabel(bed.label) === 'CHECK')) {
    return BED_STATUS_PRESETS.CHECK
  }

  if (beds.some((bed) => statusFromLabel(bed.label) === 'OCCUPIED')) {
    return BED_STATUS_PRESETS.OCCUPIED
  }

  return BED_STATUS_PRESETS.READY
}
