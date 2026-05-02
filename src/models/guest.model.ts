import { InferSchemaType, Schema, model } from 'mongoose'

const guestSchema = new Schema(
  {
    passportNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    gender: { type: String, enum: ['M', 'F', ''], default: '' },
    nationality: { type: String, default: '', trim: true, uppercase: true },
    birthDateDDMMYYYY: { type: String, default: '' },
  },
  { timestamps: true },
)

export type GuestDocument = InferSchemaType<typeof guestSchema> & { _id: string }
export const GuestModel = model('Guest', guestSchema)
