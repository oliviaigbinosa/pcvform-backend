import express from 'express'
import { getVouchers, createVoucher, updateVoucherStatus, getNextVoucherNumber } from '../controllers/voucherController.js'

const router = express.Router()

router.get('/vouchers', getVouchers)
router.get('/vouchers/next-number', getNextVoucherNumber)
router.post('/vouchers', createVoucher)
router.patch('/vouchers/:id/status', updateVoucherStatus)

export default router
