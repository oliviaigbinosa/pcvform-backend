import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mongoSanitize from 'express-mongo-sanitize'
import { connectDb, seedAdmin } from './config/database.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import emailRoutes from './routes/emailRoutes.js'
import voucherRoutes from './routes/voucherRoutes.js'
import leaveRequestRoutes from './routes/leaveRequestRoutes.js'


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

// CORS configuration — allow forcing localhost via env for local development
const useLocalHost = String(process.env.FORCE_LOCALHOST || '').toLowerCase() === 'true'
const frontendOrigin = useLocalHost ? 'http://localhost:3000' : (process.env.FRONTEND_URL || 'http://localhost:3000')
app.use(cors({
  origin: frontendOrigin,
  credentials: true
}))

console.log('CORS origin set to:', frontendOrigin)

app.use(express.json({ limit: '10mb' }))

// Ensure `req.query` is a writable own-property before sanitizer runs.
// Express 5 exposes `req.query` as an accessor on the prototype in some
// environments; `express-mongo-sanitize` attempts to assign into it which
// can throw "only one getter" errors on some platforms (Render). Create
// a writable shadow property per-request to avoid that.
app.use((req, _res, next) => {
  try {
    const q = req.query
    Object.defineProperty(req, 'query', {
      value: q,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  } catch (e) {
    // If this fails for any reason, continue without blocking the request
  }
  next()
})

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
