import express from 'express'
import { sendInviteEmail, sendVoucherEmail, sendApprovedCcEmail } from '../controllers/emailController.js'

const router = express.Router()

router.post('/email/send-invite', sendInviteEmail)
router.post('/email/send-voucher', sendVoucherEmail)
router.post('/email/send-approved-cc', sendApprovedCcEmail)

export default router
