import LeaveRequest from '../models/LeaveRequest.js'
import Admin from '../models/Admin.js'
import User from '../models/User.js'
import { sendLeaveRequestEmail } from '../controllers/emailController.js'

export const getLeaveRequests = async (req, res) => {
  try {
    const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase()
    const admin = await Admin.findOne({ email })

    let query = {}
    if (admin && admin.role !== 'super admin') {
      const users = await User.find({ createdBy: email }, 'email')
      const emails = users.map((user) => user.email)
      if (emails.length > 0) {
        query = { submittedBy: { $in: emails } }
      } else {
        query = { _id: { $in: [] } }
      }
    }

    const leaves = await LeaveRequest.find(query).sort({ createdAt: -1 })
    return res.json(leaves.map((leave) => ({ ...leave.toObject(), id: leave._id.toString() })))
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

    const leaveObj = { ...leave.toObject(), id: leave._id.toString() }

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
