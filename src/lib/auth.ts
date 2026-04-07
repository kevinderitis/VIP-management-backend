import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { UserRole } from '../domain/enums.js'
import { env } from '../config/env.js'

type TokenPayload = {
  sub: string
  role: UserRole
}

export const hashPassword = (value: string) => bcrypt.hash(value, 10)
export const comparePassword = (value: string, hash: string) => bcrypt.compare(value, hash)

export const signAccessToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_SECRET) as TokenPayload
