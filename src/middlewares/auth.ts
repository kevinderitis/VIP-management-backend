import { NextFunction, Request, Response } from 'express'
import { UserRole } from '../domain/enums.js'
import { verifyAccessToken } from '../lib/auth.js'
import { HttpError } from '../lib/http-error.js'

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string
        role: UserRole
      }
    }
  }
}

export const requireAuth = (request: Request, _response: Response, next: NextFunction) => {
  const authorization = request.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing or invalid authorization header'))
  }

  const token = authorization.slice('Bearer '.length)
  const payload = verifyAccessToken(token)

  request.auth = {
    userId: payload.sub,
    role: payload.role,
  }

  next()
}

export const requireRole =
  (...roles: UserRole[]) =>
  (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      const authorization = request.headers.authorization

      if (!authorization?.startsWith('Bearer ')) {
        return next(new HttpError(401, 'Authentication is required'))
      }

      const token = authorization.slice('Bearer '.length)
      const payload = verifyAccessToken(token)

      request.auth = {
        userId: payload.sub,
        role: payload.role,
      }
    }

    if (!roles.includes(request.auth.role)) {
      return next(new HttpError(403, 'You do not have access to this resource'))
    }

    next()
  }
