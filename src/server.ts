import { createServer } from 'http'
import { env } from './config/env.js'
import { connectDatabase } from './db/mongoose.js'
import { initSocketServer } from './realtime/socket.js'
import { createApp } from './app.js'
import { createTaskService } from './services/task.service.js'

const app = createApp()
const server = createServer(app)
const taskService = createTaskService()

initSocketServer(server)

const startScheduler = () => {
  taskService.runScheduler().catch((error) => {
    console.error('Scheduler tick failed', error)
  })

  return setInterval(() => {
    taskService.runScheduler().catch((error) => {
      console.error('Scheduler tick failed', error)
    })
  }, 15000)
}

async function main() {
  await connectDatabase()
  startScheduler()

  server.listen(env.PORT, () => {
    console.log(`VIP backend listening on http://localhost:${env.PORT}`)
  })
}

main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
