import { InferSchemaType, Schema, model } from 'mongoose'
import { USER_ROLES, WEEKDAYS } from '../domain/enums.js'

const userSchema = new Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    passwordPreview: { type: String },
    avatar: { type: String, required: true },
    title: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    points: { type: Number, default: 0 },
    lifetimePoints: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    badge: { type: String },
    shift: { type: String },
    offDay: { type: String, enum: WEEKDAYS },
  },
  { timestamps: true },
)

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string }
export const UserModel = model('User', userSchema)
