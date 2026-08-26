import express from 'express'
import { getMe, login, changePassword, forgotPassword, resetPassword, logout } from '../controllers/authController.js'
import { loginLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js'

const router = express.Router()

router.post('/login', loginLimiter, login)
router.post('/change-password', changePassword)
router.post('/forgot-password', passwordResetLimiter, forgotPassword)
router.post('/reset-password', passwordResetLimiter, resetPassword)
router.post('/logout', logout)
router.get('/me', getMe)

export default router
