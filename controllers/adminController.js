import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Admin from '../models/Admin.js'

function isUserEmail(email) {
  return /^[^\s@]+@(getpayedmail\.com|gmail\.com)$/.test(email)
}

export const listUsers = async (_req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 })
    const admins = await Admin.find({ role: { $ne: 'super admin' } }, '-password').sort({ createdAt: -1 })
    const all = [...users, ...admins].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt) : new Date(1)
      const bDate = b.createdAt ? new Date(b.createdAt) : new Date(1)
      return bDate - aDate
    })
    return res.json(
      all.map((user) => ({
        id: user._id.toString(),
        email: user.email,
        addedAt: user.createdAt ? user.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        role: user.role || 'user',
      })),
    )
  } catch (error) {
    console.error('Failed to list users', error)
    return res.status(500).json({ error: 'Failed to list users' })
  }
}

export const createUser = async (req, res) => {
  try {
    const { email, password, createdBy, department, role } = req.body
    const creator = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!isUserEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Email must be a @getpayedmail.com or @gmail.com address' })
    }

    const isAdmin = role === 'admin'
    if (isAdmin) {
      const admin = await Admin.findOne({ email: creator })
      if (!admin || admin.role !== 'super admin') {
        return res.status(403).json({ error: 'Only super admins can create admin accounts' })
      }
    }

    const existing = isAdmin
      ? await Admin.findOne({ email: normalizedEmail })
      : await User.findOne({ email: normalizedEmail })
    if (existing) {
      return res.status(409).json({ error: 'This user has already been added' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const Model = isAdmin ? Admin : User
    const user = await Model.create({
      email: normalizedEmail,
      password: hashed,
      department: department || undefined,
      createdBy: creator || createdBy || undefined,
    })

    return res.status(201).json({
      id: user._id.toString(),
      email: user.email,
      addedAt: user.createdAt.toISOString().slice(0, 10),
      role: user.role || (isAdmin ? 'admin' : 'user'),
    })
  } catch (error) {
    console.error('Failed to create user', error)
    return res.status(500).json({ error: 'Failed to create user' })
  }
}

export const deleteUser = async (req, res) => {
  try {
    let user = await User.findByIdAndDelete(req.params.id)
    if (!user) {
      user = await Admin.findByIdAndDelete(req.params.id)
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    return res.json({ ok: true })
  } catch (error) {
    console.error('Failed to delete user', error)
    return res.status(500).json({ error: 'Failed to delete user' })
  }
}
