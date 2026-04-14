import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { env } from '../config/env.js'
import { verifyAccessToken } from '../lib/auth.js'

let io: Server | null = null

export const initSocketServer = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: env.APP_ORIGIN,
      credentials: true,
    },
  })

  io.use((socket, next) => {
    try {
      const authToken =
        (typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined) ??
        (typeof socket.handshake.headers.authorization === 'string' &&
        socket.handshake.headers.authorization.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice('Bearer '.length)
          : undefined)

      if (!authToken) {
        return next(new Error('Missing auth token'))
      }

      const payload = verifyAccessToken(authToken)
      socket.data.auth = {
        userId: payload.sub,
        role: payload.role,
      }
      next()
    } catch (error) {
      next(error instanceof Error ? error : new Error('Socket authentication failed'))
    }
  })

  io.on('connection', (socket) => {
    const auth = socket.data.auth as { userId: string; role: string } | undefined
    if (auth?.userId) {
      socket.join(`user:${auth.userId}`)
      socket.join(`role:${auth.role}`)
    }
    socket.emit('system:ready', { connectedAt: new Date().toISOString() })
  })

  return io
}

export const emitRealtimeEvent = (event: string, payload: unknown) => {
  io?.emit(event, payload)
}

export const emitToUser = (userId: string, event: string, payload: unknown) => {
  io?.to(`user:${userId}`).emit(event, payload)
}
