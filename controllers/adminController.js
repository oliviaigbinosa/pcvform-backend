import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Admin from '../models/Admin.js'
import SuperAdmin from '../models/SuperAdmin.js'
import { findAccountByEmail, isSuperAdminEmail, FINANCE_MANAGER_EMAIL } from '../utils/superAdmin.js'

function isGetPayedMailEmail(email) {
  return /^[^\s@]+@getpayedmail\.com$/.test(email)
}

function isUserEmail(email) {
  return /^[^\s@.]+\.[^\s@.]+(?:\.[^\s@.]+)*@getpayedmail\.com$/.test(email)
}

function getCreatedAt(user) {
  return user.createdAt || user._id.getTimestamp()
}

export const listUsers = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    const isSuper = await isSuperAdminEmail(email)

    let users = []
    let admins = []
    let superAdmins = []

    if (isSuper) {
      users = await User.find({}, '-password')
      admins = await Admin.find({ role: { $ne: 'super admin' } }, '-password')
      superAdmins = await SuperAdmin.find({}, '-password')
    } else {
      users = await User.find({ createdBy: email }, '-password')
    }

    const all = [...users, ...admins, ...superAdmins]
      .filter((user) => String(user.email || '').toLowerCase() !== FINANCE_MANAGER_EMAIL)
      .sort(
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
    const creator = String(req.headers['x-admin-email'] || req.body.createdBy || '').trim().toLowerCase()
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }
    if (!department) {
      return res.status(400).json({ error: 'Department is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedDepartment = department.trim()
    
    // Validate email format
    if (!/@getpayedmail\.com$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Email must end with @getpayedmail.com' })
    }
    if (!/^[^\s@.]+\.[^\s@.]+@getpayedmail\.com$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email' })
    }
    
    // Auto-assign super admin role for Finance department
    let finalRole = role
    if (normalizedDepartment.toLowerCase() === 'finance') {
      finalRole = 'super admin'
    }
    
    const isAdmin = finalRole === 'admin' || finalRole === 'super admin'
    
    const isSuper = await isSuperAdminEmail(creator)
    
    // Only super admins need to provide role (unless auto-assigned for Finance)
    if (isSuper && !role && normalizedDepartment.toLowerCase() !== 'finance') {
      return res.status(400).json({ error: 'Role is required' })
    }
    
    if (isAdmin && !isSuper) {
      return res.status(403).json({ error: 'Only super admins can create admin accounts' })
    }
    
    // Validate: Finance department members cannot be department managers
    if (normalizedDepartment.toLowerCase() === 'finance' && role === 'admin') {
      return res.status(400).json({ error: 'Select the appropriate role' })
    }

    const existingUser = await User.findOne({ email: normalizedEmail })
    const existingAdmin = await Admin.findOne({ email: normalizedEmail })
    const existingSuperAdmin = await SuperAdmin.findOne({ email: normalizedEmail })
    if (existingUser || existingAdmin || existingSuperAdmin) {
      return res.status(409).json({ error: 'This user has already been added' })
    }

    const hashed = await bcrypt.hash(password, 10)
    
    // Create user in appropriate collection
    let user
    if (finalRole === 'super admin') {
      // Create only in SuperAdmin collection
      user = await SuperAdmin.create({
        email: normalizedEmail,
        password: hashed,
        role: 'super admin',
        department: normalizedDepartment,
        createdBy: creator || createdBy || undefined,
      })
    } else if (isAdmin) {
      user = await Admin.create({
        email: normalizedEmail,
        password: hashed,
        role: finalRole,
        department: normalizedDepartment,
        createdBy: creator || createdBy || undefined,
      })
    } else {
      user = await User.create({
        email: normalizedEmail,
        password: hashed,
        role: finalRole,
        department: normalizedDepartment,
        createdBy: creator || createdBy || undefined,
      })
    }

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

export const listUserEmails = async (req, res) => {
  try {
    const requesterEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    const requester = await findAccountByEmail(requesterEmail)
    if (!requester) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    const role = requester.role || (requester.constructor?.modelName === 'SuperAdmin' ? 'super admin' : 'user')
    if (role !== 'admin' && role !== 'super admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }
    const users = await User.find({}, 'email').lean()
    return res.json(users.map((user) => user.email.toLowerCase()))
  } catch (error) {
    console.error('Failed to list user emails', error)
    return res.status(500).json({ error: 'Failed to list user emails' })
  }
}

export const listAdminEmails = async (req, res) => {
  try {
    const requesterEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    const requester = await findAccountByEmail(requesterEmail)
    if (!requester) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    const role = requester.role || (requester.constructor?.modelName === 'SuperAdmin' ? 'super admin' : 'user')
    if (role !== 'admin' && role !== 'super admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }
    const [admins, superAdmins] = await Promise.all([
      Admin.find({}, 'email').lean(),
      SuperAdmin.find({}, 'email').lean(),
    ])
    const allEmails = [
      ...admins.map((admin) => admin.email.toLowerCase()),
      ...superAdmins.map((sa) => sa.email.toLowerCase()),
    ]
    return res.json([...new Set(allEmails)])
  } catch (error) {
    console.error('Failed to list admin emails', error)
    return res.status(500).json({ error: 'Failed to list admin emails' })
  }
}

export const validateManagerEmail = async (req, res) => {
  try {
    const requesterEmail = String(req.headers['x-admin-email'] || req.headers['x-user-email'] || '').trim().toLowerCase()
    const targetEmailRaw = String(req.query.email || '').trim()

    if (!requesterEmail) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!targetEmailRaw) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const targetEmail = targetEmailRaw.toLowerCase()
    const requester = await findAccountByEmail(requesterEmail)

    if (!requester) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const requesterRole =
      requester.role ||
      (requester.constructor?.modelName === 'SuperAdmin'
        ? 'super admin'
        : requester.constructor?.modelName === 'Admin'
          ? 'admin'
          : 'user')

    const isAdminOrSuper = requesterRole === 'admin' || requesterRole === 'super admin'

    if (!isAdminOrSuper) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (targetEmail === requesterEmail) {
      return res.json({
        valid: false,
        error: 'Invalid email',
        reason: 'self',
      })
    }

    if (!/^[^\s@]+@getpayedmail\.com$/.test(targetEmail)) {
      return res.json({
        valid: false,
        error: 'Manager email must be a getpayedmail.com address',
        reason: 'domain',
      })
    }

    const targetAccount = await findAccountByEmail(targetEmail)

    if (!targetAccount) {
      return res.json({
        valid: false,
        error: 'This user has not been onboarded yet',
        reason: 'not_onboarded',
      })
    }

    const targetRole =
      targetAccount.role ||
      (targetAccount.constructor?.modelName === 'SuperAdmin'
        ? 'super admin'
        : targetAccount.constructor?.modelName === 'Admin'
          ? 'admin'
          : 'user')

    const isTargetAdminOrSuper = targetRole === 'admin' || targetRole === 'super admin'

    if (!isTargetAdminOrSuper) {
      return res.json({
        valid: false,
        error: 'This user is not a department manager',
        reason: 'not_manager',
      })
    }

    return res.json({
      valid: true,
      email: targetEmail,
      role: targetRole,
    })
  } catch (error) {
    console.error('Failed to validate manager email', error)
    return res.status(500).json({ error: 'Failed to validate manager email' })
  }
}

export const deleteUser = async (req, res) => {
  try {
    const requesterEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    if (!requesterEmail) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const requester = await findAccountByEmail(requesterEmail)
    if (!requester) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const isSuper = await isSuperAdminEmail(requesterEmail)

    let user = await User.findById(req.params.id)
    if (!user) {
      user = await Admin.findById(req.params.id)
    }
    if (!user) {
      user = await SuperAdmin.findById(req.params.id)
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const targetRole = user.role || 'user'
    if (!isSuper) {
      if (targetRole === 'admin' || targetRole === 'super admin') {
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
