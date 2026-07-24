import nodemailer from 'nodemailer'

function isGetPayedMailEmail(email) {
  return /^[^\s@]+@getpayedmail\.com$/.test(email)
}

const resendTestMode = String(process.env.RESEND_FROM || '').toLowerCase().endsWith('@resend.dev')

function isAllowedRecipient(email) {
  return (
    isGetPayedMailEmail(email) ||
    String(email).toLowerCase() === 'igbinosaolivia6@gmail.com' ||
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

async function sendMail(mailOptions) {
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

    const fromEmail =
      String(mailOptions.from).match(/<([^>]+)>/)?.[1] || mailOptions.from
    if (fromEmail.toLowerCase().endsWith('@resend.dev')) {
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

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })

  return transporter.sendMail(mailOptions)
}

export const sendInviteEmail = async (req, res) => {
  try {
    const { to, password, from: senderEmail } = req.body

    if (!to || !password) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Validate that to email is @getpayedmail.com or @gmail.com
    if (!isAllowedRecipient(to) && !String(to).toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'To email must be a @getpayedmail.com, @gmail.com, or @resend.dev address' })
    }

    // Set from email to use @getpayedmail.com domain
    const fromEmail = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    if (!process.env.RESEND_API_KEY && !isGetPayedMailEmail(fromEmail)) {
      return res.status(500).json({ error: 'FROM email must be a @getpayedmail.com address' })
    }

    const subject = 'Welcome to Getpayed Petty Cash Voucher System'
    const text = `You have been invited to join the Getpayed Petty Cash Voucher System.

Your login credentials:
Email: ${to}
Password: ${password}

Please log in and change your password after your first login.

If you have any questions, please contact your administrator.`

    const displayName = senderEmail ? getDisplayName(senderEmail) : getDisplayName(fromEmail)

    const info = await sendMail({
      from: formatAddress(fromEmail, displayName),
      replyTo: senderEmail ? formatAddress(senderEmail) : undefined,
      to: formatAddress(to),
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
    const { cc, voucherNo, from, to, submittedBy, amount, payee, department, purpose, subject, submissionDate, supportingDocs } = req.body

    if (!cc || !voucherNo) {
      return res.status(400).json({ error: 'Missing required CC fields' })
    }

    if (!isAllowedRecipient(cc)) {
      return res.status(400).json({ error: 'CC email must be a @getpayedmail.com or @resend.dev address' })
    }

    const fromEmail = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    if (!process.env.RESEND_API_KEY && !isGetPayedMailEmail(fromEmail)) {
      return res.status(500).json({ error: 'FROM email must be a @getpayedmail.com address' })
    }

    const formattedAmount = Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

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

    const docs = docLines.length ? docLines.join('\n') : '  None attached'

    const text = `PETTY CASH VOUCHER APPROVED\n${'═'.repeat(52)}\nVoucher No.:      ${voucherNo}\nCompany:          Getpayed Technology Solutions Ltd.\nSubmitted By:     ${submittedBy || from}\n\nEMAIL DETAILS\n${'─'.repeat(52)}\nFrom:             ${formatDisplay(from)}\nTo:               ${formatDisplay(to)}\nCC:               ${formatDisplay(cc)}\nSubject:          ${subject}\n\nPAYEE INFORMATION\n${'─'.repeat(52)}\nPayee:            ${payee || ''}\nDepartment:       ${department || ''}\n\nAMOUNT & PURPOSE\n${'─'.repeat(52)}\nAmount (Figures): ₦${formattedAmount}\n\nPurpose / Description:\n${purpose || ''}\n\nSUPPORTING DOCUMENTS\n${'─'.repeat(52)}\nSubmission Date:  ${submissionDate}\nAttached Files:\n${docs}\n\n${'═'.repeat(52)}\nThis voucher has been approved.`

    const displayName = getDisplayName(from)

    const info = await sendMail({
      from: formatAddress(fromEmail, displayName),
      replyTo: formatAddress(from, displayName),
      to: formatAddress(cc),
      subject: `Approved: ${subject || `Petty Cash Voucher ${voucherNo}`}`,
      text,
      attachments,
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
    } = req.body

    if (!to || !subject || !voucherNo) {
      return res.status(400).json({ error: 'Missing required email fields' })
    }

    if (!isAllowedRecipient(to)) {
      return res.status(400).json({ error: 'To email must be a @getpayedmail.com or @resend.dev address' })
    }

    const fromEmail = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER
    if (!fromEmail) {
      return res.status(500).json({ error: 'FROM email is not configured' })
    }

    if (!process.env.RESEND_API_KEY && !isGetPayedMailEmail(fromEmail)) {
      return res.status(500).json({ error: 'FROM email must be a @getpayedmail.com address' })
    }

    const formattedAmount = Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

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

    const docs = docLines.length ? docLines.join('\n') : '  None attached'

    const text = `PETTY CASH VOUCHER\n${'═'.repeat(52)}\nVoucher No.:      ${voucherNo}\nCompany:          Getpayed Technology Solutions Ltd.\nSubmitted By:     ${submittedBy || from}\n\nEMAIL DETAILS\n${'─'.repeat(52)}\nFrom:             ${formatDisplay(from)}\nTo:               ${formatDisplay(to)}\nCC:               ${cc ? formatDisplay(cc) : ''}\nSubject:          ${subject}\n\nPAYEE INFORMATION\n${'─'.repeat(52)}\nPayee:            ${payee}\nDepartment:       ${department}\n\nAMOUNT & PURPOSE\n${'─'.repeat(52)}\nAmount (Figures): ₦${formattedAmount}\nAmount (Words):   ${amountWords || ''}\n\nPurpose / Description:\n${purpose || ''}\n\nSUPPORTING DOCUMENTS\n${'─'.repeat(52)}\nSubmission Date:  ${submissionDate}\nAttached Files:\n${docs}\n\n${'═'.repeat(52)}\nThis voucher was generated by the Petty Cash Voucher System.`

    const displayName = getDisplayName(from)

    const mailOptions = {
      from: formatAddress(fromEmail, displayName),
      replyTo: formatAddress(from, displayName),
      to: formatAddress(to),
      subject: `PCV: ${subject}`,
      text,
      attachments,
    }
    if (cc) {
      mailOptions.cc = formatAddress(cc)
    }
    const info = await sendMail(mailOptions)

    return res.json({ ok: true, messageId: info.messageId })
  } catch (error) {
    console.error('send-voucher-email failed', error)
    return res.status(500).json({ error: 'Failed to send voucher email' })
  }
}
