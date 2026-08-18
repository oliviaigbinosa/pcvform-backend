import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import Admin from '../models/Admin.js'
import SuperAdmin from '../models/SuperAdmin.js'

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
  const superEmail = process.env.SUPER_ADMIN_EMAIL
  const superPassword = process.env.SUPER_ADMIN_PASSWORD
  
  console.log('Checking super admin credentials...')
  console.log('SUPER_ADMIN_EMAIL:', superEmail ? superEmail : 'NOT SET')
  console.log('SUPER_ADMIN_PASSWORD:', superPassword ? '*** SET ***' : 'NOT SET')
  
  if (!superEmail || !superPassword) {
    console.warn('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set — skipping super admin seed')
    return
  }

  const normalizedEmail = superEmail.toLowerCase()
  console.log('Looking for existing super admin with email:', normalizedEmail)
  
  // Check SuperAdmin collection only
  const existingSuperAdmin = await SuperAdmin.findOne({ email: normalizedEmail })
  
  if (existingSuperAdmin) {
    console.log('Super admin already exists with email:', normalizedEmail)
    return
  }
  
  console.log('No existing super admin found, creating new one...')
  try {
    const hashed = await bcrypt.hash(superPassword, 10)
    
    // Create only in SuperAdmin collection
    const newSuperAdmin = await SuperAdmin.create({ 
      email: normalizedEmail, 
      password: hashed, 
      role: 'super admin' 
    })
    
    console.log('Seeded super admin account successfully:', newSuperAdmin.email)
  } catch (error) {
    console.error('Failed to seed super admin:', error)
    throw error
  }
}
