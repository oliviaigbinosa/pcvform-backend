import express from 'express'
import { listUsers, listAdminEmails, createUser, deleteUser } from '../controllers/adminController.js'

const router = express.Router()

router.get('/users', listUsers)
router.get('/emails', listAdminEmails)
router.post('/users', createUser)
router.delete('/users/:id', deleteUser)

export default router
