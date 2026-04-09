import { InferSchemaType, Schema, model } from 'mongoose'
import { ROOM_TYPES } from '../domain/cleaning-places.js'

const cleaningRoomSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    section: { type: String, required: true, index: true },
    label: { type: String, required: true },
    roomType: { type: String, enum: ROOM_TYPES, required: true },
    bedCount: { type: Number, required: true, min: 1, max: 14 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type CleaningRoomDocument = InferSchemaType<typeof cleaningRoomSchema> & { _id: string }
export const CleaningRoomModel = model('CleaningRoom', cleaningRoomSchema)
