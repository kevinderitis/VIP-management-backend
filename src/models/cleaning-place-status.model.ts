import { InferSchemaType, Schema, model } from 'mongoose'
import { CLEANING_LOCATION_TYPES } from '../domain/enums.js'

const cleaningPlaceStatusSchema = new Schema(
  {
    placeType: { type: String, enum: CLEANING_LOCATION_TYPES, required: true },
    roomNumber: { type: Number, min: 1, max: 300 },
    cleaningAreaId: { type: Schema.Types.ObjectId, ref: 'CleaningArea' },
    placeLabel: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, required: true },
  },
  { timestamps: true },
)

cleaningPlaceStatusSchema.index(
  { placeType: 1, roomNumber: 1, cleaningAreaId: 1 },
  { unique: true, sparse: true },
)

export type CleaningPlaceStatusDocument = InferSchemaType<typeof cleaningPlaceStatusSchema> & { _id: string }
export const CleaningPlaceStatusModel = model('CleaningPlaceStatus', cleaningPlaceStatusSchema)
