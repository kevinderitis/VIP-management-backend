const THAILAND_TIME_ZONE = 'Asia/Bangkok'

const formatParts = (date: Date, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: THAILAND_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  }).formatToParts(date)

export const todayInThailand = () => isoDateInThailand(new Date())

export const isoDateInThailand = (date: Date) => {
  const parts = formatParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '00'
  const day = parts.find((part) => part.type === 'day')?.value ?? '00'
  return `${year}-${month}-${day}`
}

export const normalizeIsoDate = (value?: string) => {
  if (!value) return ''
  const normalized = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized
  return ''
}

export const normalizeDdMmYyyy = (value?: string) => {
  const normalized = value?.trim() ?? ''
  if (!normalized) return ''

  const ddMmMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (ddMmMatch) return normalized

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return `${day}/${month}/${year}`
  }

  return normalized
}

export const ddMmYyyyToIsoDate = (value?: string) => {
  const normalized = normalizeDdMmYyyy(value)
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

export const isoDateToDdMmYyyy = (value?: string) => {
  const normalized = normalizeIsoDate(value)
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

export const isoDateIsOnOrBefore = (left: string, right: string) => {
  if (!left || !right) return false
  return left <= right
}

export const isoDateIsOnOrAfter = (left: string, right: string) => {
  if (!left || !right) return false
  return left >= right
}

export const isoDateRangesOverlap = (input: {
  startA: string
  endA: string
  startB: string
  endB: string
}) => {
  if (!input.startA || !input.endA || !input.startB || !input.endB) return false
  return input.startA <= input.endB && input.startB <= input.endA
}

export const isDateActiveOn = (input: {
  currentDate: string
  checkInDate: string
  checkOutDate?: string
}) => {
  const checkoutIso = ddMmYyyyToIsoDate(input.checkOutDate)
  if (!input.currentDate || !input.checkInDate || !checkoutIso) return false

  return (
    isoDateIsOnOrAfter(input.currentDate, input.checkInDate) &&
    isoDateIsOnOrBefore(input.currentDate, checkoutIso)
  )
}
