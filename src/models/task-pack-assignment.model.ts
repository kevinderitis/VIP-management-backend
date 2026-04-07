import { InferSchemaType, Schema, model } from 'mongoose'

const taskPackAssignmentSchema = new Schema(
  {
    packId: { type: Schema.Types.ObjectId, ref: 'TaskPack', required: true },
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export type TaskPackAssignmentDocument = InferSchemaType<typeof taskPackAssignmentSchema> & { _id: string }
export const TaskPackAssignmentModel = model('TaskPackAssignment', taskPackAssignmentSchema)
