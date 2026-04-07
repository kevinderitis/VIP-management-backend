import { InferSchemaType, Schema, model } from 'mongoose'
import { TASK_CATEGORIES, TASK_PRIORITIES } from '../domain/enums.js'

const taskPackTemplateSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: TASK_CATEGORIES, required: true },
    priority: { type: String, enum: TASK_PRIORITIES, required: true },
    dayOffset: { type: Number, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { _id: true },
)

const taskPackSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    durationDays: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    templates: { type: [taskPackTemplateSchema], default: [] },
  },
  { timestamps: true },
)

export type TaskPackDocument = InferSchemaType<typeof taskPackSchema> & { _id: string }
export const TaskPackModel = model('TaskPack', taskPackSchema)
