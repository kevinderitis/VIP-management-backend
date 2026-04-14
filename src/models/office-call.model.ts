import { InferSchemaType, Schema, model } from 'mongoose'

const officeCallSchema = new Schema(
  {
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    callerAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    callerAdminName: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'ACKNOWLEDGED'], default: 'ACTIVE', index: true },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true },
)

export type OfficeCallDocument = InferSchemaType<typeof officeCallSchema> & { _id: string }
export const OfficeCallModel = model('OfficeCall', officeCallSchema)
