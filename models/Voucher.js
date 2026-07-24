import mongoose from 'mongoose'

const supportingDocSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: String, required: true },
})

const voucherSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  submittedBy: { type: String, required: true },
  submissionDate: { type: String, required: true },
  payee: { type: String, required: true },
  department: { type: String, required: true },
  amount: { type: Number, required: true },
  amountWords: { type: String, required: true },
  purpose: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  cc: { type: String },
  subject: { type: String, required: true },
  supportingDocs: { type: [supportingDocSchema], default: [] },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('Voucher', voucherSchema)
