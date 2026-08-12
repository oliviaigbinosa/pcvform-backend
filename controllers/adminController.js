import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Admin from '../models/Admin.js'

function isUserEmail(email) {
  return /^[^\s@]+@getpayedmail\.com$/.test(email)
}

function getCreatedAt(user) {
  return user.createdAt || user._id.getTimestamp()
}

export const listUsers = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    const requestingAdmin = await Admin.findOne({ email }, '-password')
    const isSuper = requestingAdmin?.role === 'super admin'

    let users = []
    let admins = []

    if (isSuper) {
      users = await User.find({}, '-password')
      admins = await Admin.find({ role: { $ne: 'super admin' } }, '-password')
    } else {
      users = await User.find({ createdBy: email }, '-password')
    }

    const all = [...users, ...admins].sort(
      (a, b) => getCreatedAt(a).getTime() - getCreatedAt(b).getTime(),
    )
    return res.json(
      all.map((user) => ({
        id: user._id.toString(),
        email: user.email,
        addedAt: getCreatedAt(user).toISOString(),
        role: user.role || 'user',
        department: user.department || '',
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
      return res.status(400).json({ error: 'Email must be a @getpayedmail.com address' })
    }

    const isAdmin = role === 'admin'
    if (isAdmin) {
      const admin = await Admin.findOne({ email: creator })
      if (!admin || admin.role !== 'super admin') {
        return res.status(403).json({ error: 'Only super admins can create admin accounts' })
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail })
    const existingAdmin = await Admin.findOne({ email: normalizedEmail })
    if (existingUser || existingAdmin) {
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
      addedAt: getCreatedAt(user).toISOString(),
      role: user.role || (isAdmin ? 'admin' : 'user'),
      department: user.department || '',
    })
  } catch (error) {
    console.error('Failed to create user', error)
    return res.status(500).json({ error: 'Failed to create user' })
  }
}

export const deleteUser = async (req, res) => {
  try {
    const requesterEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    if (!requesterEmail) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const requester = await Admin.findOne({ email: requesterEmail })
    if (!requester) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const isSuper = requester.role === 'super admin'

    let user = await User.findById(req.params.id)
    if (!user) {
      user = await Admin.findById(req.params.id)
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const targetRole = user.role || 'user'
    if (!isSuper) {
      if (targetRole === 'admin') {
        return res.status(403).json({ error: 'Only super admins can delete admin accounts' })
      }
      if (String(user.createdBy || '').toLowerCase() !== requesterEmail) {
        return res.status(403).json({ error: 'You can only delete users you created' })
      }
    }

    await user.deleteOne()
    return res.json({ ok: true })
  } catch (error) {
    console.error('Failed to delete user', error)
    return res.status(500).json({ error: 'Failed to delete user' })
  }
}
