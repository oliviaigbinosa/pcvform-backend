import mongoose from 'mongoose'

const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: String, required: true },
})

const leaveRequestSchema = new mongoose.Schema({
  employeeName: { type: String, required: true },
  departmentManager: { type: String },
  department: { type: String, required: true },
  leaveType: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  reason: { type: String, required: true },
  attachments: { type: [attachmentSchema], default: [] },
  submittedBy: { type: String, required: true },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('LeaveRequest', leaveRequestSchema)
