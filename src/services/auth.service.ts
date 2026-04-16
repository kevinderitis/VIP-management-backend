import { USER_ROLES } from '../domain/enums.js'
import { comparePassword, signAccessToken } from '../lib/auth.js'
import { HttpError } from '../lib/http-error.js'
import { UserModel } from '../models/user.model.js'
import { serializeUser } from '../utils/serializers.js'

export const createAuthService = () => ({
  async login(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase()

    const user = await UserModel.findOne({
      $or: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    }).lean()

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid credentials')
    }

    if (!user.isActive) {
      throw new HttpError(403, 'This user is inactive')
    }

    if (!USER_ROLES.includes(user.role)) {
      throw new HttpError(500, 'Invalid user role')
    }

    return {
      accessToken: signAccessToken({ sub: String(user._id), role: user.role }),
      user: serializeUser(user),
    }
  },

  async me(userId: string) {
    const user = await UserModel.findById(userId).lean()
    if (!user) throw new HttpError(404, 'User not found')
    return serializeUser(user)
  },
})
