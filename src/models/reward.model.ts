import { InferSchemaType, Schema, model } from 'mongoose'
import { REDEMPTION_STATUSES } from '../domain/enums.js'

const rewardSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    cost: { type: Number, required: true },
    category: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    stock: { type: Number },
    icon: { type: String, required: true },
  },
  { timestamps: true },
)

const redemptionSchema = new Schema(
  {
    rewardId: { type: Schema.Types.ObjectId, ref: 'Reward', required: true },
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cost: { type: Number, required: true },
    status: { type: String, enum: REDEMPTION_STATUSES, default: 'COMPLETED' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export type RewardDocument = InferSchemaType<typeof rewardSchema> & { _id: string }
export type RedemptionDocument = InferSchemaType<typeof redemptionSchema> & { _id: string }
export const RewardModel = model('Reward', rewardSchema)
export const RedemptionModel = model('Redemption', redemptionSchema)
