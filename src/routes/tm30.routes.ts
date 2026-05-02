import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler.js'
import { requireRole } from '../middlewares/auth.js'
import { createCheckinService } from '../services/checkin.service.js'

const router = Router()
const checkinService = createCheckinService()

router.use(requireRole('ADMIN'))

router.get(
  '/export',
  asyncHandler(async (request, response) => {
    const date = z.string().optional().parse(request.query.date)
    const file = await checkinService.exportTm30(date)

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`)
    response.sendFile(file.filePath)
  }),
)

export { router as tm30Router }
