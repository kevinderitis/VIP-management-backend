import { InferSchemaType, Schema, model } from 'mongoose'
import { USER_ROLES } from '../domain/enums.js'

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: USER_ROLES, required: true },
    endpoint: { type: String, required: true, unique: true },
    expirationTime: { type: Date },
    keys: {
      auth: { type: String, required: true },
      p256dh: { type: String, required: true },
    },
    userAgent: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type PushSubscriptionDocument = InferSchemaType<typeof pushSubscriptionSchema> & { _id: string }
export const PushSubscriptionModel = model('PushSubscription', pushSubscriptionSchema)
