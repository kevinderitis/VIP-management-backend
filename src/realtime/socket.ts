import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { env } from '../config/env.js'

let io: Server | null = null

export const initSocketServer = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: env.APP_ORIGIN,
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    socket.emit('system:ready', { connectedAt: new Date().toISOString() })
  })

  return io
}

export const emitRealtimeEvent = (event: string, payload: unknown) => {
  io?.emit(event, payload)
}
