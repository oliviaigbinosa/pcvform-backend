import express from 'express'
import {
  listUsers,
  listUserEmails,
  listAdminEmails,
  createUser,
  deleteUser,
  validateManagerEmail,
} from '../controllers/adminController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.get('/users', authenticateToken, listUsers)
router.get('/user-emails', authenticateToken, listUserEmails)
router.get('/emails', authenticateToken, listAdminEmails)
router.get('/validate-manager-email', authenticateToken, validateManagerEmail)
router.post('/users', authenticateToken, createUser)
router.delete('/users/:id', authenticateToken, deleteUser)

export default router
