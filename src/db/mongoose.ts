import mongoose from 'mongoose'
import { env } from '../config/env.js'

declare global {
  // eslint-disable-next-line no-var
  var __vipMongoConnection__: Promise<typeof mongoose> | undefined
}

export const connectDatabase = async () => {
  if (!global.__vipMongoConnection__) {
    global.__vipMongoConnection__ = mongoose
      .connect(env.MONGODB_URL, {
        autoIndex: env.NODE_ENV !== 'production',
      })
      .then(async (connection) => {
        try {
          const database = connection.connection.db

          if (!database) {
            return connection
          }

          const tasksCollection = database.collection('tasks')
          const indexes = await tasksCollection.indexes()
          const staleRoutineIndex = indexes.find((index) => index.name === 'routineAssignmentId_1' && index.unique)

          if (staleRoutineIndex) {
            await tasksCollection.dropIndex('routineAssignmentId_1')
            await tasksCollection.createIndex({ routineAssignmentId: 1 }, { sparse: true })
          }

          const usersCollection = database.collection('users')
          const userIndexes = await usersCollection.indexes()
          const staleEmailIndex = userIndexes.find(
            (index) => index.name === 'email_1' && index.unique && !index.sparse,
          )

          if (staleEmailIndex) {
            await usersCollection.dropIndex('email_1')
            await usersCollection.createIndex({ email: 1 }, { unique: true, sparse: true })
          }
        } catch (error) {
          console.error('Could not reconcile Mongo indexes', error)
        }

        return connection
      })
  }

  return global.__vipMongoConnection__
}
