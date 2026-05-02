import { InferSchemaType, Schema, model } from 'mongoose'
import { ROOM_TYPES } from '../domain/cleaning-places.js'

const checkinStaySchema = new Schema(
  {
    guestId: { type: Schema.Types.ObjectId, ref: 'Guest', required: true, index: true },
    checkInDate: { type: String, required: true, index: true },
    checkOutDDMMYYYY: { type: String, default: '' },
    phoneNo: { type: String, default: '' },
    passportImageMrzPath: { type: String, default: '' },
    passportImageFullPath: { type: String, default: '' },
    mrzScore: { type: Number, default: 0 },
    mrzLine1: { type: String, default: '' },
    mrzLine2: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'confirmed', 'exported'], default: 'draft' },
    roomCode: { type: String, index: true },
    roomSection: { type: String },
    roomLabel: { type: String },
    roomType: { type: String, enum: ROOM_TYPES },
    bedNumber: { type: Number, min: 1 },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true },
)

checkinStaySchema.index({ checkInDate: 1, createdAt: -1 })
checkinStaySchema.index({ roomCode: 1, bedNumber: 1, checkInDate: 1 })

export type CheckinStayDocument = InferSchemaType<typeof checkinStaySchema> & { _id: string }
export const CheckinStayModel = model('CheckinStay', checkinStaySchema)
