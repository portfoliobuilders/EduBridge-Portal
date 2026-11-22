import { Resend } from 'resend'
import { formatAED } from '../money'

export interface EmailSendResult {
  success: boolean
  error?: string
  fallbackMailto?: boolean
  mailtoUrl?: string
  message?: string
}

export function buildReceiptMailtoUrl(params: {
  to: string
  studentName: string
  receiptNo: string
  amount: number
  balance: number
  publicLink: string
}): string {
  const subject = encodeURIComponent(
    `Payment Receipt ${params.receiptNo} - EduBridge Education`
  )
  const body = encodeURIComponent(
    `Dear ${params.studentName},\n\nThank you for your payment of ${formatAED(params.amount)} to EduBridge Education.\n\nReceipt No: ${params.receiptNo}\nBalance Remaining: ${formatAED(params.balance)}\n\nYou can view and download your official receipt voucher here:\n${params.publicLink}\n\nEduBridge Education\nDubai, UAE`
  )
  return `mailto:${params.to}?subject=${subject}&body=${body}`
}

export function buildStatementMailtoUrl(params: {
  to: string
  studentName: string
  statementNo: string
  balance: number
  publicLink: string
}): string {
  const subject = encodeURIComponent(
    `Candidate Fee Statement ${params.statementNo} - EduBridge Education`
  )
  const body = encodeURIComponent(
    `Dear ${params.studentName},\n\nPlease find your official Candidate Fee Statement from EduBridge Education.\n\nStatement Ref: ${params.statementNo}\nBalance Remaining: ${formatAED(params.balance)}\n\nYou can view and download your verified fee statement here:\n${params.publicLink}\n\nEduBridge Education\nDubai, UAE`
  )
  return `mailto:${params.to}?subject=${subject}&body=${body}`
}

export function buildDocumentRequestMailtoUrl(params: {
  to: string
  studentName: string
  expiry: string
  uploadLink: string
}): string {
  const subject = encodeURIComponent(`Document Upload Request - EduBridge Education`)
  const body = encodeURIComponent(
    `Dear ${params.studentName},\n\nPlease upload your documents for EduBridge Education using this secure link (valid until ${params.expiry}):\n${params.uploadLink}\n\nEduBridge Education\nDubai, UAE`
  )
  return `mailto:${params.to}?subject=${subject}&body=${body}`
}

export async function sendReceiptEmail(params: {
  to: string
  replyTo: string
  receiptNo: string
  studentName: string
  candidateCode: string
  amount: number
  balance: number
  publicLink: string
  pdfBuffer: Buffer
  subjectTemplate?: string | null
  bodyTemplate?: string | null
  companyName?: string
  companyAddress?: string
  companyTrn?: string
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    const mailtoUrl = buildReceiptMailtoUrl({
      to: params.to,
      studentName: params.studentName,
      receiptNo: params.receiptNo,
      amount: params.amount,
      balance: params.balance,
      publicLink: params.publicLink,
    })
    return {
      success: false,
      fallbackMailto: true,
      mailtoUrl,
      message: 'Attachment unavailable — sending link instead',
    }
  }

  const resend = new Resend(apiKey)
  const from =
    process.env.EMAIL_FROM ||
    'EduBridge Education <receipts@edubridgeeducation.com>'

  const subject = (params.subjectTemplate || 'Payment Receipt {receipt_no} - EduBridge Education')
    .replace('{receipt_no}', params.receiptNo)
    .replace('{student_name}', params.studentName)
    .replace('{amount}', formatAED(params.amount))
    .replace('{balance}', formatAED(params.balance))

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #F5F6F6; margin: 0; padding: 24px; color: #0A0A0A;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E4E7E7; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #00A57E; padding: 24px 32px; text-align: left;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                EduBridge Education
              </h1>
              <p style="color: #CCEDE5; margin: 4px 0 0 0; font-size: 13px;">
                Admissions & Billing Department · Dubai, UAE
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #0A0A0A;">
                Dear <strong>${params.studentName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #4A5568; line-height: 1.5;">
                Thank you for your payment to EduBridge Education. Your official receipt voucher (<strong>${params.receiptNo}</strong>) has been generated and is attached to this email as a PDF.
              </p>

              <!-- Highlight Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #E6F6F2; border: 1px solid #CCEDE5; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #00805F; text-transform: uppercase; font-weight: 600; padding-bottom: 4px;">
                          Amount Received
                        </td>
                        <td align="right" style="font-size: 13px; color: #6B7272; text-transform: uppercase; font-weight: 600; padding-bottom: 4px;">
                          Receipt No
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 24px; font-weight: 700; color: #00A57E; font-family: monospace;">
                          ${formatAED(params.amount)}
                        </td>
                        <td align="right" style="font-size: 16px; font-weight: 600; color: #0A0A0A; font-family: monospace;">
                          ${params.receiptNo}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 12px; border-top: 1px solid #CCEDE5; font-size: 13px; color: #0A0A0A;">
                          <strong>Candidate Code:</strong> ${params.candidateCode} &nbsp;|&nbsp; <strong>Balance Remaining:</strong> ${formatAED(params.balance)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Button CTA -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${params.publicLink}" target="_blank" style="background-color: #00A57E; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
                      View & Download Online Voucher
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #6B7272; text-align: center;">
                Or copy this verification link into your browser:<br>
                <a href="${params.publicLink}" style="color: #00A57E; word-break: break-all;">${params.publicLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F5F6F6; padding: 20px 32px; border-top: 1px solid #E4E7E7; font-size: 11px; color: #6B7272; text-align: center; line-height: 1.5;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #0A0A0A;">
                ${params.companyName || 'EduBridge Education'} · TRN: ${params.companyTrn || '105215478600003'}
              </p>
              <p style="margin: 0 0 4px 0;">
                ${params.companyAddress || 'M03, Royal House Building, Hor Al Anz East, Dubai – UAE'}
              </p>
              <p style="margin: 0; font-style: italic;">
                "Keep your receipt vouchers for future references."
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  try {
    const res = await resend.emails.send({
      from,
      to: params.to,
      replyTo: params.replyTo,
      subject,
      html,
      attachments: [
        {
          filename: `${params.receiptNo}.pdf`,
          content: params.pdfBuffer,
        },
      ],
    })

    if (res.error) {
      return { success: false, error: res.error.message }
    }

    return { success: true, message: `Receipt successfully sent to ${params.to}` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return { success: false, error: message }
  }
}

export async function sendStatementEmail(params: {
  to: string
  replyTo: string
  statementNo: string
  studentName: string
  candidateCode: string
  totalPayable: number
  totalPaid: number
  balance: number
  publicLink: string
  pdfBuffer: Buffer
  subjectTemplate?: string | null
  companyName?: string
  companyAddress?: string
  companyTrn?: string
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    const mailtoUrl = buildStatementMailtoUrl({
      to: params.to,
      studentName: params.studentName,
      statementNo: params.statementNo,
      balance: params.balance,
      publicLink: params.publicLink,
    })
    return {
      success: false,
      fallbackMailto: true,
      mailtoUrl,
      message: 'Attachment unavailable — sending link instead',
    }
  }

  const resend = new Resend(apiKey)
  const from =
    process.env.EMAIL_FROM ||
    'EduBridge Education <receipts@edubridgeeducation.com>'

  const subject = params.subjectTemplate
    ? params.subjectTemplate
        .replace('{statement_no}', params.statementNo)
        .replace('{student_name}', params.studentName)
        .replace('{balance}', formatAED(params.balance))
    : `Candidate Fee Statement ${params.statementNo} - EduBridge Education`

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #F5F6F6; margin: 0; padding: 24px; color: #0A0A0A;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E4E7E7; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #00A57E; padding: 24px 32px; text-align: left;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                EduBridge Education
              </h1>
              <p style="color: #CCEDE5; margin: 4px 0 0 0; font-size: 13px;">
                Candidate Fee Statement & Tax Invoice · Dubai, UAE
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #0A0A0A;">
                Dear <strong>${params.studentName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #4A5568; line-height: 1.5;">
                Please find your official Candidate Fee Statement (<strong>${params.statementNo}</strong>) attached to this email as a PDF.
              </p>

              <!-- Highlight Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #E6F6F2; border: 1px solid #CCEDE5; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #00805F; text-transform: uppercase; font-weight: 600; padding-bottom: 4px;">
                          Balance Due
                        </td>
                        <td align="right" style="font-size: 13px; color: #6B7272; text-transform: uppercase; font-weight: 600; padding-bottom: 4px;">
                          Total Paid
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 24px; font-weight: 700; color: #B7791F; font-family: monospace;">
                          ${formatAED(params.balance)}
                        </td>
                        <td align="right" style="font-size: 20px; font-weight: 700; color: #00A57E; font-family: monospace;">
                          ${formatAED(params.totalPaid)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 12px; border-top: 1px solid #CCEDE5; font-size: 13px; color: #0A0A0A;">
                          <strong>Candidate Code:</strong> ${params.candidateCode} &nbsp;|&nbsp; <strong>Total Net Payable:</strong> ${formatAED(params.totalPayable)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Button CTA -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${params.publicLink}" target="_blank" style="background-color: #00A57E; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
                      View Online Fee Statement
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #6B7272; text-align: center;">
                Or access your statement online via:<br>
                <a href="${params.publicLink}" style="color: #00A57E; word-break: break-all;">${params.publicLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F5F6F6; padding: 20px 32px; border-top: 1px solid #E4E7E7; font-size: 11px; color: #6B7272; text-align: center; line-height: 1.5;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #0A0A0A;">
                ${params.companyName || 'EduBridge Education'} · TRN: ${params.companyTrn || '105215478600003'}
              </p>
              <p style="margin: 0 0 4px 0;">
                ${params.companyAddress || 'M03, Royal House Building, Hor Al Anz East, Dubai – UAE'}
              </p>
              <p style="margin: 0; font-style: italic;">
                "Keep your receipt vouchers for future references."
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  try {
    const res = await resend.emails.send({
      from,
      to: params.to,
      replyTo: params.replyTo,
      subject,
      html,
      attachments: [
        {
          filename: `Statement-${params.candidateCode}.pdf`,
          content: params.pdfBuffer,
        },
      ],
    })

    if (res.error) {
      return { success: false, error: res.error.message }
    }

    return { success: true, message: `Fee statement successfully sent to ${params.to}` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return { success: false, error: message }
  }
}

export async function sendDocumentRequestEmail(params: {
  to: string
  replyTo: string
  studentName: string
  expiry: string
  uploadLink: string
  requestedDocNames: string[]
  companyName?: string
  companyAddress?: string
  companyTrn?: string
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey || apiKey.startsWith('re_placeholder') || apiKey.length < 10) {
    return {
      success: false,
      fallbackMailto: true,
      mailtoUrl: buildDocumentRequestMailtoUrl({
        to: params.to,
        studentName: params.studentName,
        expiry: params.expiry,
        uploadLink: params.uploadLink,
      }),
      error: 'Resend API key not configured. Opened mailto client instead.',
    }
  }

  const resend = new Resend(apiKey)
  const from = process.env.EMAIL_FROM || 'EduBridge Education <receipts@edubridgeeducation.com>'
  const subject = `Document Upload Request - ${params.studentName}`

  const docListHtml = params.requestedDocNames
    .map((name) => `<li style="margin-bottom: 4px; color: #0A0A0A;">${name}</li>`)
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F5F6F6; margin: 0; padding: 24px; color: #0A0A0A;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #E4E7E7; overflow: hidden;">
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #E4E7E7; background-color: #ffffff;">
              <h2 style="margin: 0; color: #00A57E; font-size: 20px; font-weight: 700;">EduBridge Education</h2>
              <p style="margin: 4px 0 0 0; color: #6B7272; font-size: 13px;">Document Upload Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">Dear <strong>${params.studentName}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #333333;">
                Please upload the following documents for your admissions application with EduBridge Education:
              </p>
              <ul style="font-size: 14px; line-height: 1.6; padding-left: 20px;">
                ${docListHtml}
              </ul>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${params.uploadLink}" style="background-color: #00A57E; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                  Upload Your Documents
                </a>
              </div>
              <p style="font-size: 12px; color: #6B7272; line-height: 1.5; background-color: #E6F6F2; padding: 12px; border-radius: 8px; border: 1px solid #CCEDE5;">
                <strong>Security Notice:</strong> This secure upload link is valid until <strong>${params.expiry}</strong>. PDFs must be under 2 MB. Photos are automatically optimized.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F5F6F6; padding: 20px 32px; border-top: 1px solid #E4E7E7; font-size: 11px; color: #6B7272; text-align: center; line-height: 1.5;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #0A0A0A;">
                ${params.companyName || 'EduBridge Education'} · TRN: ${params.companyTrn || '105215478600003'}
              </p>
              <p style="margin: 0;">
                ${params.companyAddress || 'M03, Royal House Building, Hor Al Anz East, Dubai – UAE'}
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  try {
    const res = await resend.emails.send({
      from,
      to: params.to,
      replyTo: params.replyTo,
      subject,
      html,
    })

    if (res.error) {
      return { success: false, error: res.error.message }
    }

    return { success: true, message: `Upload request successfully sent to ${params.to}` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return { success: false, error: message }
  }
}
