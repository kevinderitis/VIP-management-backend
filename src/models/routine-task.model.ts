import { InferSchemaType, Schema, model } from 'mongoose'
import { TASK_CATEGORIES, TASK_PRIORITIES, WEEKDAYS } from '../domain/enums.js'

const routineTaskTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: TASK_CATEGORIES, required: true },
    priority: { type: String, enum: TASK_PRIORITIES, required: true },
    points: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    notes: { type: String },
  },
  { timestamps: true },
)

const routineTaskAssignmentSchema = new Schema(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'RoutineTaskTemplate', required: true },
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startsOn: { type: Date, required: true },
    endsOn: { type: Date, required: true },
    weekdays: { type: [String], enum: WEEKDAYS, required: true, default: [] },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export type RoutineTaskTemplateDocument = InferSchemaType<typeof routineTaskTemplateSchema> & { _id: string }
export type RoutineTaskAssignmentDocument = InferSchemaType<typeof routineTaskAssignmentSchema> & { _id: string }
export const RoutineTaskTemplateModel = model('RoutineTaskTemplate', routineTaskTemplateSchema)
export const RoutineTaskAssignmentModel = model('RoutineTaskAssignment', routineTaskAssignmentSchema)
