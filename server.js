import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { connectDb, seedAdmin } from './config/database.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import emailRoutes from './routes/emailRoutes.js'
import voucherRoutes from './routes/voucherRoutes.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api', emailRoutes)
app.use('/api', voucherRoutes)

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
