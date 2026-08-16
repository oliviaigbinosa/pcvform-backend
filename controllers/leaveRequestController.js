import LeaveRequest from '../models/LeaveRequest.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'
import { sendLeaveRequestEmail, sendLeaveStatusEmail } from '../controllers/emailController.js'

export const getLeaveRequests = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || req.headers['x-user-email'] || '').trim().toLowerCase()
    const [admin, user] = await Promise.all([
      email ? Admin.findOne({ email }) : null,
      email ? User.findOne({ email }) : null,
    ])
    const requester = admin || user
    const canViewAll = requester?.email?.toLowerCase() === 'chinenye.onyia@getpayedmail.com'
    const safeEmail = email ? email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
    const managerQuery = email ? { departmentManager: { $regex: new RegExp('^' + safeEmail + '$', 'i') } } : null

    let query = { _id: { $in: [] } }
    if (canViewAll) {
      query = {}
    } else if (admin) {
      const users = await User.find({ createdBy: email }, 'email')
      const emails = users.map((user) => user.email)
      emails.push(email)
      query = { $or: [{ submittedBy: { $in: emails } }, managerQuery] }
    } else if (email) {
      query = { $or: [{ submittedBy: { $regex: new RegExp('^' + safeEmail + '$', 'i') } }, managerQuery] }
    }

    const [leaves, admins] = await Promise.all([
      LeaveRequest.find(query).sort({ createdAt: -1 }),
      Admin.find({}, 'email').lean(),
    ])
    const adminEmails = new Set(admins.map((a) => a.email.toLowerCase()))
    return res.json(leaves.map((leave) => {
      const obj = { ...leave.toObject(), id: leave._id.toString() }
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
        await sendLeaveStatusEmail(leave.toObject(), leave.status)
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
