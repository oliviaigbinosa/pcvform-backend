import express from 'express'
import { getVouchers, createVoucher, updateVoucherStatus } from '../controllers/voucherController.js'

const router = express.Router()

router.get('/vouchers', getVouchers)
router.post('/vouchers', createVoucher)
router.patch('/vouchers/:id/status', updateVoucherStatus)

export default router
