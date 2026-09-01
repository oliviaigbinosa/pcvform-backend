import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import Admin from '../models/Admin.js'
import User from '../models/User.js'
import SuperAdmin from '../models/SuperAdmin.js'
import { FINANCE_MANAGER_EMAIL } from '../utils/superAdmin.js'
import { sendMail } from './emailController.js'
import { generateToken } from '../middleware/auth.js'

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const [admin, superAdmin, user] = await Promise.all([
      Admin.findOne({ email: normalizedEmail }),
      SuperAdmin.findOne({ email: normalizedEmail }),
      User.findOne({ email: normalizedEmail })
    ])

    const isFinanceManager = normalizedEmail === FINANCE_MANAGER_EMAIL

    // Check SuperAdmin first (highest priority)
    if (superAdmin) {
      const valid = await bcrypt.compare(password, superAdmin.password)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      const role = isFinanceManager ? 'super admin' : (superAdmin.role || 'super admin')
      const token = generateToken({ email: superAdmin.email, role, department: superAdmin.department || '' })
      return res.json({ email: superAdmin.email, role, department: superAdmin.department || '', token })
    }

    // Check Admin (regular admins only, not super admins)
    if (admin && admin.role !== 'super admin') {
      const valid = await bcrypt.compare(password, admin.password)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      const role = isFinanceManager ? 'super admin' : (admin.role || 'admin')
      const token = generateToken({ email: admin.email, role, department: admin.department || '' })
      return res.json({ email: admin.email, role, department: admin.department || '', token })
    }

    // Check User
    if (user) {
      const valid = await bcrypt.compare(password, user.password)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      // Finance manager always gets admin-level access
      const role = isFinanceManager ? 'super admin' : (user.role || 'user')
      const token = generateToken({ email: user.email, role, department: user.department || '' })
      return res.json({
        email: user.email,
        role,
        department: user.department || '',
        createdBy: user.createdBy || '',
        token,
      })
    }

    return res.status(401).json({ error: 'Invalid email or password' })
  } catch (error) {
    console.error('Login failed', error)
    return res.status(500).json({ error: 'Login failed' })
  }
}

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const email = req.user.email
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const [admin, superAdmin, user] = await Promise.all([
      Admin.findOne({ email: normalizedEmail }),
      SuperAdmin.findOne({ email: normalizedEmail }),
      User.findOne({ email: normalizedEmail })
    ])

    // Check SuperAdmin first
    if (superAdmin) {
      const valid = await bcrypt.compare(currentPassword, superAdmin.password)
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }

      superAdmin.password = await bcrypt.hash(newPassword, 10)
      await superAdmin.save()
      return res.json({ ok: true })
    }

    // Check Admin (regular admins only, not super admins)
    if (admin && admin.role !== 'super admin') {
      const valid = await bcrypt.compare(currentPassword, admin.password)
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }

      admin.password = await bcrypt.hash(newPassword, 10)
      await admin.save()
      return res.json({ ok: true })
    }

    // Check User
    if (user) {
      const valid = await bcrypt.compare(currentPassword, user.password)
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }

      user.password = await bcrypt.hash(newPassword, 10)
      await user.save()
      return res.json({ ok: true })
    }

    return res.status(404).json({ error: 'Account not found' })
  } catch (error) {
    console.error('Change password failed', error)
    return res.status(500).json({ error: 'Failed to update password' })
  }
}

export const getMe = async (req, res) => {
  try {
    const email = req.user.email
    if (!email) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const [admin, superAdmin, user] = await Promise.all([
      Admin.findOne({ email }),
      SuperAdmin.findOne({ email }),
      User.findOne({ email })
    ])

    const isFinanceManager = email === FINANCE_MANAGER_EMAIL

    // Check SuperAdmin first
    if (superAdmin) {
      const role = isFinanceManager ? 'super admin' : (superAdmin.role || 'super admin')
      return res.json({ email: superAdmin.email, role, department: superAdmin.department || '' })
    }

    // Check Admin (regular admins only, not super admins)
    if (admin && admin.role !== 'super admin') {
      const role = isFinanceManager ? 'super admin' : (admin.role || 'admin')
      return res.json({ email: admin.email, role, department: admin.department || '' })
    }

    // Check User
    if (user) {
      const role = isFinanceManager ? 'super admin' : (user.role || 'user')
      return res.json({ email: user.email, role, department: user.department || '', createdBy: user.createdBy || '' })
    }

    return res.status(404).json({ error: 'User not found' })
  } catch (error) {
    console.error('Get me failed', error)
    return res.status(500).json({ error: 'Failed to fetch user' })
  }
}

const RESET_SECRET = process.env.RESET_TOKEN_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://pettycashvoucher.netlify.app'

if (!RESET_SECRET) {
  throw new Error('RESET_TOKEN_SECRET must be set in environment variables')
}

function createResetToken(email) {
  const expires = Date.now() + 30 * 60 * 1000
  const payload = `${email}:${expires}`
  const signature = crypto.createHmac('sha256', RESET_SECRET).update(payload).digest('hex')
  return `${payload}:${signature}`
}

function verifyResetToken(token) {
  const parts = String(token).split(':')
  if (parts.length !== 3) return null
  const [email, expires, signature] = parts
  const payload = `${email}:${expires}`
  const expected = crypto.createHmac('sha256', RESET_SECRET).update(payload).digest('hex')
  if (signature !== expected) return null
  if (Date.now() > parseInt(expires, 10)) return null
  return { email: email.toLowerCase(), expires: parseInt(expires, 10) }
}

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const [admin, superAdmin, user] = await Promise.all([
      Admin.findOne({ email: normalizedEmail }),
      SuperAdmin.findOne({ email: normalizedEmail }),
      User.findOne({ email: normalizedEmail })
    ])
    if (!admin && !superAdmin && !user) {
      return res.status(404).json({ error: 'No account found with that email address' })
    }

    const token = createResetToken(normalizedEmail)
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`
    const fromEmail = process.env.RESEND_FROM
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    await sendMail({
      from: fromEmail,
      to: normalizedEmail,
      subject: 'Reset your Petty Cash Voucher password',
      text: `Hello,

You requested a password reset for your Petty Cash Voucher account.

Click the link below to set a new password:
${resetUrl}

This link will expire in 30 minutes. If you did not request this reset, please ignore this email.`,
    })

    return res.json({ ok: true })
  } catch (error) {
    console.error('Forgot password failed', error)
    return res.status(500).json({ error: 'Failed to send reset email' })
  }
}

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Token, new password, and confirmation are required' })
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' })
    }

    const decoded = verifyResetToken(token)
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired reset token' })
    }

    const normalizedEmail = decoded.email
    const [admin, superAdmin, user] = await Promise.all([
      Admin.findOne({ email: normalizedEmail }),
      SuperAdmin.findOne({ email: normalizedEmail }),
      User.findOne({ email: normalizedEmail })
    ])
    if (!admin && !superAdmin && !user) {
      return res.status(404).json({ error: 'Account no longer exists' })
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    if (superAdmin) {
      superAdmin.password = hashed
      await superAdmin.save()
    }
    if (admin && admin.role !== 'super admin') {
      admin.password = hashed
      await admin.save()
    }
    if (user) {
      user.password = hashed
      await user.save()
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error('Reset password failed', error)
    return res.status(500).json({ error: 'Failed to reset password' })
  }
}
