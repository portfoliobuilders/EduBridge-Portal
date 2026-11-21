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
import { formatAED } from '@/lib/money'
import { formatDubaiDate, formatDubaiDateTime } from '@/lib/date'

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
    padding: 32,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7E7',
  },
  logo: {
    width: 150,
    height: 'auto',
    maxHeight: 52,
    objectFit: 'contain',
  },
  companyInfo: {
    textAlign: 'right',
    fontSize: 8,
    lineHeight: 1.35,
    color: '#4A5568',
  },
  companyName: {
    fontSize: 11,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginTop: 14,
    marginBottom: 14,
  },
  titleText: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  metaText: {
    fontSize: 8.5,
    color: '#E4E7E7',
  },
  metaBold: {
    fontWeight: 600,
    color: '#FFFFFF',
  },
  metaColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 16,
  },
  infoCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E4E7E7',
    borderRadius: 4,
    padding: 10,
    backgroundColor: '#FAFAFA',
  },
  cardTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: '#00A57E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 3.5,
  },
  label: {
    width: 80,
    fontSize: 8,
    color: '#718096',
  },
  value: {
    flex: 1,
    fontSize: 8.5,
    fontWeight: 500,
    color: '#0A0A0A',
  },
  table: {
    marginTop: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E4E7E7',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F6F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7E7',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderCol: {
    fontSize: 8,
    fontWeight: 600,
    color: '#4A5568',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRowVoid: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#FFF5F5',
    opacity: 0.75,
  },
  colDate: { width: 95, fontSize: 8 },
  colReceipt: { width: 110, fontSize: 8, fontWeight: 500 },
  colMode: { width: 85, fontSize: 8 },
  colPurpose: { flex: 1, fontSize: 8 },
  colAmount: { width: 90, textAlign: 'right', fontSize: 8, fontWeight: 500 },
  colStatus: { width: 45, textAlign: 'center', fontSize: 7.5, fontWeight: 600 },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  summaryCard: {
    width: 250,
    borderWidth: 1,
    borderColor: '#E4E7E7',
    borderRadius: 4,
    padding: 10,
    backgroundColor: '#FAFAFA',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 8.5,
    color: '#4A5568',
  },
  summaryVal: {
    fontSize: 8.5,
    fontWeight: 500,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E4E7E7',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#0A0A0A',
  },
  balanceVal: {
    fontSize: 11,
    fontWeight: 600,
    color: '#00A57E',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: '#E4E7E7',
    paddingTop: 10,
    textAlign: 'center',
  },
  footerNote: {
    fontSize: 8,
    color: '#6B7272',
    marginBottom: 2,
  },
  footerSub: {
    fontSize: 7,
    color: '#A0AEC0',
  },
})

export interface StatementDocumentProps {
  enrollment: {
    id: string
    intake?: string | null
    total_fee: number
    discount: number
    vat_type: string
    vat_rate: number
    university_name: string
    course_name: string
    specialization_name?: string | null
  }
  student: {
    full_name: string
    student_code: string
    mobile: string
    email?: string | null
  }
  ledger: {
    net_fee: number
    vat_amount: number
    total_payable: number
    total_paid: number
    balance: number
  }
  payments: Array<{
    id: string
    receipt_no: string
    amount: number
    mode: string
    purpose: string
    purpose_note?: string | null
    reference_no?: string | null
    paid_at: string
    status: string
  }>
  settings: {
    name: string
    address: string
    phone: string
    email: string
    website: string
    trn: string
    footer_note: string
    statement_prefix?: string
  }
  statementNo: string
  logoPath?: string
}

export function StatementDocument({
  enrollment,
  student,
  ledger,
  payments,
  settings,
  statementNo,
  logoPath,
}: StatementDocumentProps) {
  const isTaxInvoice = enrollment.vat_type !== 'none'
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
    link: 'Link',
    bank_transfer: 'Transfer',
  }

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={logoSrc} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{settings.name}</Text>
            <Text>{settings.address}</Text>
            <Text>
              Tel: {settings.phone} | Email: {settings.email}
            </Text>
            <Text>Web: {settings.website}</Text>
            <Text style={{ fontWeight: 600, color: '#0A0A0A', marginTop: 1 }}>
              TRN: {settings.trn}
            </Text>
          </View>
        </View>

        {/* Title Bar */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>
            {isTaxInvoice ? 'TAX INVOICE / STATEMENT' : 'FEE STATEMENT'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Text style={styles.metaText}>
              Statement No: <Text style={styles.metaBold}>{statementNo}</Text>
            </Text>
            <Text style={styles.metaText}>
              Date:{' '}
              <Text style={styles.metaBold}>
                {formatDubaiDate(new Date())}
              </Text>
            </Text>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.metaColumns}>
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Candidate Information</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Candidate&apos;s Name:</Text>
              <Text style={styles.value}>{student.full_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Candidate ID:</Text>
              <Text style={styles.value}>{student.student_code}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Mobile:</Text>
              <Text style={styles.value}>{student.mobile}</Text>
            </View>
            {student.email ? (
              <View style={styles.row}>
                <Text style={styles.label}>Email:</Text>
                <Text style={styles.value}>{student.email}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Enrollment Details</Text>
            <View style={styles.row}>
              <Text style={styles.label}>University:</Text>
              <Text style={styles.value}>{enrollment.university_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Course:</Text>
              <Text style={styles.value}>{enrollment.course_name}</Text>
            </View>
            {enrollment.specialization_name ? (
              <View style={styles.row}>
                <Text style={styles.label}>Specialization:</Text>
                <Text style={styles.value}>
                  {enrollment.specialization_name}
                </Text>
              </View>
            ) : null}
            {enrollment.intake ? (
              <View style={styles.row}>
                <Text style={styles.label}>Intake:</Text>
                <Text style={styles.value}>{enrollment.intake}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Payment History Table */}
        <Text
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: '#0A0A0A',
            marginBottom: 4,
          }}
        >
          Payment History
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCol, styles.colDate]}>
              Date / Time
            </Text>
            <Text style={[styles.tableHeaderCol, styles.colReceipt]}>
              Receipt No
            </Text>
            <Text style={[styles.tableHeaderCol, styles.colMode]}>Mode</Text>
            <Text style={[styles.tableHeaderCol, styles.colPurpose]}>
              Purpose & Ref
            </Text>
            <Text style={[styles.tableHeaderCol, styles.colAmount]}>
              Amount (AED)
            </Text>
            <Text style={[styles.tableHeaderCol, styles.colStatus]}>Status</Text>
          </View>

          {payments.length === 0 ? (
            <View style={{ padding: 12, textAlign: 'center' }}>
              <Text style={{ fontSize: 8, color: '#718096' }}>
                No payment transactions recorded yet.
              </Text>
            </View>
          ) : (
            payments.map((p) => {
              const isVoid = p.status === 'void'
              return (
                <View
                  key={p.id}
                  style={isVoid ? styles.tableRowVoid : styles.tableRow}
                >
                  <Text style={styles.colDate}>
                    {formatDubaiDateTime(p.paid_at, 'dd/MM/yyyy, hh:mm a')}
                  </Text>
                  <Text style={styles.colReceipt}>{p.receipt_no}</Text>
                  <Text style={styles.colMode}>
                    {modeLabels[p.mode] || p.mode}
                  </Text>
                  <Text style={styles.colPurpose}>
                    {p.purpose === 'other'
                      ? `Other: ${p.purpose_note || ''}`
                      : p.purpose}
                    {p.reference_no ? ` · Ref: ${p.reference_no}` : ''}
                  </Text>
                  <Text
                    style={
                      isVoid
                        ? [styles.colAmount, { textDecoration: 'line-through', color: '#A0AEC0' }]
                        : styles.colAmount
                    }
                  >
                    {formatAED(p.amount)}
                  </Text>
                  <Text
                    style={[
                      styles.colStatus,
                      { color: isVoid ? '#C53030' : '#00A57E' },
                    ]}
                  >
                    {isVoid ? 'VOID' : 'PAID'}
                  </Text>
                </View>
              )
            })
          )}
        </View>

        {/* Financial Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Tuition Fee:</Text>
              <Text style={styles.summaryVal}>
                {formatAED(enrollment.total_fee)}
              </Text>
            </View>

            {enrollment.discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Less Discount:</Text>
                <Text style={[styles.summaryVal, { color: '#C53030' }]}>
                  - {formatAED(enrollment.discount)}
                </Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Net Tuition:</Text>
              <Text style={styles.summaryVal}>{formatAED(ledger.net_fee)}</Text>
            </View>

            {enrollment.vat_type === 'exclusive' && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  VAT ({enrollment.vat_rate}%):
                </Text>
                <Text style={styles.summaryVal}>
                  + {formatAED(ledger.vat_amount)}
                </Text>
              </View>
            )}

            {enrollment.vat_type === 'inclusive' && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  VAT ({enrollment.vat_rate}% included):
                </Text>
                <Text style={styles.summaryVal}>
                  {formatAED(ledger.vat_amount)}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.summaryRow,
                {
                  borderTopWidth: 1,
                  borderTopColor: '#E2E8F0',
                  paddingTop: 4,
                  marginTop: 2,
                },
              ]}
            >
              <Text style={[styles.summaryLabel, { fontWeight: 600 }]}>
                Total Payable:
              </Text>
              <Text style={[styles.summaryVal, { fontWeight: 600 }]}>
                {formatAED(ledger.total_payable)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Paid to Date:</Text>
              <Text style={[styles.summaryVal, { color: '#00A57E' }]}>
                {formatAED(ledger.total_paid)}
              </Text>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Balance Due:</Text>
              <Text style={styles.balanceVal}>
                {formatAED(ledger.balance)}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>{settings.footer_note}</Text>
          <Text style={styles.footerSub}>
            EduBridge Education · Royal House Building, Hor Al Anz East, Dubai,
            UAE · TRN: {settings.trn}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
