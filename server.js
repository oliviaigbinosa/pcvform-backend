import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import mongoSanitize from 'express-mongo-sanitize'
import { connectDb, seedAdmin } from './config/database.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import emailRoutes from './routes/emailRoutes.js'
import voucherRoutes from './routes/voucherRoutes.js'
import leaveRequestRoutes from './routes/leaveRequestRoutes.js'

dotenv.config()

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'RESET_TOKEN_SECRET']
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`)
    process.exit(1)
  }
})

const app = express()

// Security headers
app.use(helmet())

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://pettycashvoucher.netlify.app',
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))

// Sanitize user input to prevent NoSQL injection
app.use(mongoSanitize())

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
