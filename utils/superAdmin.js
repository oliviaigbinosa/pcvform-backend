import Admin from '../models/Admin.js'
import User from '../models/User.js'
import SuperAdmin from '../models/SuperAdmin.js'

export const FINANCE_EMAIL = 'finance@getpayedmail.com'

export async function findAccountByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return null

  const [admin, user, superAdmin] = await Promise.all([
    Admin.findOne({ email: normalized }),
    User.findOne({ email: normalized }),
    SuperAdmin.findOne({ email: normalized }),
  ])

  return superAdmin || admin || user
}

export async function isSuperAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false

  const [admin, user, superAdmin] = await Promise.all([
    Admin.findOne({ email: normalized }),
    User.findOne({ email: normalized }),
    SuperAdmin.findOne({ email: normalized }),
  ])

  return (
    Boolean(superAdmin) ||
    admin?.role === 'super admin' ||
    user?.role === 'super admin'
  )
}

export async function getAllSuperAdminEmails() {
  const emails = new Set()

  const superAdmins = await SuperAdmin.find({}, 'email').lean()
  superAdmins.forEach((entry) => emails.add(entry.email.toLowerCase()))

  const legacySupers = await Admin.find({ role: 'super admin' }, 'email').lean()
  legacySupers.forEach((entry) => emails.add(entry.email.toLowerCase()))

  const envEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  if (envEmail) emails.add(envEmail)

  return [...emails]
}

export function isFinanceRoutedVoucher(voucher) {
  const finance = FINANCE_EMAIL
  const to = String(voucher?.to || '').trim().toLowerCase()
  const cc = String(voucher?.cc || '').trim().toLowerCase()
  return to === finance || cc === finance
}
