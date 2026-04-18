import { HttpError } from '../lib/http-error.js'
import { RedemptionModel, RewardModel } from '../models/reward.model.js'
import { UserModel } from '../models/user.model.js'
import { emitRealtimeEvent } from '../realtime/socket.js'
import { serializeRedemption, serializeReward } from '../utils/serializers.js'
import { createActivityService } from './activity.service.js'
import { sendPushNotificationsToUsers } from './push-notification.service.js'

export const createRewardService = () => {
  const activityService = createActivityService()
  const activeVolunteerIds = async () => {
    const volunteers = await UserModel.find({ role: 'VOLUNTEER', isActive: true }).select('_id').lean()
    return volunteers.map((volunteer) => String(volunteer._id))
  }

  return {
    async list() {
      const rewards = await RewardModel.find().sort({ cost: 1 }).lean()
      return rewards.map(serializeReward)
    },

    async create(input: {
      name: string
      description: string
      cost: number
      category: string
      icon: string
      stock?: number
    }) {
      const reward = await RewardModel.create(input)
      if (reward.isActive) {
        const volunteerIds = await activeVolunteerIds()
        await sendPushNotificationsToUsers(volunteerIds, {
          title: 'New reward available',
          body: `${reward.name} is now available in Rewards.`,
          tag: `reward-${String(reward._id)}`,
          url: '/app/rewards',
        })
      }
      return serializeReward(reward.toObject())
    },

    async update(rewardId: string, input: {
      name: string
      description: string
      cost: number
      category: string
      icon: string
      stock?: number
    }) {
      const reward = await RewardModel.findById(rewardId)
      if (!reward) throw new HttpError(404, 'Reward not found')
      Object.assign(reward, input)
      await reward.save()
      return serializeReward(reward.toObject())
    },

    async toggle(rewardId: string) {
      const reward = await RewardModel.findById(rewardId)
      if (!reward) throw new HttpError(404, 'Reward not found')
      reward.isActive = !reward.isActive
      await reward.save()
      if (reward.isActive) {
        const volunteerIds = await activeVolunteerIds()
        await sendPushNotificationsToUsers(volunteerIds, {
          title: 'New reward available',
          body: `${reward.name} is now available in Rewards.`,
          tag: `reward-${String(reward._id)}`,
          url: '/app/rewards',
        })
      }
      return serializeReward(reward.toObject())
    },

    async remove(rewardId: string) {
      const reward = await RewardModel.findById(rewardId)
      if (!reward) throw new HttpError(404, 'Reward not found')
      await RedemptionModel.deleteMany({ rewardId: reward._id })
      await reward.deleteOne()
      return { success: true }
    },

    async redeem(rewardId: string, volunteerId: string) {
      const reward = await RewardModel.findById(rewardId)
      const volunteer = await UserModel.findById(volunteerId)
      if (!reward || !volunteer) throw new HttpError(404, 'Reward or volunteer not found')
      if (volunteer.points < reward.cost) throw new HttpError(400, 'Not enough points')
      if (typeof reward.stock === 'number' && reward.stock <= 0) throw new HttpError(400, 'Reward is out of stock')

      volunteer.points -= reward.cost
      await volunteer.save()

      if (typeof reward.stock === 'number') {
        reward.stock -= 1
        await reward.save()
      }

      const redemption = await RedemptionModel.create({
        rewardId,
        volunteerId,
        cost: reward.cost,
        status: 'COMPLETED',
      })

      await activityService.create('REWARD_REDEEMED', `Reward redeemed: ${reward.name}`, 'Points were deducted instantly and stock was updated.')
      emitRealtimeEvent('rewards:redeemed', { rewardId, volunteerId })
      return serializeRedemption(redemption.toObject())
    },

    async redemptions() {
      const redemptions = await RedemptionModel.find().sort({ createdAt: -1 }).lean()
      return redemptions.map(serializeRedemption)
    },
  }
}
