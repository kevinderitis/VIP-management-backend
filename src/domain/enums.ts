export const USER_ROLES = ['ADMIN', 'VOLUNTEER', 'CLEANER'] as const
export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const
export const TASK_STATUSES = ['DRAFT', 'SCHEDULED', 'AVAILABLE', 'ASSIGNED', 'COMPLETED', 'CANCELLED'] as const
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export const TASK_CATEGORIES = ['HOUSEKEEPING', 'RECEPTION', 'KITCHEN', 'MAINTENANCE', 'EVENTS', 'GUEST_CARE'] as const
export const TASK_SOURCES = ['MANUAL', 'PACK', 'ROUTINE'] as const
export const TASK_AUDIENCES = ['VOLUNTEER', 'CLEANING'] as const
export const CLEANING_LOCATION_TYPES = ['ROOM', 'CUSTOM'] as const
export const REDEMPTION_STATUSES = ['COMPLETED'] as const
export const ACTIVITY_TYPES = [
  'TASK_CREATED',
  'TASK_PUBLISHED',
  'TASK_TAKEN',
  'TASK_RELEASED',
  'TASK_COMPLETED',
  'REWARD_REDEEMED',
  'PACK_ASSIGNED',
  'ROUTINE_ASSIGNED',
  'VOLUNTEER_UPDATED',
] as const

export type UserRole = (typeof USER_ROLES)[number]
export type Weekday = (typeof WEEKDAYS)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskCategory = (typeof TASK_CATEGORIES)[number]
export type TaskSource = (typeof TASK_SOURCES)[number]
export type TaskAudience = (typeof TASK_AUDIENCES)[number]
export type CleaningLocationType = (typeof CLEANING_LOCATION_TYPES)[number]
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number]
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
