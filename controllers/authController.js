import bcrypt from 'bcryptjs'
import Admin from '../models/Admin.js'
import User from '../models/User.js'

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = await Admin.findOne({ email: normalizedEmail })

    if (admin) {
      const valid = await bcrypt.compare(password, admin.password)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      return res.json({ email: admin.email, role: admin.role || 'admin' })
    }

    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    return res.json({ email: user.email, role: 'user' })
  } catch (error) {
    console.error('Login failed', error)
    return res.status(500).json({ error: 'Login failed' })
  }
}

export const changePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, current password, and new password are required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = await Admin.findOne({ email: normalizedEmail })

    if (admin) {
      const valid = await bcrypt.compare(currentPassword, admin.password)
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }

      admin.password = await bcrypt.hash(newPassword, 10)
      await admin.save()
      return res.json({ ok: true })
    }

    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()
    return res.json({ ok: true })
  } catch (error) {
    console.error('Change password failed', error)
    return res.status(500).json({ error: 'Failed to update password' })
  }
}
