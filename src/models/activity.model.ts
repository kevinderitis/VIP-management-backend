import { InferSchemaType, Schema, model } from 'mongoose'
import { ACTIVITY_TYPES } from '../domain/enums.js'

const activitySchema = new Schema(
  {
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export type ActivityDocument = InferSchemaType<typeof activitySchema> & { _id: string }
export const ActivityModel = model('Activity', activitySchema)
