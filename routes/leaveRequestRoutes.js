import express from 'express'
import { getLeaveRequests, createLeaveRequest } from '../controllers/leaveRequestController.js'

const router = express.Router()

router.get('/leave-requests', getLeaveRequests)
router.post('/leave-requests', createLeaveRequest)

export default router
