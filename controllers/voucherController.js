import Voucher from '../models/Voucher.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'

export const getVouchers = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const [admin, user] = await Promise.all([
      Admin.findOne({ email }),
      User.findOne({ email }),
    ])

    let query
    if (admin) {
      if (admin.role === 'super admin') {
        query = {}
      } else {
        const users = await User.find({ createdBy: email }, 'email')
        const emails = users.map((u) => u.email)
        if (emails.length > 0) {
          query = { from: { $in: emails } }
        } else {
          query = { _id: { $in: [] } }
        }
      }
    } else if (user) {
      query = {
        $or: [
          { from: email },
          { submittedBy: email },
          { to: email },
          { cc: email },
        ],
      }
    } else {
      return res.status(404).json({ error: 'User not found' })
    }

    const [vouchers, admins] = await Promise.all([
      Voucher.find(query).sort({ createdAt: -1 }).lean(),
      Admin.find({}, 'email').lean(),
    ])
    const adminEmails = new Set(admins.map((a) => a.email.toLowerCase()))
    const result = vouchers.map((voucher) => ({
      ...voucher,
      submitterIsAdmin: adminEmails.has(String(voucher.submittedBy || voucher.from).toLowerCase()),
    }))
    return res.json(result)
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
    const admin = await Admin.findOne({
      email: String(req.body.submittedBy || req.body.from).toLowerCase(),
    }).lean()
    const result = voucher.toObject()
    result.submitterIsAdmin = Boolean(admin)
    return res.status(201).json(result)
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

    const admin = await Admin.findOne({
      email: String(voucher.submittedBy || voucher.from).toLowerCase(),
    }).lean()
    const result = voucher.toObject()
    result.submitterIsAdmin = Boolean(admin)
    return res.json(result)
  } catch (error) {
    console.error('Failed to update voucher status', error)
    return res.status(500).json({ error: 'Failed to update voucher status' })
  }
}
