import { connectDatabase } from '../db/mongoose.js'
import { hashPassword } from '../lib/auth.js'
import { ActivityModel } from '../models/activity.model.js'
import { CleaningAreaModel } from '../models/cleaning-area.model.js'
import { RedemptionModel, RewardModel } from '../models/reward.model.js'
import { RoutineTaskAssignmentModel, RoutineTaskTemplateModel } from '../models/routine-task.model.js'
import { TaskCompletionModel } from '../models/task-completion.model.js'
import { TaskPackAssignmentModel } from '../models/task-pack-assignment.model.js'
import { TaskPackModel } from '../models/task-pack.model.js'
import { TaskModel } from '../models/task.model.js'
import { UserModel } from '../models/user.model.js'
import { combineDateAndTime } from '../utils/date.js'

const now = Date.now()

const isoFromOffset = (hours: number) => new Date(now + hours * 60 * 60 * 1000)

const avatarOf = (name: string) =>
  name
    .split(' ')
    .map((item) => item[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

async function main() {
  await connectDatabase()

  await Promise.all([
    ActivityModel.deleteMany({}),
    RedemptionModel.deleteMany({}),
    RewardModel.deleteMany({}),
    RoutineTaskAssignmentModel.deleteMany({}),
    RoutineTaskTemplateModel.deleteMany({}),
    TaskCompletionModel.deleteMany({}),
    TaskPackAssignmentModel.deleteMany({}),
    TaskPackModel.deleteMany({}),
    TaskModel.deleteMany({}),
    CleaningAreaModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])

  const adminPassword = 'Hostel2026!'
  const volunteerPasswords = {
    juan: 'MorningCrew!1',
    lucia: 'GuestHero!2',
    mateo: 'KitchenBoost!3',
    sofia: 'SeasonHelper!4',
  }
  const cleanerPasswords = {
    eva: 'CleanShift!5',
    diego: 'RoomReset!6',
  }

  const [admin, juan, lucia, mateo, sofia, eva, diego] = await Promise.all([
    UserModel.create({
      role: 'ADMIN',
      name: 'Camila Ortega',
      email: 'camila@hostel.demo',
      username: 'camila.admin',
      passwordHash: await hashPassword(adminPassword),
      passwordPreview: adminPassword,
      avatar: 'CO',
      title: 'Hostel Manager',
      isActive: true,
      points: 0,
      lifetimePoints: 0,
      completedTasks: 0,
    }),
    UserModel.create({
      role: 'VOLUNTEER',
      name: 'Juan Perez',
      email: 'juan@hostel.demo',
      username: 'juan.perez',
      passwordHash: await hashPassword(volunteerPasswords.juan),
      passwordPreview: volunteerPasswords.juan,
      avatar: avatarOf('Juan Perez'),
      title: 'Morning Crew',
      isActive: true,
      points: 190,
      lifetimePoints: 250,
      completedTasks: 14,
      badge: 'Reliable Starter',
      shift: 'Morning',
      offDay: 'SUNDAY',
    }),
    UserModel.create({
      role: 'VOLUNTEER',
      name: 'Lucia Gomes',
      email: 'lucia@hostel.demo',
      username: 'lucia.gomes',
      passwordHash: await hashPassword(volunteerPasswords.lucia),
      passwordPreview: volunteerPasswords.lucia,
      avatar: avatarOf('Lucia Gomes'),
      title: 'Guest Experience',
      isActive: true,
      points: 260,
      lifetimePoints: 440,
      completedTasks: 18,
      badge: 'Guest Hero',
      shift: 'Afternoon',
      offDay: 'TUESDAY',
    }),
    UserModel.create({
      role: 'VOLUNTEER',
      name: 'Mateo Silva',
      email: 'mateo@hostel.demo',
      username: 'mateo.silva',
      passwordHash: await hashPassword(volunteerPasswords.mateo),
      passwordPreview: volunteerPasswords.mateo,
      avatar: avatarOf('Mateo Silva'),
      title: 'Kitchen Support',
      isActive: true,
      points: 145,
      lifetimePoints: 145,
      completedTasks: 11,
      badge: 'Fast Finisher',
      shift: 'Rotating',
      offDay: 'FRIDAY',
    }),
    UserModel.create({
      role: 'VOLUNTEER',
      name: 'Sofia Rivas',
      email: 'sofia@hostel.demo',
      username: 'sofia.rivas',
      passwordHash: await hashPassword(volunteerPasswords.sofia),
      passwordPreview: volunteerPasswords.sofia,
      avatar: avatarOf('Sofia Rivas'),
      title: 'Seasonal Helper',
      isActive: false,
      points: 80,
      lifetimePoints: 120,
      completedTasks: 7,
      badge: 'Calm Support',
      shift: 'Part-time',
      offDay: 'WEDNESDAY',
    }),
    UserModel.create({
      role: 'CLEANER',
      name: 'Eva Morales',
      email: 'eva@hostel.demo',
      username: 'eva.clean',
      passwordHash: await hashPassword(cleanerPasswords.eva),
      passwordPreview: cleanerPasswords.eva,
      avatar: avatarOf('Eva Morales'),
      title: 'Cleaning Lead',
      isActive: true,
      points: 0,
      lifetimePoints: 0,
      completedTasks: 34,
      shift: 'Morning',
    }),
    UserModel.create({
      role: 'CLEANER',
      name: 'Diego Ruiz',
      email: 'diego@hostel.demo',
      username: 'diego.clean',
      passwordHash: await hashPassword(cleanerPasswords.diego),
      passwordPreview: cleanerPasswords.diego,
      avatar: avatarOf('Diego Ruiz'),
      title: 'Room Service',
      isActive: true,
      points: 0,
      lifetimePoints: 0,
      completedTasks: 21,
      shift: 'Afternoon',
    }),
  ])

  const [, luggageStorage] = await CleaningAreaModel.create([
    { name: 'Laundry deck', isActive: true },
    { name: 'Luggage storage', isActive: true },
    { name: 'Yoga deck', isActive: true },
  ])

  const [morningPack, sunsetPack] = await TaskPackModel.create([
    {
      name: 'Morning Shift Pack',
      description: 'Light routine to get the hostel ready before the breakfast rush.',
      durationDays: 3,
      isActive: true,
      templates: [
        {
          title: 'Clean kitchen',
          description: 'Counters, outer fridge surfaces, and fresh cloths.',
          category: 'KITCHEN',
          priority: 'MEDIUM',
          dayOffset: 1,
          startTime: '08:00',
          endTime: '10:00',
          points: 20,
        },
        {
          title: 'Review bathrooms',
          description: 'Quick cleaning and stock check.',
          category: 'HOUSEKEEPING',
          priority: 'HIGH',
          dayOffset: 1,
          startTime: '10:00',
          endTime: '11:00',
          points: 15,
        },
        {
          title: 'Organize reception',
          description: 'Flyers, keys, and welcome materials.',
          category: 'RECEPTION',
          priority: 'MEDIUM',
          dayOffset: 2,
          startTime: '09:00',
          endTime: '10:00',
          points: 12,
        },
      ],
    },
    {
      name: 'Sunset Community Pack',
      description: 'Operational closeout and atmosphere ready for the night shift.',
      durationDays: 2,
      isActive: true,
      templates: [
        {
          title: 'Set terrace ambiance',
          description: 'Table settings, LED candles, and playlist.',
          category: 'EVENTS',
          priority: 'MEDIUM',
          dayOffset: 1,
          startTime: '17:30',
          endTime: '18:30',
          points: 22,
        },
        {
          title: 'Close terrace',
          description: 'Store blankets, check lights, and tidy the bar area.',
          category: 'MAINTENANCE',
          priority: 'MEDIUM',
          dayOffset: 1,
          startTime: '22:30',
          endTime: '23:30',
          points: 24,
        },
      ],
    },
  ])

  const [breakfastSetup, bathroomRefresh, terraceReset] = await RoutineTaskTemplateModel.create([
    {
      name: 'Breakfast setup',
      description: 'Set mugs, tea station, fruit bowls, and refill the water jars before service starts.',
      category: 'KITCHEN',
      priority: 'MEDIUM',
      points: 18,
      isActive: true,
      notes: 'Usually assigned weekly to the morning crew.',
    },
    {
      name: 'Bathroom refresh',
      description: 'Check paper, hand soap, mirrors, and make a quick sanitation pass on shared bathrooms.',
      category: 'HOUSEKEEPING',
      priority: 'HIGH',
      points: 16,
      isActive: true,
      notes: 'A volunteer can release this exact slot if they are unavailable.',
    },
    {
      name: 'Sunset terrace reset',
      description: 'Prepare blankets, tidy seating, and check terrace lighting before the evening social block.',
      category: 'EVENTS',
      priority: 'MEDIUM',
      points: 22,
      isActive: true,
    },
  ])

  const packAssignment1 = await TaskPackAssignmentModel.create({
    packId: morningPack._id,
    volunteerId: juan._id,
    startDate: new Date(),
    endDate: isoFromOffset(72),
  })

  const packAssignment2 = await TaskPackAssignmentModel.create({
    packId: sunsetPack._id,
    volunteerId: mateo._id,
    startDate: isoFromOffset(-48),
    endDate: isoFromOffset(-6),
  })

  const routineAssignment1 = await RoutineTaskAssignmentModel.create({
    templateId: breakfastSetup._id,
    volunteerId: juan._id,
    startsOn: new Date(),
    endsOn: isoFromOffset(24 * 10),
    weekdays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    startTime: '07:30',
    endTime: '08:30',
  })

  const routineAssignment2 = await RoutineTaskAssignmentModel.create({
    templateId: bathroomRefresh._id,
    volunteerId: lucia._id,
    startsOn: new Date(),
    endsOn: isoFromOffset(24 * 12),
    weekdays: ['TUESDAY', 'THURSDAY'],
    startTime: '10:00',
    endTime: '10:30',
  })

  const task7Start = combineDateAndTime(new Date(), '08:00')
  const task7End = combineDateAndTime(new Date(), '10:00')

  const [task1, task2, task3, task4, task5, task6, task7, task8, task9, task10, routineTask1, routineTask2, cleaningTask1, cleaningTask2, cleaningTask3, cleaningTask4] =
    await TaskModel.create([
      {
        title: 'Prepare welcome drinks',
        description: 'Set the station for the 6:00 PM group check-in.',
        category: 'GUEST_CARE',
        priority: 'MEDIUM',
        status: 'AVAILABLE',
        points: 20,
        publishedAt: isoFromOffset(-2),
        endsAt: isoFromOffset(-1.5),
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Check second-floor bathrooms',
        description: 'Quick review, paper restock, and light sanitizing.',
        category: 'HOUSEKEEPING',
        priority: 'HIGH',
        status: 'ASSIGNED',
        points: 15,
        publishedAt: isoFromOffset(-5),
        endsAt: isoFromOffset(-4.5),
        assignedToId: juan._id,
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Organize reception before night shift',
        description: 'Arrange flyers, keycards, and petty cash.',
        category: 'RECEPTION',
        priority: 'MEDIUM',
        status: 'AVAILABLE',
        points: 12,
        publishedAt: isoFromOffset(-1),
        endsAt: isoFromOffset(-0.5),
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Review coffee stock',
        description: 'Log supplies and leave a suggested order in notes.',
        category: 'KITCHEN',
        priority: 'LOW',
        status: 'SCHEDULED',
        points: 18,
        publishedAt: isoFromOffset(3),
        startsAt: isoFromOffset(3),
        endsAt: isoFromOffset(3.5),
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Set up coworking corner',
        description: 'Arrange chairs, power outlets, and the quiet sign.',
        category: 'MAINTENANCE',
        priority: 'MEDIUM',
        status: 'SCHEDULED',
        points: 22,
        publishedAt: isoFromOffset(8),
        startsAt: isoFromOffset(8),
        endsAt: isoFromOffset(9),
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Support themed dinner setup',
        description: 'Coordinate tableware and atmosphere for 24 guests.',
        category: 'EVENTS',
        priority: 'HIGH',
        status: 'ASSIGNED',
        points: 30,
        publishedAt: isoFromOffset(-4),
        endsAt: isoFromOffset(-3),
        assignedToId: lucia._id,
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Morning Shift Pack - Clean kitchen',
        description: 'Part of the Morning Shift Pack.',
        category: 'KITCHEN',
        priority: 'MEDIUM',
        status: 'ASSIGNED',
        points: 20,
        publishedAt: task7Start,
        startsAt: task7Start,
        endsAt: task7End,
        assignedToId: juan._id,
        createdById: admin._id,
        source: 'PACK',
        packId: morningPack._id,
        packAssignmentId: packAssignment1._id,
      },
      {
        title: 'Night pack - close terrace',
        description: 'Final check of lights, blankets, and a quick cleanup.',
        category: 'MAINTENANCE',
        priority: 'MEDIUM',
        status: 'COMPLETED',
        points: 24,
        publishedAt: isoFromOffset(-26),
        endsAt: isoFromOffset(-25),
        assignedToId: mateo._id,
        createdById: admin._id,
        source: 'PACK',
        packId: sunsetPack._id,
        packAssignmentId: packAssignment2._id,
      },
      {
        title: 'Restock amenities in private rooms',
        description: 'Add towels, soap, and the activities list.',
        category: 'HOUSEKEEPING',
        priority: 'MEDIUM',
        status: 'COMPLETED',
        points: 18,
        publishedAt: isoFromOffset(-30),
        endsAt: isoFromOffset(-29.5),
        assignedToId: lucia._id,
        createdById: admin._id,
        source: 'MANUAL',
      },
      {
        title: 'Check hostel bicycles',
        description: 'Review tire pressure, locks, and overall condition.',
        category: 'MAINTENANCE',
        priority: 'URGENT',
        status: 'DRAFT',
        points: 26,
        publishedAt: new Date(),
        endsAt: isoFromOffset(1),
        createdById: admin._id,
        source: 'MANUAL',
        notes: 'Waiting for spare parts confirmation.',
      },
      {
        title: 'Breakfast setup',
        description: 'Recurring task assigned from the standard recurring task library.',
        category: 'KITCHEN',
        priority: 'MEDIUM',
        status: 'ASSIGNED',
        points: 18,
        publishedAt: combineDateAndTime(new Date(), '07:30'),
        startsAt: combineDateAndTime(new Date(), '07:30'),
        endsAt: combineDateAndTime(new Date(), '08:30'),
        assignedToId: juan._id,
        createdById: admin._id,
        source: 'ROUTINE',
        routineTemplateId: breakfastSetup._id,
        routineAssignmentId: routineAssignment1._id,
        notes: 'Assigned as part of the recurring schedule.',
      },
      {
        title: 'Bathroom refresh',
        description: 'Recurring task assigned from the standard recurring task library.',
        category: 'HOUSEKEEPING',
        priority: 'HIGH',
        status: 'SCHEDULED',
        points: 16,
        publishedAt: combineDateAndTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), '10:00'),
        startsAt: combineDateAndTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), '10:00'),
        endsAt: combineDateAndTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), '10:30'),
        assignedToId: lucia._id,
        createdById: admin._id,
        source: 'ROUTINE',
        routineTemplateId: bathroomRefresh._id,
        routineAssignmentId: routineAssignment2._id,
        notes: 'Can be released independently if the assigned volunteer is unavailable.',
      },
      {
        title: 'Deep clean room 204',
        description: 'Change linens, sanitize surfaces, refresh amenities, and vacuum the full room before the next arrival.',
        category: 'HOUSEKEEPING',
        priority: 'HIGH',
        status: 'ASSIGNED',
        audience: 'CLEANING',
        points: 0,
        publishedAt: combineDateAndTime(new Date(), '10:00'),
        startsAt: combineDateAndTime(new Date(), '10:00'),
        endsAt: combineDateAndTime(new Date(), '11:30'),
        assignedToId: eva._id,
        createdById: admin._id,
        source: 'MANUAL',
        cleaningLocationType: 'ROOM',
        cleaningLocationLabel: 'Room 204',
        cleaningRoomNumber: 204,
      },
      {
        title: 'Refresh shared showers',
        description: 'Quick sanitation pass, dry the floor, refill soap, and report anything broken.',
        category: 'HOUSEKEEPING',
        priority: 'MEDIUM',
        status: 'AVAILABLE',
        audience: 'CLEANING',
        points: 0,
        publishedAt: isoFromOffset(-1),
        startsAt: combineDateAndTime(new Date(), '14:00'),
        endsAt: combineDateAndTime(new Date(), '15:00'),
        createdById: admin._id,
        source: 'MANUAL',
        cleaningLocationType: 'CUSTOM',
        cleaningLocationLabel: 'Shower area',
      },
      {
        title: 'Prepare luggage storage',
        description: 'Sweep the area, sanitize handles, and reorganize shelves for incoming bags.',
        category: 'MAINTENANCE',
        priority: 'LOW',
        status: 'SCHEDULED',
        audience: 'CLEANING',
        points: 0,
        publishedAt: isoFromOffset(2),
        startsAt: combineDateAndTime(new Date(), '17:00'),
        endsAt: combineDateAndTime(new Date(), '18:00'),
        createdById: admin._id,
        source: 'MANUAL',
        cleaningLocationType: 'CUSTOM',
        cleaningLocationLabel: luggageStorage.name,
      },
      {
        title: 'Room 118 check-out reset',
        description: 'Complete a fast turnover for the room and leave it guest-ready.',
        category: 'HOUSEKEEPING',
        priority: 'HIGH',
        status: 'COMPLETED',
        audience: 'CLEANING',
        points: 0,
        publishedAt: isoFromOffset(-8),
        startsAt: isoFromOffset(-8),
        endsAt: isoFromOffset(-6.5),
        assignedToId: diego._id,
        createdById: admin._id,
        source: 'MANUAL',
        cleaningLocationType: 'ROOM',
        cleaningLocationLabel: 'Room 118',
        cleaningRoomNumber: 118,
      },
    ])

  await TaskCompletionModel.create([
    {
      taskId: task8._id,
      volunteerId: mateo._id,
      completedAt: isoFromOffset(-12),
      points: 24,
      source: 'PACK',
      packId: sunsetPack._id,
    },
    {
      taskId: task9._id,
      volunteerId: lucia._id,
      completedAt: isoFromOffset(-20),
      points: 18,
      source: 'MANUAL',
    },
    {
      taskId: routineTask1._id,
      volunteerId: juan._id,
      completedAt: isoFromOffset(-72),
      points: 18,
      source: 'ROUTINE',
      routineTemplateId: breakfastSetup._id,
    },
    {
      taskId: routineTask2._id,
      volunteerId: lucia._id,
      completedAt: isoFromOffset(-144),
      points: 16,
      source: 'ROUTINE',
      routineTemplateId: bathroomRefresh._id,
    },
    {
      taskId: task6._id,
      volunteerId: mateo._id,
      completedAt: isoFromOffset(-216),
      points: 22,
      source: 'ROUTINE',
      routineTemplateId: terraceReset._id,
    },
    {
      taskId: cleaningTask4._id,
      volunteerId: diego._id,
      completedAt: isoFromOffset(-6),
      points: 0,
      source: 'MANUAL',
    },
  ])

  const [reward1, , reward3, reward4, reward5, reward6] = await RewardModel.create([
    {
      name: 'Free drink',
      description: 'Cold brew, kombucha, or bar lemonade.',
      cost: 60,
      category: 'Food & Drink',
      isActive: true,
      stock: 11,
      icon: 'coffee',
    },
    {
      name: 'Special breakfast',
      description: 'Premium breakfast with fresh fruit and barista coffee.',
      cost: 110,
      category: 'Food & Drink',
      isActive: true,
      stock: 6,
      icon: 'sparkles',
    },
    {
      name: 'Partial day off',
      description: 'Half-day free block depending on availability.',
      cost: 220,
      category: 'Time Off',
      isActive: true,
      stock: 3,
      icon: 'shield',
    },
    {
      name: 'Free dinner',
      description: 'One hostel menu dinner for the volunteer and one guest.',
      cost: 180,
      category: 'Food & Drink',
      isActive: true,
      stock: 3,
      icon: 'gift',
    },
    {
      name: 'Room upgrade',
      description: 'One night in a premium shared room or a private room.',
      cost: 320,
      category: 'Stay',
      isActive: true,
      stock: 2,
      icon: 'hospitality',
    },
    {
      name: 'Partner cafe voucher',
      description: 'Voucher redeemable at a partner coffee shop.',
      cost: 90,
      category: 'Local Perks',
      isActive: false,
      stock: 8,
      icon: 'bell',
    },
  ])

  await RedemptionModel.create([
    {
      rewardId: reward1._id,
      volunteerId: juan._id,
      createdAt: isoFromOffset(-18),
      cost: 60,
      status: 'COMPLETED',
    },
    {
      rewardId: reward4._id,
      volunteerId: lucia._id,
      createdAt: isoFromOffset(-6),
      cost: 180,
      status: 'COMPLETED',
    },
  ])

  await ActivityModel.create([
    {
      type: 'TASK_TAKEN',
      title: 'Lucia claimed "Support themed dinner setup"',
      description: 'The board updated in real time.',
      createdAt: isoFromOffset(-4),
    },
    {
      type: 'TASK_COMPLETED',
      title: 'Mateo completed "Night pack - close terrace"',
      description: 'He earned 24 points toward weekly progress.',
      createdAt: isoFromOffset(-12),
    },
    {
      type: 'REWARD_REDEEMED',
      title: 'Lucia redeemed "Free dinner"',
      description: 'The stock and point balance were updated instantly.',
      createdAt: isoFromOffset(-6),
    },
    {
      type: 'PACK_ASSIGNED',
      title: 'Morning Shift Pack was assigned to Juan',
      description: 'Tasks were generated for the next few days.',
      createdAt: isoFromOffset(-12),
    },
    {
      type: 'VOLUNTEER_UPDATED',
      title: 'Volunteer profiles were synced',
      description: 'Login credentials and off-day details are ready for admin review.',
      createdAt: isoFromOffset(-2),
    },
    {
      type: 'TASK_CREATED',
      title: 'Cleaning task created',
      description: `Deep clean room 204 was assigned to ${eva.name}.`,
      createdAt: isoFromOffset(-1.5),
    },
    {
      type: 'TASK_COMPLETED',
      title: 'Cleaning task completed',
      description: `${diego.name} finished the reset for Room 118.`,
      createdAt: isoFromOffset(-6),
    },
  ])

  console.log('MongoDB seeded successfully')
  console.log(`Admin login: camila.admin / ${adminPassword}`)
  console.log(`Volunteer login: juan.perez / ${volunteerPasswords.juan}`)
  console.log(`Volunteer login: lucia.gomes / ${volunteerPasswords.lucia}`)
  console.log(`Volunteer login: mateo.silva / ${volunteerPasswords.mateo}`)
  console.log(`Volunteer login: sofia.rivas / ${volunteerPasswords.sofia}`)
  console.log(`Cleaner login: eva.clean / ${cleanerPasswords.eva}`)
  console.log(`Cleaner login: diego.clean / ${cleanerPasswords.diego}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
