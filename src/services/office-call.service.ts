import { HttpError } from '../lib/http-error.js'
import { OfficeCallModel } from '../models/office-call.model.js'
import { UserModel } from '../models/user.model.js'
import { createActivityService } from './activity.service.js'
import { emitToUser } from '../realtime/socket.js'
import { sendPushNotificationsToUsers } from './push-notification.service.js'
import { serializeOfficeCall } from '../utils/serializers.js'

const activityService = createActivityService()

export const createOfficeCallService = () => ({
  async create(adminUserId: string, volunteerIds: string[]) {
    const admin = await UserModel.findOne({ _id: adminUserId, role: 'ADMIN', isActive: true }).lean()
    if (!admin) throw new HttpError(404, 'Admin user not found')

    const uniqueVolunteerIds = [...new Set(volunteerIds)]
    const volunteers = await UserModel.find({
      _id: { $in: uniqueVolunteerIds },
      role: 'VOLUNTEER',
      isActive: true,
    }).lean()

    if (!volunteers.length) {
      throw new HttpError(400, 'No active volunteers were selected')
    }

    const createdCalls = await OfficeCallModel.insertMany(
      volunteers.map((volunteer) => ({
        volunteerId: volunteer._id,
        callerAdminId: admin._id,
        callerAdminName: admin.name,
        message: `${admin.name} is calling you to the office.`,
        status: 'ACTIVE',
      })),
    )

    await activityService.create(
      'OFFICE_CALLED',
      'Volunteers called to office',
      `${admin.name} called ${volunteers.map((volunteer) => volunteer.name).join(', ')} to the office.`,
    )

    createdCalls.forEach((call) => {
      const serialized = serializeOfficeCall(call.toObject())
      if (!serialized.volunteerId) return
      emitToUser(serialized.volunteerId, 'office-call:new', serialized)
    })

    await sendPushNotificationsToUsers(
      createdCalls.map((call) => String(call.volunteerId)),
      {
        title: 'Come to the office',
        body: `${admin.name} is calling you to the office.`,
        tag: `office-call-${String(admin._id)}-${Date.now()}`,
        url: '/app',
      },
    )

    return createdCalls.map((call) => serializeOfficeCall(call.toObject()))
  },

  async acknowledge(callId: string, volunteerUserId: string) {
    const call = await OfficeCallModel.findOne({
      _id: callId,
      volunteerId: volunteerUserId,
      status: 'ACTIVE',
    })

    if (!call) throw new HttpError(404, 'Office call not found')

    call.status = 'ACKNOWLEDGED'
    call.acknowledgedAt = new Date()
    await call.save()

    return serializeOfficeCall(call.toObject())
  },
})
