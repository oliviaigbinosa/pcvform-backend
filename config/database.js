import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import Admin from '../models/Admin.js'

export async function connectDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is not set in .env')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB Atlas')
}

export async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminEmail && adminPassword) {
    const existing = await Admin.findOne({ email: adminEmail.toLowerCase() })
    if (!existing) {
      const hashed = await bcrypt.hash(adminPassword, 10)
      await Admin.create({ email: adminEmail.toLowerCase(), password: hashed, role: 'admin' })
      console.log(`Seeded admin account: ${adminEmail}`)
    }
  } else {
    console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed')
  }

  const superEmail = process.env.SUPER_ADMIN_EMAIL
  const superPassword = process.env.SUPER_ADMIN_PASSWORD
  if (!superEmail || !superPassword) {
    console.warn('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set — skipping super admin seed')
    return
  }

  const existingSuper = await Admin.findOne({ email: superEmail.toLowerCase() })
  if (!existingSuper) {
    const hashed = await bcrypt.hash(superPassword, 10)
    await Admin.create({ email: superEmail.toLowerCase(), password: hashed, role: 'super admin' })
    console.log(`Seeded super admin account: ${superEmail}`)
  }
}
