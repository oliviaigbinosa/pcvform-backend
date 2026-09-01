import express from 'express'
import { getLeaveRequests, createLeaveRequest, updateLeaveRequestStatus } from '../controllers/leaveRequestController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.get('/leave-requests', authenticateToken, getLeaveRequests)
router.post('/leave-requests', authenticateToken, createLeaveRequest)
router.patch('/leave-requests/:id/status', authenticateToken, updateLeaveRequestStatus)

export default router
