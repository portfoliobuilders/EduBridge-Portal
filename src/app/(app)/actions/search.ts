'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().min(2, 'Query too short').max(100, 'Query too long'),
})

export interface SearchResult {
  students: Array<{
    id: string
    student_code: string
    full_name: string
    mobile: string
  }>
  receipts: Array<{
    id: string
    receipt_no: string
    student_name: string
    amount: number
  }>
}

interface PaymentSearchItem {
  id: string
  receipt_no: string
  amount: number
  students: { full_name: string } | null
}

export async function globalSearchAction(query: string): Promise<SearchResult> {
  await requireUser()

  const parsed = searchSchema.safeParse({ query })
  const q = parsed.success ? parsed.data.query.trim() : ''
  if (!q || q.length < 2) {
    return { students: [], receipts: [] }
  }

  const supabase = await createClient()

  // Search students by name, code, or mobile
  const { data: students } = await supabase
    .from('students')
    .select('id, student_code, full_name, mobile')
    .or(`full_name.ilike.%${q}%,student_code.ilike.%${q}%,mobile.ilike.%${q}%`)
    .limit(6)

  // Search payments by receipt number
  const { data: payments } = await supabase
    .from('payments')
    .select('id, receipt_no, amount, students(full_name)')
    .ilike('receipt_no', `%${q}%`)
    .limit(6)

  const paymentRows = (payments as unknown as PaymentSearchItem[]) || []

  return {
    students: students || [],
    receipts: paymentRows.map((p) => ({
      id: p.id,
      receipt_no: p.receipt_no,
      student_name: p.students?.full_name || 'Unknown Student',
      amount: Number(p.amount),
    })),
  }
}
