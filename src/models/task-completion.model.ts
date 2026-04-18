import { InferSchemaType, Schema, model } from 'mongoose'
import { TASK_SOURCES } from '../domain/enums.js'

const taskCompletionSchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    taskTitle: { type: String, required: true },
    taskDescription: { type: String },
    points: { type: Number, required: true },
    source: { type: String, enum: TASK_SOURCES, required: true },
    routineTemplateId: { type: Schema.Types.ObjectId, ref: 'RoutineTaskTemplate' },
    packId: { type: Schema.Types.ObjectId, ref: 'TaskPack' },
    status: { type: String, enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED', required: true },
    completedAt: { type: Date, default: Date.now },
    reversedAt: { type: Date },
    reversedById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: false },
)

export type TaskCompletionDocument = InferSchemaType<typeof taskCompletionSchema> & { _id: string }
export const TaskCompletionModel = model('TaskCompletion', taskCompletionSchema)
