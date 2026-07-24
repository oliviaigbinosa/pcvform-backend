import express from 'express'
import { listUsers, createUser, deleteUser } from '../controllers/adminController.js'

const router = express.Router()

router.get('/users', listUsers)
router.post('/users', createUser)
router.delete('/users/:id', deleteUser)

export default router
