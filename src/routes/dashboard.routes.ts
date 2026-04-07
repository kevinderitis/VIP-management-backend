import { Router } from 'express'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createDashboardService } from '../services/dashboard.service.js'

const router = Router()
const dashboardService = createDashboardService()

router.get(
  '/admin-overview',
  requireRole('ADMIN'),
  asyncHandler(async (_request, response) => {
    response.json(await dashboardService.adminOverview())
  }),
)

export { router as dashboardRouter }
