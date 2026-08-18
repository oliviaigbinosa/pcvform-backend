import mongoose from 'mongoose'

const superAdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, default: 'super admin' },
  department: { type: String },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('SuperAdmin', superAdminSchema)
