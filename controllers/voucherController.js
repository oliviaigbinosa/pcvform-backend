import Voucher from '../models/Voucher.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'
import SuperAdmin from '../models/SuperAdmin.js'
import {
  findAccountByEmail,
  getAllSuperAdminEmails,
  isFinanceRoutedVoucher,
  isSuperAdminEmail,
} from '../utils/superAdmin.js'
import { sendApprovedCcEmailInternal } from './emailController.js'

async function enrichVoucher(voucher) {
  const admin = await Admin.findOne({
    email: String(voucher.submittedBy || voucher.from).toLowerCase(),
  }).lean()
  const superAdmin = await SuperAdmin.findOne({
    email: String(voucher.submittedBy || voucher.from).toLowerCase(),
  }).lean()
  return {
    ...voucher,
    submitterIsAdmin: Boolean(admin || superAdmin),
  }
}

export const getVouchers = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const account = await findAccountByEmail(email)
    if (!account) {
      return res.status(404).json({ error: 'User not found' })
    }

    const isSuper = await isSuperAdminEmail(email)
    let query

    if (isSuper) {
      query = {}
    } else if (account.constructor.modelName === 'Admin') {
      const users = await User.find({ createdBy: email }, 'email')
      const emails = users.map((u) => u.email)
      if (emails.length > 0) {
        query = { from: { $in: emails } }
      } else {
        query = { _id: { $in: [] } }
      }
    } else {
      query = {
        $or: [
          { from: email },
          { submittedBy: email },
          { to: email },
          { cc: email },
          { financeSuperAdminRecipients: email },
        ],
      }
    }

    const vouchers = await Voucher.find(query).sort({ createdAt: -1 }).lean()
    const result = await Promise.all(vouchers.map((voucher) => enrichVoucher(voucher)))
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

    const payload = { ...req.body }
    if (isFinanceRoutedVoucher(payload)) {
      payload.financeSuperAdminRecipients = await getAllSuperAdminEmails()
    }

    const voucher = await Voucher.create(payload)
    const result = await enrichVoucher(voucher.toObject())
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

    const updater = String(req.headers['x-user-email'] || '').trim().toLowerCase()
    if (!updater) {
      return res.status(403).json({ error: 'User email required' })
    }

    if (status === 'Processed' || status === 'Rejected') {
      const isSuper = await isSuperAdminEmail(updater)
      if (!isSuper) {
        return res.status(403).json({ error: 'Only super admins can process vouchers' })
      }
    }

    const update = { status }
    if (['Approved', 'Declined', 'Processed', 'Rejected'].includes(status)) {
      update.processedBy = updater
    }

    const voucher = await Voucher.findOneAndUpdate({ id }, update, { new: true })
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' })
    }

    if (status === 'Approved' && voucher.cc) {
      try {
        await sendApprovedCcEmailInternal(voucher.toObject())
      } catch (emailError) {
        console.error('Failed to send approved CC email', emailError)
      }
    }

    const result = await enrichVoucher(voucher.toObject())
    return res.json(result)
  } catch (error) {
    console.error('Failed to update voucher status', error)
    return res.status(500).json({ error: 'Failed to update voucher status' })
  }
}
