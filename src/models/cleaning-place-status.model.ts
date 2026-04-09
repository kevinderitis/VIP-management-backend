import { InferSchemaType, Schema, model } from 'mongoose'
import { CLEANING_LOCATION_TYPES } from '../domain/enums.js'
import { ROOM_TYPES } from '../domain/cleaning-places.js'

const bedStatusSchema = new Schema(
  {
    bedNumber: { type: Number, required: true, min: 1, max: 24 },
    label: { type: String, required: true },
    color: { type: String, required: true },
  },
  { _id: false },
)

const cleaningPlaceStatusSchema = new Schema(
  {
    placeType: { type: String, enum: CLEANING_LOCATION_TYPES, required: true },
    roomNumber: { type: Number, min: 1, max: 300 },
    roomCode: { type: String, index: true },
    roomSection: { type: String },
    roomType: { type: String, enum: ROOM_TYPES },
    cleaningAreaId: { type: Schema.Types.ObjectId, ref: 'CleaningArea' },
    placeLabel: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, required: true },
    roomServiceLabel: { type: String },
    roomServiceColor: { type: String },
    beds: { type: [bedStatusSchema], default: undefined },
  },
  { timestamps: true },
)

cleaningPlaceStatusSchema.index(
  { placeType: 1, roomNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      placeType: 'ROOM',
      roomNumber: { $exists: true },
    },
  },
)

cleaningPlaceStatusSchema.index(
  { placeType: 1, roomCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      placeType: 'ROOM',
      roomCode: { $exists: true },
    },
  },
)

cleaningPlaceStatusSchema.index(
  { placeType: 1, cleaningAreaId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      placeType: 'CUSTOM',
      cleaningAreaId: { $exists: true },
    },
  },
)

export type CleaningPlaceStatusDocument = InferSchemaType<typeof cleaningPlaceStatusSchema> & { _id: string }
export const CleaningPlaceStatusModel = model('CleaningPlaceStatus', cleaningPlaceStatusSchema)
