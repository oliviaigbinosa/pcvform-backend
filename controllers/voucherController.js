import Voucher from '../models/Voucher.js'

export const getVouchers = async (_req, res) => {
  try {
    const vouchers = await Voucher.find().sort({ createdAt: -1 })
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
