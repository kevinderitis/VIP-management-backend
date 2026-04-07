import { InferSchemaType, Schema, model } from 'mongoose'

const cleaningAreaSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type CleaningAreaDocument = InferSchemaType<typeof cleaningAreaSchema> & { _id: string }
export const CleaningAreaModel = model('CleaningArea', cleaningAreaSchema)
