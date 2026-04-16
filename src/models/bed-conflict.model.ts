import { InferSchemaType, Schema, model } from 'mongoose'

const bedConflictSchema = new Schema(
  {
    roomCode: { type: String, required: true, index: true },
    roomSection: { type: String },
    roomLabel: { type: String, required: true },
    bedNumber: { type: Number, required: true, min: 1, max: 24 },
    fromLabel: { type: String, required: true },
    fromColor: { type: String, required: true },
    toLabel: { type: String, required: true },
    toColor: { type: String, required: true },
    resolvedAt: { type: Date, default: null },
    resolvedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

bedConflictSchema.index({ resolvedAt: 1, createdAt: -1 })
bedConflictSchema.index({ roomCode: 1, bedNumber: 1, resolvedAt: 1 })

export type BedConflictDocument = InferSchemaType<typeof bedConflictSchema> & { _id: string }
export const BedConflictModel = model('BedConflict', bedConflictSchema)
