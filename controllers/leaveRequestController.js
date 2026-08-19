import LeaveRequest from '../models/LeaveRequest.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'
import SuperAdmin from '../models/SuperAdmin.js'
import { sendLeaveRequestEmail, sendLeaveStatusEmail } from '../controllers/emailController.js'
import { FINANCE_MANAGER_EMAIL } from '../utils/superAdmin.js'

export const getLeaveRequests = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || req.headers['x-user-email'] || '').trim().toLowerCase()
    const [admin, user, superAdmin] = await Promise.all([
      email ? Admin.findOne({ email }).lean() : null,
      email ? User.findOne({ email }).lean() : null,
      email ? SuperAdmin.findOne({ email }).lean() : null,
    ])
    const requester = admin || user || superAdmin
    const canViewAll = requester?.email?.toLowerCase() === 'chinenye.onyia@getpayedmail.com'
    const isFinanceManager = requester?.email?.toLowerCase() === FINANCE_MANAGER_EMAIL
    const safeEmail = email ? email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
    const managerQuery = email ? { departmentManager: { $regex: new RegExp('^' + safeEmail + '$', 'i') } } : null

    let query = { _id: { $in: [] } }
    if (canViewAll) {
      query = {}
    } else if (isFinanceManager) {
      const financeUsers = await User.find({
        department: { $regex: new RegExp('^finance$', 'i') },
      }, 'email').lean()
      const financeAdmins = await Admin.find({
        department: { $regex: new RegExp('^finance$', 'i') },
      }, 'email').lean()
      const financeSuperAdmins = await SuperAdmin.find({
        department: { $regex: new RegExp('^finance$', 'i') },
      }, 'email').lean()
      const financeEmails = new Set([
        ...financeUsers.map((u) => u.email.toLowerCase()),
        ...financeAdmins.map((a) => a.email.toLowerCase()),
        ...financeSuperAdmins.map((s) => s.email.toLowerCase()),
        email,
      ])
      const orClauses = []
      if (financeEmails.size > 0) {
        orClauses.push({ submittedBy: { $in: [...financeEmails] } })
      }
      if (managerQuery) orClauses.push(managerQuery)
      query = orClauses.length > 0 ? { $or: orClauses } : { _id: { $in: [] } }
    } else if (superAdmin) {
      const orClauses = [{ submittedBy: { $regex: new RegExp('^' + safeEmail + '$', 'i') } }]
      query = { $or: orClauses }
    } else if (admin) {
      const users = await User.find({ createdBy: email }, 'email').lean()
      const userEmails = users.map((u) => u.email)
      userEmails.push(email)
      const orClauses = [{ submittedBy: { $in: userEmails } }]
      if (managerQuery) orClauses.push(managerQuery)
      query = { $or: orClauses }
    } else if (email) {
      const orClauses = [{ submittedBy: { $regex: new RegExp('^' + safeEmail + '$', 'i') } }]
      if (managerQuery) orClauses.push(managerQuery)
      query = { $or: orClauses }
    }

    const leavesPromise = LeaveRequest.find(query).sort({ createdAt: -1 }).lean()
    const [leaves, adminDocs, superAdminDocs] = await Promise.all([
      leavesPromise,
      Admin.find({}, 'email').lean(),
      SuperAdmin.find({}, 'email').lean(),
    ])
    const adminEmails = new Set([
      ...adminDocs.map((a) => a.email.toLowerCase()),
      ...superAdminDocs.map((s) => s.email.toLowerCase()),
    ])
    return res.json(leaves.map((leave) => {
      const obj = { ...leave, id: leave._id.toString() }
      obj.submitterIsAdmin = adminEmails.has(String(leave.submittedBy || '').toLowerCase())
      return obj
    }))
  } catch (error) {
    console.error('Failed to list leave requests', error)
    return res.status(500).json({ error: 'Failed to list leave requests' })
  }
}

export const createLeaveRequest = async (req, res) => {
  try {
    const { employeeName, departmentManager, department, leaveType, startDate, endDate, reason, attachments, submittedBy } = req.body
    if (!employeeName || !department || !leaveType || !startDate || !endDate || !reason || !submittedBy) {
      return res.status(400).json({ error: 'Missing required leave request fields' })
    }

    const leave = await LeaveRequest.create({
      employeeName,
      departmentManager,
      department,
      leaveType,
      startDate,
      endDate,
      reason,
      attachments: attachments || [],
      submittedBy,
    })

    const admin = await Admin.findOne({
      email: String(submittedBy || '').toLowerCase(),
    }).lean()
    const leaveObj = { ...leave.toObject(), id: leave._id.toString() }
    leaveObj.submitterIsAdmin = Boolean(admin)

    if (departmentManager) {
      try {
        await sendLeaveRequestEmail(leaveObj)
      } catch (emailError) {
        console.error('Failed to send leave request email', emailError)
        return res.status(201).json({ ...leaveObj, emailSent: false, emailError: emailError.message })
      }
    }

    return res.status(201).json({ ...leaveObj, emailSent: true })
  } catch (error) {
    console.error('Failed to create leave request', error)
    return res.status(500).json({ error: 'Failed to create leave request' })
  }
}

export const updateLeaveRequestStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!status) {
      return res.status(400).json({ error: 'Status is required' })
    }

    const leave = await LeaveRequest.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    )
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found' })
    }

    const admin = await Admin.findOne({
      email: String(leave.submittedBy || '').toLowerCase(),
    }).lean()

    const normalized = String(status).toLowerCase()
    if (normalized === 'approved' || normalized === 'declined') {
      try {
        await sendLeaveStatusEmail(leave.toObject(), status)
      } catch (emailError) {
        console.error('Failed to send leave status email', emailError)
      }
    }

    const result = { ...leave.toObject(), id: leave._id.toString() }
    result.submitterIsAdmin = Boolean(admin)
    return res.json(result)
  } catch (error) {
    console.error('Failed to update leave request status', error)
    return res.status(500).json({ error: 'Failed to update leave request status' })
  }
}
