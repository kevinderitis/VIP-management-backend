import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  WEB_PUSH_SUBJECT: z.string().default('mailto:notifications@volunteerflow.local'),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
})

export const env = envSchema.parse(process.env)
