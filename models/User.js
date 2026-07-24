import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  department: { type: String },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String },
})

export default mongoose.model('User', userSchema)
