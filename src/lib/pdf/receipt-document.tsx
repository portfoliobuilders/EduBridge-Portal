/* eslint-disable jsx-a11y/alt-text */
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'
import path from 'path'
import { amountInWords } from '@/lib/amount-in-words'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime } from '@/lib/date'
import { formatPhoneNumber } from '@/lib/phone'

// Register Poppins fonts from local filesystem
const fontsDir = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'Poppins',
  fonts: [
    { src: path.join(fontsDir, 'Poppins-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(fontsDir, 'Poppins-Medium.ttf'), fontWeight: 500 },
    { src: path.join(fontsDir, 'Poppins-SemiBold.ttf'), fontWeight: 600 },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontSize: 9,
    padding: 24,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  voidWatermark: {
    position: 'absolute',
    top: '35%',
    left: '10%',
    right: '10%',
    textAlign: 'center',
    fontSize: 72,
    fontWeight: 600,
    color: '#C53030',
    opacity: 0.18,
    transform: 'rotate(-30deg)',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7E7',
  },
  logo: {
    width: 140,
    height: 'auto',
    maxHeight: 48,
    objectFit: 'contain',
  },
  companyInfo: {
    textAlign: 'right',
    fontSize: 7.5,
    lineHeight: 1.3,
    color: '#4A5568',
  },
  companyName: {
    fontSize: 10,
    fontWeight: 600,
    color: '#00A57E',
    marginBottom: 2,
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    color: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 10,
  },
  titleText: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  voucherMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voucherMetaItem: {
    fontSize: 8,
    color: '#E4E7E7',
  },
  voucherMetaBold: {
    fontWeight: 600,
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E4E7E7',
    borderRadius: 4,
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 90,
    fontSize: 8,
    color: '#6B7272',
    fontWeight: 500,
  },
  value: {
    flex: 1,
    fontSize: 8.5,
    fontWeight: 500,
    color: '#0A0A0A',
  },
  boldValue: {
    flex: 1,
    fontSize: 9,
    fontWeight: 600,
    color: '#0A0A0A',
  },
  highlightBox: {
    backgroundColor: '#E6F6F2',
    borderWidth: 1,
    borderColor: '#CCEDE5',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  amountBig: {
    fontSize: 14,
    fontWeight: 600,
    color: '#00A57E',
    marginBottom: 2,
  },
  amountInWords: {
    fontSize: 8,
    fontWeight: 500,
    color: '#6B7272',
  },
  financialGrid: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E4E7E7',
    borderRadius: 4,
  },
  gridHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F6F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7E7',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingVertical: 3.5,
    paddingHorizontal: 8,
  },
  gridRowLast: {
    flexDirection: 'row',
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    backgroundColor: '#FAFAFA',
  },
  colLabel: {
    flex: 1,
    fontSize: 8,
    color: '#4A5568',
  },
  colVal: {
    width: 100,
    textAlign: 'right',
    fontSize: 8,
    fontWeight: 500,
  },
  balanceColVal: {
    width: 100,
    textAlign: 'right',
    fontSize: 9,
    fontWeight: 600,
    color: '#00A57E',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopColor: '#E4E7E7',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrCode: {
    width: 50,
    height: 50,
  },
  footerNote: {
    fontSize: 7.5,
    color: '#6B7272',
    textAlign: 'center',
    maxWidth: 200,
  },
  signatory: {
    textAlign: 'right',
    fontSize: 7.5,
    color: '#4A5568',
  },
  signatoryLine: {
    borderTopWidth: 1,
    borderTopColor: '#A0AEC0',
    marginTop: 20,
    paddingTop: 2,
    width: 110,
    textAlign: 'center',
  },
  voidNotice: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
    padding: 6,
    borderRadius: 4,
    marginBottom: 8,
  },
  voidText: {
    color: '#C53030',
    fontSize: 7.5,
    fontWeight: 600,
    textAlign: 'center',
  },
})

export interface ReceiptDocumentProps {
  payment: {
    id: string
    receipt_no: string
    amount: number
    mode: string
    purpose: string
    purpose_note: string | null
    reference_no: string | null
    paid_at: string
    payee_name: string | null
    comments: string | null
    status: string
    fee_snapshot: number
    paid_before_snapshot: number
    balance_after_snapshot: number
    vat_amount: number
    taxable_amount?: number | null
    vat_treatment?: string | null
    vat_type?: string | null
    vat_rate: number
    no_vat_reason?: string | null
    share_token: string
    void_reason?: string | null
    voided_at?: string | null
  }
  student: {
    full_name: string
    student_code: string
    mobile: string
    email?: string | null
  }
  enrollment: {
    university_name: string
    course_name: string
    specialization_name?: string | null
    intake?: string | null
    total_fee: number
    discount: number
  }
  settings: {
    name: string
    address: string
    phone: string
    email: string
    website: string
    trn: string
    footer_note: string
    vat_enabled?: boolean | null
  }
  billingAddress?: {
    contact_name?: string | null
    contact_phone?: string | null
    line1?: string | null
    line2?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
  } | null
  opening_paid?: number
  receivedByName: string
  voidedByName?: string | null
  qrCodeDataUrl: string
  logoPath?: string
}

export function ReceiptDocument({
  payment,
  student,
  enrollment,
  settings,
  billingAddress,
  opening_paid,
  receivedByName,
  voidedByName,
  qrCodeDataUrl,
  logoPath,
}: ReceiptDocumentProps) {
  const isVoid = payment.status === 'void'
  const isVatRegistered = settings.vat_enabled !== false
  const treatment = payment.vat_treatment || payment.vat_type || 'exclusive'
  const vatRate = Number(payment.vat_rate ?? 5)
  const vatAmount = Number(payment.vat_amount ?? 0)
  const taxableAmount = payment.taxable_amount != null
    ? Number(payment.taxable_amount)
    : Number(payment.amount) - vatAmount
  const noVatReason = payment.no_vat_reason || 'zero_rated'
  const noVatLabel = noVatReason === 'exempt' ? 'exempt' : noVatReason === 'out_of_scope' ? 'out of scope' : 'zero-rated'

  const fallbackLogo = path.join(
    process.cwd(),
    'public',
    'brand',
    'edubridge-logo-color.png'
  )
  const logoSrc = logoPath || fallbackLogo

  const modeLabels: Record<string, string> = {
    card: 'Card',
    cash: 'Cash',
    link: 'Payment Link',
    bank_transfer: 'Bank Transfer',
  }

  const purposeLabels: Record<string, string> = {
    admission: 'Admission Fee',
    repayment: 'Instalment / Re-payment',
    other: payment.purpose_note
      ? `Other (${payment.purpose_note})`
      : 'Other',
  }

  return (
    <Document>
      <Page size="A5" orientation="portrait" style={styles.page}>
        {isVoid && <Text style={styles.voidWatermark}>VOID</Text>}

        {/* Header */}
        <View style={styles.header}>
          <Image src={logoSrc} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{settings.name}</Text>
            <Text>{settings.address}</Text>
            <Text>
              Tel: {formatPhoneNumber(settings.phone)} | Email: {settings.email}
            </Text>
            <Text>Web: {settings.website}</Text>
            <Text style={{ fontWeight: 600, color: '#0A0A0A', marginTop: 1 }}>
              TRN: {settings.trn}
            </Text>
          </View>
        </View>

        {/* Title Bar */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>RECEIPT VOUCHER</Text>
          <View style={styles.voucherMeta}>
            <Text style={styles.voucherMetaItem}>
              Receipt No:{' '}
              <Text style={styles.voucherMetaBold}>{payment.receipt_no}</Text>
            </Text>
            <Text style={styles.voucherMetaItem}>
              Date:{' '}
              <Text style={styles.voucherMetaBold}>
                {formatDubaiDateTime(payment.paid_at)}
              </Text>
            </Text>
          </View>
        </View>

        {/* Void notice banner */}
        {isVoid && (
          <View style={styles.voidNotice}>
            <Text style={styles.voidText}>
              THIS RECEIPT HAS BEEN VOIDED ON{' '}
              {formatDubaiDateTime(payment.voided_at)}
              {voidedByName ? ` BY ${voidedByName.toUpperCase()}` : ''}
              {payment.void_reason ? ` — REASON: ${payment.void_reason}` : ''}
            </Text>
          </View>
        )}

        {/* Candidate & Course Info */}
        <View style={styles.section}>
          {billingAddress ? (
            <View style={styles.row}>
              <Text style={styles.label}>Bill To:</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.boldValue}>
                  {billingAddress.contact_name || payment.payee_name || student.full_name}
                </Text>
                <Text style={styles.value}>
                  {[billingAddress.line1, billingAddress.line2, billingAddress.city, billingAddress.state, billingAddress.country].filter(Boolean).join(', ')}
                </Text>
                {billingAddress.contact_phone ? (
                  <Text style={styles.value}>Tel: {formatPhoneNumber(billingAddress.contact_phone)}</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={styles.label}>Received from (Candidate&apos;s Name):</Text>
              <Text style={styles.boldValue}>
                {payment.payee_name || student.full_name}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Candidate ID / Tel:</Text>
            <Text style={styles.value}>
              {student.student_code} | {formatPhoneNumber(student.mobile)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>University:</Text>
            <Text style={styles.value}>{enrollment.university_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Course:</Text>
            <Text style={styles.value}>
              {enrollment.course_name}
              {enrollment.specialization_name
                ? ` (${enrollment.specialization_name})`
                : ''}
              {enrollment.intake ? ` · Intake: ${enrollment.intake}` : ''}
            </Text>
          </View>
        </View>

        {/* Amount Box */}
        <View style={styles.highlightBox}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <Text
              style={{
                fontSize: 8,
                fontWeight: 600,
                color: '#6B7272',
                textTransform: 'uppercase',
              }}
            >
              {isVatRegistered && treatment !== 'none'
                ? `Amount received (incl. VAT ${vatRate}%)`
                : 'Amount Received'}
            </Text>
            <Text style={styles.amountBig}>{formatAED(payment.amount)}</Text>
          </View>
          <Text style={styles.amountInWords}>
            {amountInWords(payment.amount)}
          </Text>

          {isVatRegistered && treatment !== 'none' && (
            <View
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTopWidth: 1,
                borderTopColor: '#CCEDE5',
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 7.5, color: '#00805F', fontWeight: 500 }}>
                of which VAT: AED {formatAED(vatAmount)}
              </Text>
              <Text style={{ fontSize: 7.5, color: '#4A5568' }}>
                Taxable: AED {formatAED(taxableAmount)}
              </Text>
            </View>
          )}

          {isVatRegistered && treatment === 'none' && (
            <View
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTopWidth: 1,
                borderTopColor: '#CCEDE5',
              }}
            >
              <Text style={{ fontSize: 7.5, color: '#6B7272' }}>
                VAT: Not applicable ({noVatLabel})
              </Text>
            </View>
          )}
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Payment Mode:</Text>
            <Text style={styles.value}>
              {modeLabels[payment.mode] || payment.mode}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment Purpose:</Text>
            <Text style={styles.value}>
              {purposeLabels[payment.purpose] || payment.purpose}
            </Text>
          </View>
          {payment.comments ? (
            <View style={styles.row}>
              <Text style={styles.label}>Comments:</Text>
              <Text style={styles.value}>{payment.comments}</Text>
            </View>
          ) : null}
        </View>

        {/* Financial Snapshot Table */}
        <View style={styles.financialGrid}>
          <View style={styles.gridHeader}>
            <Text style={styles.colLabel}>Description</Text>
            <Text style={[styles.colVal, { fontWeight: 600 }]}>Amount (AED)</Text>
          </View>

          <View style={styles.gridRow}>
            <Text style={styles.colLabel}>Total Course Fee</Text>
            <Text style={styles.colVal}>{formatAED(enrollment.total_fee)}</Text>
          </View>

          {enrollment.discount > 0 && (
            <View style={styles.gridRow}>
              <Text style={styles.colLabel}>Discount</Text>
              <Text style={[styles.colVal, { color: '#C53030' }]}>
                - {formatAED(enrollment.discount)}
              </Text>
            </View>
          )}

          {isVatRegistered && treatment === 'exclusive' && (
            <>
              <View style={styles.gridRow}>
                <Text style={styles.colLabel}>Net Tuition (excl. VAT)</Text>
                <Text style={styles.colVal}>
                  {formatAED(enrollment.total_fee - enrollment.discount)}
                </Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.colLabel}>
                  VAT ({vatRate}%) on Course Fee
                </Text>
                <Text style={styles.colVal}>
                  {formatAED(
                    payment.fee_snapshot -
                    (enrollment.total_fee - enrollment.discount)
                  )}
                </Text>
              </View>
            </>
          )}

          {isVatRegistered && treatment === 'inclusive' && (
            <View style={styles.gridRow}>
              <Text style={styles.colLabel}>
                VAT ({vatRate}% included in payment)
              </Text>
              <Text style={styles.colVal}>{formatAED(vatAmount)}</Text>
            </View>
          )}

          <View style={styles.gridRow}>
            <Text style={styles.colLabel}>Total Payable</Text>
            <Text style={[styles.colVal, { fontWeight: 600 }]}>
              {formatAED(payment.fee_snapshot)}
            </Text>
          </View>

          {opening_paid && opening_paid > 0 ? (
            <View style={styles.gridRow}>
              <Text style={styles.colLabel}>Paid before system (Opening Balance)</Text>
              <Text style={styles.colVal}>{formatAED(opening_paid)}</Text>
            </View>
          ) : null}

          <View style={styles.gridRow}>
            <Text style={styles.colLabel}>Previously Paid</Text>
            <Text style={styles.colVal}>
              {formatAED(payment.paid_before_snapshot)}
            </Text>
          </View>

          <View style={styles.gridRow}>
            <Text style={styles.colLabel}>This Payment</Text>
            <Text style={[styles.colVal, { fontWeight: 600 }]}>
              {formatAED(payment.amount)}
            </Text>
          </View>

          <View style={styles.gridRowLast}>
            <Text style={[styles.colLabel, { fontWeight: 600 }]}>
              Balance Remaining
            </Text>
            <Text style={styles.balanceColVal}>
              {formatAED(payment.balance_after_snapshot)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Image src={qrCodeDataUrl} style={styles.qrCode} />
          <View>
            <Text style={styles.footerNote}>{settings.footer_note}</Text>
            <Text
              style={{
                fontSize: 6.5,
                color: '#A0AEC0',
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              Scan QR code to verify receipt authenticity online
            </Text>
          </View>
          <View style={styles.signatory}>
            <View style={styles.signatoryLine}>
              <Text style={{ fontSize: 7.5, fontWeight: 500 }}>
                {receivedByName}
              </Text>
              <Text style={{ fontSize: 6.5, color: '#718096' }}>
                Authorized Signatory
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
