import User from '../models/User.js'
import Admin from '../models/Admin.js'
import SuperAdmin from '../models/SuperAdmin.js'
import {
  FINANCE_EMAIL,
  FINANCE_MANAGER_EMAIL,
  getAllSuperAdminEmails,
  isFinanceRoutedVoucher,
} from '../utils/superAdmin.js'

function isGetPayedMailEmail(email) {
  return /^[^\s@]+@getpayedmail\.com$/.test(email)
}

const resendTestMode = String(process.env.RESEND_FROM || '').toLowerCase().endsWith('@resend.dev')

function isAllowedRecipient(email) {
  return (
    isGetPayedMailEmail(email) ||
    (resendTestMode && /^[^\s@]+@resend\.dev$/.test(email))
  )
}

function getDisplayName(email) {
  const local = String(email || '').split('@')[0]
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (!parts.length) return ''
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
}

function formatAddress(email, name) {
  if (!email) return email
  if (String(email).toLowerCase().endsWith('@resend.dev')) return email
  const displayName = name || getDisplayName(email)
  return displayName ? `${displayName} <${email}>` : email
}

function formatDisplay(email) {
  if (!email) return email
  const name = getDisplayName(email)
  return `${name} <${email}>`
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildVoucherAttachments(supportingDocs) {
  const attachments = []
  const docLines = []
  if (Array.isArray(supportingDocs) && supportingDocs.length) {
    for (const doc of supportingDocs) {
      if (typeof doc === 'object' && doc?.data) {
        const match = doc.data.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const [, contentType, base64] = match
          attachments.push({
            filename: doc.name || 'attachment',
            content: Buffer.from(base64, 'base64'),
            contentType,
          })
        }
        docLines.push(`  • ${doc.name || 'attachment'}`)
      } else if (typeof doc === 'string') {
        docLines.push(`  • ${doc}`)
      }
    }
  }
  return {
    attachments,
    docs: docLines.length ? docLines.join('\n') : '  None',
  }
}

function buildStatusLines({ approvedBy, declinedBy, processedBy, status }) {
  const lines = []
  if (approvedBy) lines.push(`Approved by ${formatDisplay(approvedBy)}`)
  if (declinedBy && status === 'Declined') {
    lines.push(`Declined by ${formatDisplay(declinedBy)}`)
  }
  if (declinedBy && status === 'Rejected') {
    lines.push(`Rejected by ${formatDisplay(declinedBy)}`)
  }
  if (processedBy) lines.push(`Processed by ${formatDisplay(processedBy)}`)
  return lines.length ? `\n\n${lines.join('\n')}` : ''
}

function buildVoucherEmailText({
  heading,
  footer,
  voucherNo,
  submittedBy,
  from,
  to,
  cc,
  subject,
  payee,
  department,
  amount,
  amountWords,
  purpose,
  submissionDate,
  docs,
  approvedBy,
  declinedBy,
  processedBy,
  status,
  includeCc = true,
}) {
  const formattedAmount = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const ccLine = includeCc && cc ? `\nCC:               ${formatDisplay(cc)}` : ''

  return `${heading}\n${'═'.repeat(52)}\nVoucher No.:      ${voucherNo}\nCompany:          Getpayed Technology Solutions Ltd.\nSubmitted By:     ${submittedBy || from}\n\nEMAIL DETAILS\n${'─'.repeat(52)}\nFrom:             ${formatDisplay(from)}\nTo:               ${formatDisplay(to)}${ccLine}\nSubject:          ${subject}\n\nPAYEE INFORMATION\n${'─'.repeat(52)}\nPayee:            ${payee || ''}\nDepartment:       ${department || ''}\n\nAMOUNT & PURPOSE\n${'─'.repeat(52)}\nAmount (Figures): ₦${formattedAmount}${amountWords != null ? `\nAmount (Words):   ${amountWords || ''}` : ''}\n\nPurpose / Description:\n${purpose || ''}\n\nSUPPORTING DOCUMENTS\n${'─'.repeat(52)}\nSubmission Date:  ${submissionDate}\nAttached Files:\n${docs}\n\n${'═'.repeat(52)}\n${footer}${buildStatusLines({ approvedBy, declinedBy, processedBy, status })}`
}

async function getFinanceAwareRecipients(to, cc, from) {
  const recipients = new Set()
  const normalizedTo = String(to || '').trim().toLowerCase()
  const normalizedCc = String(cc || '').trim().toLowerCase()
  const normalizedFrom = String(from || '').trim().toLowerCase()

  if (normalizedTo) recipients.add(normalizedTo)
  if (normalizedCc) recipients.add(normalizedCc)

  // Special handling for finance manager submitting vouchers
  // When finance manager sends to finance@getpayedmail.com, send to all super admins
  if (normalizedTo === FINANCE_EMAIL && normalizedFrom === FINANCE_MANAGER_EMAIL) {
    const superAdminEmails = await getAllSuperAdminEmails()
    superAdminEmails.forEach((email) => recipients.add(email))
    return [...recipients]
  }

  const financeRouted =
    normalizedTo === FINANCE_EMAIL || normalizedCc === FINANCE_EMAIL

  if (financeRouted) {
    recipients.add(FINANCE_MANAGER_EMAIL)
    const superAdminEmails = await getAllSuperAdminEmails()
    superAdminEmails.forEach((email) => recipients.add(email))
  }

  return [...recipients]
}

async function getApprovedEmailRecipients(voucher) {
  const recipients = new Set()
  const from = String(voucher?.from || '').trim().toLowerCase()
  const cc = String(voucher?.cc || '').trim().toLowerCase()

  if (from) recipients.add(from)
  if (cc) recipients.add(cc)

  if (isFinanceRoutedVoucher(voucher)) {
    recipients.add(FINANCE_EMAIL)
    recipients.add(FINANCE_MANAGER_EMAIL)
    const superAdminEmails = await getAllSuperAdminEmails()
    superAdminEmails.forEach((email) => recipients.add(email))
  }

  return [...recipients]
}

async function getSubmitterNotificationRecipients(voucher) {
  const recipients = new Set()
  const from = String(voucher?.from || '').trim().toLowerCase()
  const submittedBy = String(voucher?.submittedBy || '').trim().toLowerCase()

  if (from) recipients.add(from)
  if (submittedBy) recipients.add(submittedBy)

  return [...recipients]
}

async function getStatusNotificationRecipients(voucher, status) {
  const recipients = new Set()

  const submitterRecipients = await getSubmitterNotificationRecipients(voucher)
  submitterRecipients.forEach((email) => recipients.add(email))

  if (status === 'Approved') {
    const approvedRecipients = await getApprovedEmailRecipients(voucher)
    approvedRecipients.forEach((email) => recipients.add(email))
  }

  if (isFinanceRoutedVoucher(voucher)) {
    recipients.add(FINANCE_MANAGER_EMAIL)
    const superAdminEmails = await getAllSuperAdminEmails()
    superAdminEmails.forEach((email) => recipients.add(email))
  }

  return [...recipients]
}

async function sendVoucherStatusEmailInternal(voucher, statusLabel) {
  const fromEmail = process.env.RESEND_FROM
  if (!fromEmail) {
    throw new Error('FROM email is not configured')
  }

  const { attachments, docs } = buildVoucherAttachments(voucher.supportingDocs)

  const headingMap = {
    'Approved': 'PETTY CASH VOUCHER APPROVED',
    'Declined': 'PETTY CASH VOUCHER DECLINED',
    'Processed': 'PETTY CASH VOUCHER PROCESSED',
    'Rejected': 'PETTY CASH VOUCHER REJECTED',
  }
  const footerMap = {
    'Approved': 'This voucher has been approved.',
    'Declined': 'This voucher has been declined.',
    'Processed': 'This voucher has been processed.',
    'Rejected': 'This voucher has been rejected.',
  }
  const subjectPrefixMap = {
    'Approved': 'Approved:',
    'Declined': 'Declined:',
    'Processed': 'Processed:',
    'Rejected': 'Rejected:',
  }

  const heading = headingMap[statusLabel] || 'PETTY CASH VOUCHER STATUS UPDATE'
  const footer = footerMap[statusLabel] || 'This voucher has a status update.'
  const subjectPrefix = subjectPrefixMap[statusLabel] || 'Update:'

  const text = buildVoucherEmailText({
    heading,
    footer,
    voucherNo: voucher.id,
    submittedBy: voucher.submittedBy,
    from: voucher.from,
    to: voucher.to,
    cc: voucher.cc,
    subject: voucher.subject,
    payee: voucher.payee,
    department: voucher.department,
    amount: voucher.amount,
    amountWords: voucher.amountWords,
    purpose: voucher.purpose,
    submissionDate: voucher.submissionDate,
    docs,
    approvedBy: voucher.approvedBy,
    declinedBy: voucher.declinedBy,
    processedBy: voucher.processedBy,
    status: voucher.status,
    includeCc: true,
  })

  const displayName = getDisplayName(voucher.from)
  const recipientEmails = await getStatusNotificationRecipients(voucher, statusLabel)

  if (!recipientEmails.length) {
    throw new Error('No recipients for voucher status email')
  }

  return sendMail({
    from: formatAddress(fromEmail, displayName),
    replyTo: formatAddress(voucher.from, displayName),
    to: recipientEmails.map((email) => formatAddress(email)),
    subject: `${subjectPrefix} ${voucher.subject || `Petty Cash Voucher ${voucher.id}`}`,
    text,
    attachments,
  })
}

export async function sendApprovedCcEmailInternal(voucher) {
  return sendVoucherStatusEmailInternal(voucher, 'Approved')
}

export async function sendVoucherDeclinedEmailInternal(voucher) {
  return sendVoucherStatusEmailInternal(voucher, 'Declined')
}

export async function sendVoucherProcessedEmailInternal(voucher) {
  return sendVoucherStatusEmailInternal(voucher, 'Processed')
}

export async function sendVoucherRejectedEmailInternal(voucher) {
  return sendVoucherStatusEmailInternal(voucher, 'Rejected')
}

export async function sendMail(mailOptions) {
  if (process.env.RESEND_API_KEY) {
    const payload = {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      text: mailOptions.text,
    }

    if (mailOptions.cc) {
      payload.cc = mailOptions.cc
    }

    if (mailOptions.html) {
      payload.html = mailOptions.html
    }

    const fromEmail =
      String(mailOptions.from).match(/<([^>]+)>/)?.[1] || mailOptions.from
    const resendDomainVerified =
      String(process.env.RESEND_DOMAIN_VERIFIED || '').toLowerCase() === 'true'
    if (fromEmail.toLowerCase().endsWith('@resend.dev') || !resendDomainVerified) {
      const testTo = process.env.TEST_RECIPIENT || 'delivered@resend.dev'
      const rawTo = Array.isArray(mailOptions.to)
        ? mailOptions.to[0]
        : mailOptions.to
      const toEmail =
        (String(rawTo).match(/<([^>]+)>/) || [])[1] || String(rawTo)
      const normalizedTo = toEmail.trim().toLowerCase()
      const normalizedTest = testTo.trim().toLowerCase()
      payload.to = normalizedTo === normalizedTest ? toEmail.trim() : testTo
      if (payload.cc) payload.cc = testTo
    }

    if (mailOptions.replyTo) {
      const replyTo = String(mailOptions.replyTo)
      const match = replyTo.match(/<([^>]+)>/)
      payload.reply_to = match ? match[1] : replyTo
    }

    if (mailOptions.attachments && mailOptions.attachments.length) {
      payload.attachments = mailOptions.attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content)
          ? att.content.toString('base64')
          : att.content,
        content_type: att.contentType,
      }))
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.message || `Resend API error ${res.status}`)
    }

    return { messageId: data.id }
  }

  throw new Error('RESEND_API_KEY is not configured')
}

export const sendInviteEmail = async (req, res) => {
  try {
    const { to, password, from: senderEmail } = req.body
    const toEmail = String(to).trim().toLowerCase()

    if (!toEmail || !password) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!isAllowedRecipient(toEmail)) {
      return res.status(400).json({ error: 'To email must be a @getpayedmail.com or @resend.dev address' })
    }

    const existingUser =
      (await User.findOne({ email: toEmail })) ||
      (await Admin.findOne({ email: toEmail })) ||
      (await SuperAdmin.findOne({ email: toEmail }))
    if (!existingUser) {
      return res.status(400).json({ error: 'User not found in database. Invite failed' })
    }

    // Set from email to use @getpayedmail.com domain
    const fromEmail = process.env.RESEND_FROM
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    if (!process.env.RESEND_API_KEY && !isGetPayedMailEmail(fromEmail)) {
      return res.status(500).json({ error: 'FROM email must be a @getpayedmail.com address' })
    }

    const subject = 'Welcome to Getpayed Petty Cash Voucher System'
    const text = `You have been invited to join the Getpayed Petty Cash Voucher System.

Your login credentials:
Email: ${toEmail}
Password: ${password}

Click the link below to sign in:
https://pettycashvoucher.netlify.app/login

Please log in and change your password after your first login.

If you have any questions, please contact your administrator.`

    const displayName = senderEmail ? getDisplayName(senderEmail) : getDisplayName(fromEmail)

    const info = await sendMail({
      from: formatAddress(fromEmail, displayName),
      replyTo: senderEmail ? formatAddress(senderEmail) : undefined,
      to: formatAddress(toEmail),
      subject,
      text,
    })

    return res.json({ ok: true, messageId: info.messageId })
  } catch (error) {
    console.error('send-invite-email failed', error)
    return res.status(500).json({ error: 'Failed to send invite email' })
  }
}

export const sendApprovedCcEmail = async (req, res) => {
  try {
    const {
      cc,
      voucherNo,
      from,
      to,
      submittedBy,
      amount,
      payee,
      department,
      purpose,
      subject,
      submissionDate,
      supportingDocs,
      processedBy,
    } = req.body

    if (!cc || !voucherNo) {
      return res.status(400).json({ error: 'Missing required CC fields' })
    }

    if (!isAllowedRecipient(cc)) {
      return res.status(400).json({ error: 'CC email must be a @getpayedmail.com or @resend.dev address' })
    }

    const fromEmail = process.env.RESEND_FROM
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    if (!process.env.RESEND_API_KEY && !isGetPayedMailEmail(fromEmail)) {
      return res.status(500).json({ error: 'FROM email must be a @getpayedmail.com address' })
    }

    const info = await sendApprovedCcEmailInternal({
      id: voucherNo,
      from,
      to,
      cc,
      subject,
      submittedBy,
      amount,
      payee,
      department,
      purpose,
      submissionDate,
      supportingDocs,
      processedBy,
    })

    return res.json({ ok: true, messageId: info.messageId })
  } catch (error) {
    console.error('send-approved-cc-email failed', error)
    return res.status(500).json({ error: 'Failed to send approved CC email' })
  }
}

export const sendVoucherEmail = async (req, res) => {
  try {
    const {
      voucherNo,
      from,
      to,
      cc,
      subject,
      payee,
      department,
      amount,
      amountWords,
      purpose,
      submissionDate,
      supportingDocs,
      submittedBy,
      processedBy,
    } = req.body

    if (!to || !subject || !voucherNo) {
      return res.status(400).json({ error: 'Missing required email fields' })
    }

    const recipientEmails = await getFinanceAwareRecipients(to, cc, from)
    for (const recipient of recipientEmails) {
      if (!isAllowedRecipient(recipient)) {
        return res.status(400).json({ error: 'All recipient emails must be @getpayedmail.com or @resend.dev addresses' })
      }
    }

    const fromEmail = process.env.RESEND_FROM
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    if (!process.env.RESEND_API_KEY && !isGetPayedMailEmail(fromEmail)) {
      return res.status(500).json({ error: 'FROM email must be a @getpayedmail.com address' })
    }

    const { attachments, docs } = buildVoucherAttachments(supportingDocs)
    const text = buildVoucherEmailText({
      heading: 'PETTY CASH VOUCHER',
      footer: 'This voucher was generated by the Petty Cash Voucher System.',
      voucherNo,
      submittedBy,
      from,
      to,
      cc,
      subject,
      payee,
      department,
      amount,
      amountWords,
      purpose,
      submissionDate,
      docs,
      approvedBy: req.body.approvedBy,
      declinedBy: req.body.declinedBy,
      processedBy,
      status: req.body.status,
      includeCc: Boolean(cc),
    })

    const displayName = getDisplayName(from)
    const mailOptions = {
      from: formatAddress(fromEmail, displayName),
      replyTo: formatAddress(from, displayName),
      to: recipientEmails.map((email) => formatAddress(email)),
      subject: `PCV: ${subject}`,
      text,
      attachments,
    }

    const info = await sendMail(mailOptions)

    return res.json({ ok: true, messageId: info.messageId })
  } catch (error) {
    console.error('send-voucher-email failed', error)
    return res.status(500).json({ error: 'Failed to send voucher email' })
  }
}

export const sendLeaveRequestEmail = async (leave) => {
  const {
    employeeName,
    departmentManager,
    department,
    leaveType,
    startDate,
    endDate,
    reason,
    attachments,
    submittedBy,
  } = leave

  if (!departmentManager) {
    throw new Error('Department manager email is required to send leave request email')
  }

  const fromEmail = process.env.RESEND_FROM
  if (!fromEmail) {
    throw new Error('FROM email is not configured')
  }

  const emailAttachments = []
  const docLines = []
  if (Array.isArray(attachments) && attachments.length) {
    for (const doc of attachments) {
      if (typeof doc === 'object' && doc?.data) {
        const match = doc.data.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const [, contentType, base64] = match
          emailAttachments.push({
            filename: doc.name || 'attachment',
            content: Buffer.from(base64, 'base64'),
            contentType,
          })
        }
        docLines.push(`  • ${doc.name || 'attachment'}`)
      } else if (typeof doc === 'string') {
        docLines.push(`  • ${doc}`)
      }
    }
  }

  const docs = docLines.length ? docLines.join('\n') : '  None'

  const heading = 'LEAVE REQUEST SUBMITTED'

  const text = `${heading}\n${'═'.repeat(49)}\nEmployee Name:    ${employeeName || ''}\nDepartment:       ${department || ''}\nLeave Type:       ${leaveType || ''}\nStart Date:       ${startDate || ''}\nEnd Date:         ${endDate || ''}\n\nReason:\n${reason || ''}\n\nAttachments:\n${docs}\n\n\n\n\n\n\n\n\n\nSubmitted By:     ${submittedBy || ''}\n`

  const html = `<div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #333;">
  <p style="margin: 0 0 4px 0; font-weight: bold; font-size: 16px;">${escapeHtml(heading)}</p>
  <p style="margin: 0 0 8px 0; font-size: 16px;">${'═'.repeat(49)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Employee Name:</strong> ${escapeHtml(employeeName)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Department:</strong> ${escapeHtml(department)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Leave Type:</strong> ${escapeHtml(leaveType)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Start Date:</strong> ${escapeHtml(startDate)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">End Date:</strong> ${escapeHtml(endDate)}</p>
  <p style="margin: 16px 0 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Reason:</strong></p>
  <p style="margin: 4px 0; font-size: 16px; white-space: pre-wrap;">${escapeHtml(reason)}</p>
  <p style="margin: 16px 0 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Attachments:</strong></p>
  <div style="padding-left: 12px; font-size: 16px; white-space: pre-wrap;">${escapeHtml(docs)}</div>
  <p style="margin: 48px 0 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Submitted By:</strong> ${escapeHtml(submittedBy)}</p>
</div>`

  const info = await sendMail({
    from: formatAddress(fromEmail, getDisplayName(fromEmail)),
    to: formatAddress(departmentManager),
    subject: `New Leave Request`,
    text,
    html,
    attachments: emailAttachments,
  })

  return info
}

export const sendLeaveStatusEmail = async (leave, status) => {
  const { employeeName, submittedBy: email, department, leaveType, startDate, endDate, reason, attachments } = leave
  const actualStatus = String(status || leave.status || '').toLowerCase() || 'status update'

  if (!email) {
    throw new Error('Submitter email is required to send leave status email')
  }

  const fromEmail = process.env.RESEND_FROM
  if (!fromEmail) {
    throw new Error('FROM email is not configured')
  }

  const emailAttachments = []
  const docLines = []
  if (Array.isArray(attachments) && attachments.length) {
    for (const doc of attachments) {
      if (typeof doc === 'object' && doc?.data) {
        const match = doc.data.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const [, contentType, base64] = match
          emailAttachments.push({
            filename: doc.name || 'attachment',
            content: Buffer.from(base64, 'base64'),
            contentType,
          })
        }
        docLines.push(`  • ${doc.name || 'attachment'}`)
      } else if (typeof doc === 'string') {
        docLines.push(`  • ${doc}`)
      }
    }
  }

  const docs = docLines.length ? docLines.join('\n') : '  None'

  const statusCapitalized = actualStatus.charAt(0).toUpperCase() + actualStatus.slice(1)
  const heading = `LEAVE REQUEST ${statusCapitalized.toUpperCase()}`

  const text = `${heading}\n${'═'.repeat(49)}\nEmployee Name:    ${employeeName || ''}\nEmail:            ${email || ''}\nDepartment:       ${department || ''}\nLeave Type:       ${leaveType || ''}\nStart Date:       ${startDate || ''}\nEnd Date:         ${endDate || ''}\n\nReason:\n${reason || ''}\n\nAttachments:\n${docs}\n\n\n\n\n\n\n\nYour leave request has been ${actualStatus}\n`

  const html = `<div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #333;">
  <p style="margin: 0 0 4px 0; font-weight: bold; font-size: 16px;">${escapeHtml(heading)}</p>
  <p style="margin: 0 0 8px 0; font-size: 16px;">${'═'.repeat(49)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Employee Name:</strong> ${escapeHtml(employeeName)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Email:</strong> ${escapeHtml(email)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Department:</strong> ${escapeHtml(department)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Leave Type:</strong> ${escapeHtml(leaveType)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Start Date:</strong> ${escapeHtml(startDate)}</p>
  <p style="margin: 4px 0; font-size: 16px;"><strong style="font-size: 16px;">End Date:</strong> ${escapeHtml(endDate)}</p>
  <p style="margin: 16px 0 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Reason:</strong></p>
  <p style="margin: 4px 0; font-size: 16px; white-space: pre-wrap;">${escapeHtml(reason)}</p>
  <p style="margin: 16px 0 4px 0; font-size: 16px;"><strong style="font-size: 16px;">Attachments:</strong></p>
  <div style="padding-left: 12px; font-size: 16px; white-space: pre-wrap;">${escapeHtml(docs)}</div>
  <br><br>
  <p style="margin: 24px 0 16px 0; font-size: 16px;"><em style="font-size: 16px;">Your leave request has been ${escapeHtml(actualStatus)}</em></p>
</div>`

  const subject = `Leave Request ${statusCapitalized}`

  await sendMail({
    from: formatAddress(fromEmail, getDisplayName(fromEmail)),
    to: formatAddress(email),
    subject,
    text,
    html,
    attachments: emailAttachments,
  })

  if (actualStatus === 'approved') {
    await sendMail({
      from: formatAddress(fromEmail, getDisplayName(fromEmail)),
      to: formatAddress('chinenye.onyia@getpayedmail.com'),
      subject,
      text,
      html,
      attachments: emailAttachments,
    })
  }

  return true
}
