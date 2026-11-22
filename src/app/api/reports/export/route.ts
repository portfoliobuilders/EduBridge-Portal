import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { formatDubaiDateTime } from '@/lib/date'

interface CollectionsExportRow {
  receipt_no: string
  paid_at: string
  student_name: string
  student_code: string
  amount: number | string
  taxable_amount?: number | string | null
  vat_amount?: number | string | null
  vat_treatment?: string | null
  mode: string
  purpose: string
  purpose_note?: string | null
  reference_no?: string | null
  received_by_name?: string | null
  university_name?: string | null
  course_name?: string | null
  status: string
}

interface OutstandingExportRow {
  student_name: string
  student_code: string
  mobile?: string | null
  email?: string | null
  admission_staff_name?: string | null
  university_name: string
  course_name: string
  intake: string
  total_payable: number | string
  total_paid: number | string
  balance: number | string
  days_since_last_payment?: number | null
}

interface DayEndExportSummary {
  staff_name: string
  cash_total: number | string
  cash_count: number
  non_cash_total: number | string
  non_cash_count: number
  card_total: number | string
  link_total: number | string
  bank_transfer_total: number | string
  total_collected: number | string
  total_receipts: number
}

interface VoidsExportRow {
  receipt_no: string
  amount: number | string
  mode: string
  student_name: string
  student_code: string
  received_by_name?: string | null
  voided_by_name?: string | null
  voided_at?: string | null
  void_reason?: string | null
}

interface VatExportRow {
  month_name: string
  taxable_amount: number | string
  vat_collected: number | string
  total_collected: number | string
  receipt_count: number
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

function toCsvString(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',')
  const rowLines = rows.map((r) => r.map(escapeCsvCell).join(','))
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n')
}

export async function GET(request: NextRequest) {
  try {
    await requireUser()
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type') || 'collections'
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const staffId = searchParams.get('staff_id')
    const date = searchParams.get('date')
    const universityId = searchParams.get('university_id')
    const courseId = searchParams.get('course_id')
    const mode = searchParams.get('mode')
    const purpose = searchParams.get('purpose')
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined

    const supabase = await createClient()

    let csvContent = ''
    let filename = `edubridge-${type}-report.csv`

    if (type === 'collections') {
      const { data, error } = await supabase.rpc('report_collections', {
        p_from: from || new Date().toISOString(),
        p_to: to || new Date().toISOString(),
        p_staff_id: staffId || undefined,
        p_mode: mode || undefined,
        p_purpose: purpose || undefined,
        p_university_id: universityId || undefined,
        p_course_id: courseId || undefined,
      })
      if (error) throw error

      const rowsData = (
        ((data as Record<string, unknown>)?.rows as CollectionsExportRow[]) || []
      )
      const headers = [
        'Receipt No',
        'Date & Time (Dubai)',
        'Candidate Name',
        'Candidate Code',
        'Amount (AED)',
        'Taxable Amount (AED)',
        'VAT Amount (AED)',
        'VAT Treatment',
        'Mode',
        'Purpose',
        'Purpose Note',
        'Received By',
        'University',
        'Course',
        'Status',
      ]
      const rows = rowsData.map((r) => [
        r.receipt_no,
        formatDubaiDateTime(r.paid_at),
        r.student_name,
        r.student_code,
        Number(r.amount).toFixed(2),
        Number(r.taxable_amount != null ? r.taxable_amount : Number(r.amount) - Number(r.vat_amount || 0)).toFixed(2),
        Number(r.vat_amount || 0).toFixed(2),
        r.vat_treatment || 'exclusive',
        r.mode,
        r.purpose,
        r.purpose_note || '',
        r.received_by_name || '',
        r.university_name || '',
        r.course_name || '',
        r.status,
      ])
      csvContent = toCsvString(headers, rows)
      filename = `edubridge-collections-${new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'outstanding') {
      const { data, error } = await supabase.rpc('report_outstanding', {
        p_staff_id: staffId || undefined,
        p_university_id: universityId || undefined,
        p_course_id: courseId || undefined,
        p_min_balance: 0,
      })
      if (error) throw error

      const rowsData = (
        ((data as Record<string, unknown>)?.rows as OutstandingExportRow[]) || []
      )
      const headers = [
        'Candidate Name',
        'Candidate Code',
        'Mobile',
        'Email',
        'Admission Staff',
        'University',
        'Course',
        'Intake',
        'Total Payable (AED)',
        'Total Paid (AED)',
        'Balance Due (AED)',
        'Days Since Last Payment',
      ]
      const rows = rowsData.map((r) => [
        r.student_name,
        r.student_code,
        r.mobile,
        r.email || '',
        r.admission_staff_name || '',
        r.university_name,
        r.course_name,
        r.intake,
        Number(r.total_payable).toFixed(2),
        Number(r.total_paid).toFixed(2),
        Number(r.balance).toFixed(2),
        r.days_since_last_payment ?? '',
      ])
      csvContent = toCsvString(headers, rows)
      filename = `edubridge-outstanding-${new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'dayend') {
      const { data, error } = await supabase.rpc('report_dayend', {
        p_date: date || new Date().toISOString().slice(0, 10),
        p_staff_id: staffId || undefined,
      })
      if (error) throw error

      const summaryData = (
        ((data as Record<string, unknown>)?.staff_summary as DayEndExportSummary[]) || []
      )
      const headers = [
        'Staff Name',
        'Cash Total (AED)',
        'Cash Count',
        'Non-Cash Total (AED)',
        'Non-Cash Count',
        'Card Total (AED)',
        'Payment Link Total (AED)',
        'Bank Transfer Total (AED)',
        'Total Collected (AED)',
        'Total Receipts',
      ]
      const rows = summaryData.map((s) => [
        s.staff_name,
        Number(s.cash_total).toFixed(2),
        s.cash_count,
        Number(s.non_cash_total).toFixed(2),
        s.non_cash_count,
        Number(s.card_total).toFixed(2),
        Number(s.link_total).toFixed(2),
        Number(s.bank_transfer_total).toFixed(2),
        Number(s.total_collected).toFixed(2),
        s.total_receipts,
      ])
      csvContent = toCsvString(headers, rows)
      filename = `edubridge-dayend-${date || new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'voids') {
      const { data, error } = await supabase.rpc('report_voids', {
        p_from: from || new Date().toISOString(),
        p_to: to || new Date().toISOString(),
        p_staff_id: staffId || undefined,
      })
      if (error) throw error

      const rowsData = (
        ((data as Record<string, unknown>)?.rows as VoidsExportRow[]) || []
      )
      const headers = [
        'Receipt No',
        'Amount (AED)',
        'Mode',
        'Candidate Name',
        'Candidate Code',
        'Received By',
        'Voided By',
        'Voided Date (Dubai)',
        'Void Reason',
      ]
      const rows = rowsData.map((r) => [
        r.receipt_no,
        Number(r.amount).toFixed(2),
        r.mode,
        r.student_name,
        r.student_code,
        r.received_by_name || '',
        r.voided_by_name || '',
        r.voided_at ? formatDubaiDateTime(r.voided_at) : '',
        r.void_reason || '',
      ])
      csvContent = toCsvString(headers, rows)
      filename = `edubridge-voids-${new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'vat') {
      const { data, error } = await supabase.rpc('report_vat_summary', {
        p_year: year ?? undefined,
      })
      if (error) throw error

      const rowsData = (
        ((data as Record<string, unknown>)?.rows as VatExportRow[]) || []
      )
      const headers = [
        'Month',
        'Total Taxable (AED)',
        'Total VAT (AED)',
        'Total Collected (AED)',
        'Receipts Count',
        'Exclusive Taxable (AED)',
        'Exclusive VAT (AED)',
        'Inclusive Taxable (AED)',
        'Inclusive VAT (AED)',
        'No VAT Total (AED)',
      ]
      const rows = rowsData.map((r: any) => [
        r.month_name.trim(),
        Number(r.taxable_amount).toFixed(2),
        Number(r.vat_collected).toFixed(2),
        Number(r.total_collected).toFixed(2),
        r.receipt_count,
        Number(r.by_treatment?.exclusive?.taxable || 0).toFixed(2),
        Number(r.by_treatment?.exclusive?.vat || 0).toFixed(2),
        Number(r.by_treatment?.inclusive?.taxable || 0).toFixed(2),
        Number(r.by_treatment?.inclusive?.vat || 0).toFixed(2),
        Number(r.by_treatment?.none?.total || 0).toFixed(2),
      ])
      csvContent = toCsvString(headers, rows)
      filename = `edubridge-vat-summary-${year || new Date().getFullYear()}.csv`
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
