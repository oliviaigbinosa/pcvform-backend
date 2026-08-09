import express from 'express'
import { getLeaveRequests, createLeaveRequest, updateLeaveRequestStatus } from '../controllers/leaveRequestController.js'

const router = express.Router()

router.get('/leave-requests', getLeaveRequests)
router.post('/leave-requests', createLeaveRequest)
router.patch('/leave-requests/:id/status', updateLeaveRequestStatus)

export default router
