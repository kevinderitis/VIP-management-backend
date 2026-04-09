import { InferSchemaType, Schema, model } from 'mongoose'
import {
  CLEANING_LOCATION_TYPES,
  TASK_AUDIENCES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
} from '../domain/enums.js'

const taskSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: TASK_CATEGORIES, required: true },
    priority: { type: String, enum: TASK_PRIORITIES, required: true },
    status: { type: String, enum: TASK_STATUSES, required: true },
    audience: { type: String, enum: TASK_AUDIENCES, default: 'VOLUNTEER', required: true },
    points: { type: Number, required: true },
    publishedAt: { type: Date, required: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
    notes: { type: String },
    source: { type: String, enum: TASK_SOURCES, required: true },
    assignedToId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastAssignedToId: { type: Schema.Types.ObjectId, ref: 'User' },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    packId: { type: Schema.Types.ObjectId, ref: 'TaskPack' },
    packAssignmentId: { type: Schema.Types.ObjectId, ref: 'TaskPackAssignment' },
    routineTemplateId: { type: Schema.Types.ObjectId, ref: 'RoutineTaskTemplate' },
    routineAssignmentId: { type: Schema.Types.ObjectId, ref: 'RoutineTaskAssignment', index: true, sparse: true },
    cleaningLocationType: { type: String, enum: CLEANING_LOCATION_TYPES },
    cleaningLocationLabel: { type: String },
    cleaningRoomNumber: { type: Number },
    cleaningRoomCode: { type: String, index: true },
    cleaningRoomSection: { type: String },
    cleaningBedNumber: { type: Number, min: 1, max: 24 },
    bedTask: { type: Boolean, default: false },
  },
  { timestamps: true },
)

taskSchema.index({ status: 1, startsAt: 1 })

export type TaskDocument = InferSchemaType<typeof taskSchema> & { _id: string }
export const TaskModel = model('Task', taskSchema)
