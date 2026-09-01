import express from 'express'
import { getVouchers, createVoucher, updateVoucherStatus, getNextSerial } from '../controllers/voucherController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.get('/vouchers', authenticateToken, getVouchers)
router.post('/vouchers', authenticateToken, createVoucher)
router.patch('/vouchers/:id/status', authenticateToken, updateVoucherStatus)
router.get('/vouchers/next-serial', authenticateToken, getNextSerial)

export default router
