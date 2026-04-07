import { Weekday } from '../domain/enums.js'

const weekdayOffsets: Record<Weekday, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
}

export const getWeekStart = (value: Date) => {
  const date = new Date(value)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export const combineDateAndTime = (base: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date(base)
  next.setHours(hours, minutes, 0, 0)
  return next
}

export const buildWeekdayDate = (weekStart: Date, weekday: Weekday, time: string) => {
  const date = new Date(weekStart)
  date.setDate(weekStart.getDate() + weekdayOffsets[weekday])
  return combineDateAndTime(date, time)
}
