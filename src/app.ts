import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env.js'
import { errorHandler } from './middlewares/error-handler.js'
import { apiRouter } from './routes/index.js'

export const createApp = () => {
  const app = express()

  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true,
    }),
  )
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  app.use('/api', apiRouter)
  app.use(errorHandler)

  return app
}
