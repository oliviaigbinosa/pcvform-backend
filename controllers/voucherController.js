import Voucher from '../models/Voucher.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'
import SuperAdmin from '../models/SuperAdmin.js'
import {
  findAccountByEmail,
  getAllSuperAdminEmails,
  isFinanceRoutedVoucher,
  isSuperAdminEmail,
  FINANCE_EMAIL,
  FINANCE_MANAGER_EMAIL,
} from '../utils/superAdmin.js'
import {
  sendApprovedCcEmailInternal,
  sendVoucherDeclinedEmailInternal,
  sendVoucherProcessedEmailInternal,
  sendVoucherRejectedEmailInternal,
} from './emailController.js'

const FINANCE_EMAIL_LOWER = FINANCE_EMAIL.toLowerCase()

async function generateNextVoucherId(department) {
  const deptSlug = String(department || '').trim().toUpperCase().replace(/\s+/g, '-') || 'DEPT'
  const currentYear = new Date().getFullYear()
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0')
  const prefix = `PCV/${deptSlug}/${currentYear}/${currentMonth}/`

  // Find the highest existing serial number for this department/year/month combination
  const lastVoucher = await Voucher.findOne({
    id: new RegExp(`^${prefix}`)
  }).sort({ id: -1 }).lean()

  let nextSerial = 1
  if (lastVoucher && lastVoucher.id) {
    const lastSerial = lastVoucher.id.split('/').pop()
    const lastSerialNum = parseInt(lastSerial, 10)
    if (!isNaN(lastSerialNum)) {
      nextSerial = lastSerialNum + 1
    }
  }

  const serial = String(nextSerial).padStart(3, '0')
  return `${prefix}${serial}`
}

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
      // Super admins should see all vouchers from all users, admins, super admins, and finance manager
      query = {}
    } else if (account.constructor.modelName === 'Admin') {
      const users = await User.find({ createdBy: email }, 'email')
      const emails = users.map((u) => u.email)
      const orClauses = []
      if (emails.length > 0) {
        orClauses.push({ from: { $in: emails } })
      }
      orClauses.push({ from: email })
      orClauses.push({ submittedBy: email })
      orClauses.push({ to: email })
      orClauses.push({ cc: email })
      orClauses.push({ financeSuperAdminRecipients: email })
      query = { $or: orClauses }
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

    // Generate correct voucher serial number using the shared function
    const correctVoucherId = await generateNextVoucherId(department)

    // Use the backend-generated voucher ID instead of the frontend one
    const payload = { ...req.body, id: correctVoucherId }

    // Check if this ID already exists (double-check with atomic constraint)
    const existing = await Voucher.findOne({ id: correctVoucherId })
    if (existing) {
      return res.status(409).json({ error: 'Voucher with this ID already exists' })
    }

    if (isFinanceRoutedVoucher(payload)) {
      const sender = String(payload.submittedBy || payload.from || '').trim().toLowerCase()
      const allSupers = await getAllSuperAdminEmails()
      if (sender === FINANCE_MANAGER_EMAIL.toLowerCase()) {
        payload.financeSuperAdminRecipients = [FINANCE_MANAGER_EMAIL.toLowerCase()]
      } else {
        const others = allSupers.filter((e) => String(e).toLowerCase() !== FINANCE_MANAGER_EMAIL.toLowerCase())
        if (!others.includes(FINANCE_MANAGER_EMAIL.toLowerCase())) {
          others.push(FINANCE_MANAGER_EMAIL.toLowerCase())
        }
        payload.financeSuperAdminRecipients = others
      }
    }

    const voucher = await Voucher.create(payload)
    const result = await enrichVoucher(voucher.toObject())
    return res.status(201).json(result)
  } catch (error) {
    console.error('Failed to create voucher', error)
    if (error.code === 11000) {
      // MongoDB duplicate key error
      return res.status(409).json({ error: 'Voucher with this ID already exists' })
    }
    return res.status(500).json({ error: 'Failed to create voucher' })
  }
}

export const getNextVoucherNumber = async (req, res) => {
  try {
    const { department } = req.query
    if (!department) {
      return res.status(400).json({ error: 'Department is required' })
    }

    const nextVoucherId = await generateNextVoucherId(department)
    return res.json({ nextVoucherId })
  } catch (error) {
    console.error('Failed to get next voucher number', error)
    return res.status(500).json({ error: 'Failed to get next voucher number' })
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
    if (status === 'Approved') {
      update.approvedBy = updater
    } else if (status === 'Declined') {
      update.declinedBy = updater
    } else if (status === 'Rejected') {
      update.rejectedBy = updater
    } else if (status === 'Processed') {
      update.processedBy = updater
    }

    const voucher = await Voucher.findOneAndUpdate({ id }, update, { new: true })
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' })
    }

    const voucherObj = voucher.toObject()
    try {
      if (status === 'Approved') {
        await sendApprovedCcEmailInternal(voucherObj)
      } else if (status === 'Declined') {
        await sendVoucherDeclinedEmailInternal(voucherObj)
      } else if (status === 'Processed') {
        await sendVoucherProcessedEmailInternal(voucherObj)
      } else if (status === 'Rejected') {
        await sendVoucherRejectedEmailInternal(voucherObj)
      }
    } catch (emailError) {
      console.error(`Failed to send ${status} notification email for voucher ${id}`, emailError)
    }

    const result = await enrichVoucher(voucherObj)
    return res.json(result)
  } catch (error) {
    console.error('Failed to update voucher status', error)
    return res.status(500).json({ error: 'Failed to update voucher status' })
  }
}
