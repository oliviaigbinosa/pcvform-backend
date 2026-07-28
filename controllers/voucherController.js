import Voucher from '../models/Voucher.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'

export const getVouchers = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    const admin = await Admin.findOne({ email })

    let query = {}
    if (admin && admin.role !== 'super admin') {
      const users = await User.find({ createdBy: email }, 'email')
      const emails = users.map((user) => user.email)
      if (emails.length > 0) {
        query = { from: { $in: emails } }
      } else {
        query = { _id: { $in: [] } }
      }
    }

    const vouchers = await Voucher.find(query).sort({ createdAt: -1 })
    return res.json(vouchers)
  } catch (error) {
    console.error('Failed to list vouchers', error)
    return res.status(500).json({ error: 'Failed to list vouchers' })
  }
}

export const createVoucher = async (req, res) => {
  try {
    const { id, submittedBy, payee, department, amount, submissionDate } = req.body
    if (!id || !submittedBy || !payee || !department || amount == null || !submissionDate) {
      return res.status(400).json({ error: 'Missing required voucher fields' })
    }

    const existing = await Voucher.findOne({ id })
    if (existing) {
      return res.status(409).json({ error: 'Voucher with this ID already exists' })
    }

    const voucher = await Voucher.create(req.body)
    return res.status(201).json(voucher)
  } catch (error) {
    console.error('Failed to create voucher', error)
    return res.status(500).json({ error: 'Failed to create voucher' })
  }
}

export const updateVoucherStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!status) {
      return res.status(400).json({ error: 'Status is required' })
    }

    if (status === 'Processed') {
      const updater = String(req.headers['x-user-email'] || '').trim().toLowerCase()
      if (!updater) {
        return res.status(403).json({ error: 'Super admin email required' })
      }
      const admin = await Admin.findOne({ email: updater, role: 'super admin' })
      if (!admin) {
        return res.status(403).json({ error: 'Only super admins can process vouchers' })
      }
    }

    const voucher = await Voucher.findOneAndUpdate(
      { id },
      { status },
      { new: true },
    )
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' })
    }

    return res.json(voucher)
  } catch (error) {
    console.error('Failed to update voucher status', error)
    return res.status(500).json({ error: 'Failed to update voucher status' })
  }
}
