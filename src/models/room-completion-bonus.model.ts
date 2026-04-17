import { InferSchemaType, Schema, model } from 'mongoose'

const roomCompletionBonusSchema = new Schema(
  {
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roomCode: { type: String, required: true, index: true },
    dateKey: { type: String, required: true },
    points: { type: Number, required: true, min: 1, default: 10 },
  },
  { timestamps: true },
)

roomCompletionBonusSchema.index({ volunteerId: 1, roomCode: 1, dateKey: 1 }, { unique: true })

export type RoomCompletionBonusDocument = InferSchemaType<typeof roomCompletionBonusSchema> & { _id: string }
export const RoomCompletionBonusModel = model('RoomCompletionBonus', roomCompletionBonusSchema)
