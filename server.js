import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import { connectDb, seedAdmin } from './config/database.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import emailRoutes from './routes/emailRoutes.js'
import voucherRoutes from './routes/voucherRoutes.js'
import leaveRequestRoutes from './routes/leaveRequestRoutes.js'

dotenv.config()

const app = express()

// Configure CORS to allow credentials
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api', emailRoutes)
app.use('/api', voucherRoutes)
app.use('/api', leaveRequestRoutes)

app.get('/', (_req, res) => {
  res.json({ status: 'ok' })
})

const port = process.env.PORT || 3001

connectDb()
  .then(seedAdmin)
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`)
    })
  })
  .catch((error) => {
    console.error('Failed to start server', error)
    process.exit(1)
  })
