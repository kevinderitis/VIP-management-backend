import webpush from 'web-push'
import { UserRole } from '../domain/enums.js'
import { env } from '../config/env.js'
import { PushSubscriptionModel } from '../models/push-subscription.model.js'

const generatedKeys =
  env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY
    ? null
    : webpush.generateVAPIDKeys()

const vapidPublicKey = env.WEB_PUSH_PUBLIC_KEY ?? generatedKeys?.publicKey ?? ''
const vapidPrivateKey = env.WEB_PUSH_PRIVATE_KEY ?? generatedKeys?.privateKey ?? ''
const usingEphemeralKeys = !env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(env.WEB_PUSH_SUBJECT, vapidPublicKey, vapidPrivateKey)
  if (usingEphemeralKeys) {
    console.warn('Web Push is using generated VAPID keys. Configure WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY for persistent subscriptions.')
  }
}

type PushSubscriptionInput = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    auth: string
    p256dh: string
  }
}

type PushPayload = {
  title: string
  body: string
  tag?: string
  url?: string
  icon?: string
  badge?: string
}

const pushEnabled = () => Boolean(vapidPublicKey && vapidPrivateKey)

export const getWebPushPublicKey = () => vapidPublicKey
export const isUsingEphemeralVapidKeys = () => usingEphemeralKeys

export const registerPushSubscription = async (input: {
  userId: string
  role: UserRole
  subscription: PushSubscriptionInput
  userAgent?: string
}) => {
  if (!pushEnabled()) {
    return { enabled: false }
  }

  await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: input.subscription.endpoint },
    {
      userId: input.userId,
      role: input.role,
      endpoint: input.subscription.endpoint,
      expirationTime:
        typeof input.subscription.expirationTime === 'number'
          ? new Date(input.subscription.expirationTime)
          : undefined,
      keys: input.subscription.keys,
      userAgent: input.userAgent,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  return { enabled: true }
}

export const removePushSubscription = async (userId: string, endpoint: string) => {
  await PushSubscriptionModel.deleteOne({ userId, endpoint })
  return { success: true }
}

export const sendPushNotificationsToUsers = async (userIds: string[], payload: PushPayload) => {
  if (!pushEnabled() || !userIds.length) return

  const uniqueUserIds = [...new Set(userIds)]
  const subscriptions = await PushSubscriptionModel.find({
    userId: { $in: uniqueUserIds },
    isActive: true,
  }).lean()

  if (!subscriptions.length) return

  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (!subscription.keys?.auth || !subscription.keys?.p256dh) {
        return
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime?.getTime(),
            keys: {
              auth: subscription.keys.auth,
              p256dh: subscription.keys.p256dh,
            },
          },
          JSON.stringify({
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            ...payload,
          }),
        )
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode) : undefined

        if (statusCode === 404 || statusCode === 410) {
          await PushSubscriptionModel.deleteOne({ endpoint: subscription.endpoint })
        } else {
          console.error('Could not deliver push notification', error)
        }
      }
    }),
  )
}
