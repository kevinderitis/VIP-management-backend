import { Router } from 'express'
import { appStateRouter } from './app-state.routes.js'
import { authRouter } from './auth.routes.js'
import { cleanersRouter } from './cleaners.routes.js'
import { cleaningAreasRouter } from './cleaning-areas.routes.js'
import { cleaningPlaceStatusesRouter } from './cleaning-place-statuses.routes.js'
import { cleaningRoomsRouter } from './cleaning-rooms.routes.js'
import { cleaningTasksRouter } from './cleaning-tasks.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { officeCallsRouter } from './office-calls.routes.js'
import { packsRouter } from './packs.routes.js'
import { rewardsRouter } from './rewards.routes.js'
import { routinesRouter } from './routines.routes.js'
import { tasksRouter } from './tasks.routes.js'
import { volunteersRouter } from './volunteers.routes.js'

const router = Router()

router.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'vip-management-backend',
    now: new Date().toISOString(),
  })
})

router.use('/auth', authRouter)
router.use('/app-state', appStateRouter)
router.use('/dashboard', dashboardRouter)
router.use('/office-calls', officeCallsRouter)
router.use('/volunteers', volunteersRouter)
router.use('/cleaners', cleanersRouter)
router.use('/tasks', tasksRouter)
router.use('/cleaning-tasks', cleaningTasksRouter)
router.use('/cleaning-areas', cleaningAreasRouter)
router.use('/cleaning-rooms', cleaningRoomsRouter)
router.use('/cleaning-place-statuses', cleaningPlaceStatusesRouter)
router.use('/packs', packsRouter)
router.use('/routine-tasks', routinesRouter)
router.use('/rewards', rewardsRouter)

export { router as apiRouter }
