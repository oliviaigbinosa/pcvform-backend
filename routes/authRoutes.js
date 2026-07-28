import express from 'express'
import { getMe, login, changePassword } from '../controllers/authController.js'

const router = express.Router()

router.post('/login', login)
router.post('/change-password', changePassword)
router.get('/me', getMe)

export default router
