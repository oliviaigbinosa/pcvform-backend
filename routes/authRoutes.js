import express from 'express'
import { getMe, login, changePassword, forgotPassword, resetPassword } from '../controllers/authController.js'

const router = express.Router()

router.post('/login', login)
router.post('/change-password', changePassword)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.get('/me', getMe)

export default router
