import { Weekday } from '../domain/enums.js'

const THAILAND_OFFSET_MINUTES = 7 * 60
const DAY_MS = 24 * 60 * 60 * 1000

const weekdayOffsets: Record<Weekday, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
}

const toThailandLocalMs = (value: Date) => value.getTime() + THAILAND_OFFSET_MINUTES * 60 * 1000

export const startOfThailandDay = (value: Date) => {
  const localMs = toThailandLocalMs(value)
  const startLocalMs = Math.floor(localMs / DAY_MS) * DAY_MS
  return new Date(startLocalMs - THAILAND_OFFSET_MINUTES * 60 * 1000)
}

export const addThailandDays = (value: Date, days: number) =>
  new Date(startOfThailandDay(value).getTime() + days * DAY_MS)

export const getThailandWeekday = (value: Date) =>
  new Date(toThailandLocalMs(value)).getUTCDay()

export const getWeekStart = (value: Date) => {
  const date = startOfThailandDay(value)
  const day = getThailandWeekday(value)
  const diff = day === 0 ? -6 : 1 - day
  return addThailandDays(date, diff)
}

export const combineDateAndTime = (base: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const start = startOfThailandDay(base)
  return new Date(start.getTime() + (hours * 60 + minutes) * 60 * 1000)
}

export const buildWeekdayDate = (weekStart: Date, weekday: Weekday, time: string) => {
  const date = addThailandDays(weekStart, weekdayOffsets[weekday])
  return combineDateAndTime(date, time)
}
