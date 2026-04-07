type DocumentLike = {
  _id: unknown
  [key: string]: unknown
}

const idOf = (value: unknown) => (value ? String(value) : undefined)

const lower = (value?: unknown) =>
  typeof value === 'string' ? value.toLowerCase().replaceAll('_', '-') : value

export const serializeUser = (user: DocumentLike) => ({
  id: idOf(user._id),
  role: lower(user.role),
  name: user.name,
  email: typeof user.email === 'string' ? user.email : '',
  username: user.username,
  password: user.passwordPreview,
  avatar: user.avatar,
  title: user.title,
  isActive: user.isActive,
  points: user.points,
  lifetimePoints: user.lifetimePoints,
  completedTasks: user.completedTasks,
  badge: user.badge,
  shift: user.shift,
  offDay: lower(user.offDay),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

export const serializeTask = (task: DocumentLike) => ({
  id: idOf(task._id),
  title: task.title,
  description: task.description,
  category: lower(task.category),
  priority: lower(task.priority),
  status: lower(task.status),
  audience: lower(task.audience),
  points: task.points,
  publishedAt: task.publishedAt,
  scheduledAt: task.startsAt,
  endsAt: task.endsAt,
  assignedTo: idOf(task.assignedToId),
  createdBy: idOf(task.createdById),
  notes: task.notes,
  source: lower(task.source),
  packId: idOf(task.packId),
  packAssignmentId: idOf(task.packAssignmentId),
  routineTemplateId: idOf(task.routineTemplateId),
  routineAssignmentId: idOf(task.routineAssignmentId),
  cleaningLocationType: lower(task.cleaningLocationType),
  cleaningLocationLabel: task.cleaningLocationLabel,
  cleaningRoomNumber: task.cleaningRoomNumber,
})

export const serializePack = (pack: DocumentLike) => ({
  id: idOf(pack._id),
  name: pack.name,
  description: pack.description,
  durationDays: pack.durationDays,
  isActive: pack.isActive,
  templates: Array.isArray(pack.templates)
    ? pack.templates.map((template: Record<string, unknown>) => ({
        id: idOf(template._id),
        title: template.title,
        description: template.description,
        category: lower(template.category),
        priority: lower(template.priority),
        dayOffset: template.dayOffset,
        startTime: template.startTime,
        endTime: template.endTime,
        points: template.points,
      }))
    : [],
})

export const serializePackAssignment = (assignment: DocumentLike) => ({
  id: idOf(assignment._id),
  packId: idOf(assignment.packId),
  volunteerId: idOf(assignment.volunteerId),
  startDate: assignment.startDate,
  endDate: assignment.endDate,
  createdAt: assignment.createdAt,
})

export const serializeRoutineTask = (task: DocumentLike) => ({
  id: idOf(task._id),
  name: task.name,
  description: task.description,
  category: lower(task.category),
  priority: lower(task.priority),
  points: task.points,
  isActive: task.isActive,
  notes: task.notes,
})

export const serializeRoutineAssignment = (assignment: DocumentLike) => ({
  id: idOf(assignment._id),
  templateId: idOf(assignment.templateId),
  volunteerId: idOf(assignment.volunteerId),
  startsOn: assignment.startsOn,
  endsOn: assignment.endsOn,
  weekdays: Array.isArray(assignment.weekdays) ? assignment.weekdays.map(lower) : [],
  startTime: assignment.startTime,
  endTime: assignment.endTime,
  createdAt: assignment.createdAt,
})

export const serializeReward = (reward: DocumentLike) => ({
  id: idOf(reward._id),
  name: reward.name,
  description: reward.description,
  cost: reward.cost,
  category: reward.category,
  isActive: reward.isActive,
  stock: reward.stock,
  icon: reward.icon,
  createdAt: reward.createdAt,
  updatedAt: reward.updatedAt,
})

export const serializeRedemption = (redemption: DocumentLike) => ({
  id: idOf(redemption._id),
  rewardId: idOf(redemption.rewardId),
  volunteerId: idOf(redemption.volunteerId),
  cost: redemption.cost,
  status: lower(redemption.status),
  createdAt: redemption.createdAt,
})

export const serializeActivity = (activity: DocumentLike) => ({
  id: idOf(activity._id),
  type: lower(activity.type),
  title: activity.title,
  description: activity.description,
  createdAt: activity.createdAt,
})

export const serializeCompletion = (completion: DocumentLike) => ({
  id: idOf(completion._id),
  taskId: idOf(completion.taskId),
  volunteerId: idOf(completion.volunteerId),
  points: completion.points,
  completedAt: completion.completedAt,
  source:
    lower(completion.source) ??
    (completion.routineTemplateId ? 'routine' : completion.packId ? 'pack' : 'manual'),
  routineTemplateId: idOf(completion.routineTemplateId),
  packId: idOf(completion.packId),
})
