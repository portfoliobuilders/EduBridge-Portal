import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { PaymentForm, PreselectedEnrollment } from '@/components/receipts/PaymentForm'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollment?: string }>
}) {
  const { user, profile } = await requireUser()
  const isOwner = profile.role === 'owner'
  const resolvedParams = searchParams ? await searchParams : {}
  const enrollmentId = resolvedParams?.enrollment

  const supabase = await createClient()

  // Fetch metadata for Quick-Add Candidate sheet
  const [
    { data: universitiesData },
    { data: coursesData },
    { data: specializationsData },
    { data: staffData },
  ] = await Promise.all([
    supabase
      .from('universities')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('courses')
      .select('id, university_id, name, level, default_fee')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('specializations')
      .select('id, course_id, name, default_fee')
      .eq('is_active', true)
      .order('name'),
    isOwner
      ? supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('is_active', true)
          .order('full_name')
      : Promise.resolve({ data: [] }),
  ])

  let initialEnrollment: PreselectedEnrollment | null = null

  if (enrollmentId) {
    const { data: item } = await supabase
      .from('enrollments')
      .select(`
        id,
        student_id,
        total_fee,
        discount,
        vat_type,
        vat_rate,
        status,
        intake,
        student:students!inner(
          id,
          full_name,
          student_code,
          mobile,
          guardian_name
        ),
        university:universities!inner(
          name
        ),
        course:courses!inner(
          name
        ),
        specialization:specializations(
          name
        )
      `)
      .eq('id', enrollmentId)
      .single()

    if (item) {
      const studentObj = Array.isArray(item.student) ? item.student[0] : item.student
      const uniObj = Array.isArray(item.university) ? item.university[0] : item.university
      const courseObj = Array.isArray(item.course) ? item.course[0] : item.course
      const specObj = Array.isArray(item.specialization) ? item.specialization[0] : item.specialization

      const [{ data: ledger }, { data: billingAddr }] = await Promise.all([
        supabase
          .from('enrollment_ledger')
          .select('total_payable, total_paid, balance')
          .eq('enrollment_id', enrollmentId)
          .single(),
        supabase
          .from('student_addresses')
          .select('contact_name')
          .eq('student_id', item.student_id)
          .eq('type', 'billing')
          .eq('is_default', true)
          .maybeSingle(),
      ])

      initialEnrollment = {
        enrollmentId: item.id,
        studentId: item.student_id,
        studentName: studentObj?.full_name ?? '',
        studentCode: studentObj?.student_code ?? '',
        studentMobile: studentObj?.mobile ?? '',
        universityName: uniObj?.name ?? '',
        courseName: courseObj?.name ?? '',
        specializationName: specObj?.name ?? null,
        intake: item.intake,
        vatType: item.vat_type,
        vatRate: item.vat_rate,
        totalPayable: Number(
          ledger?.total_payable ?? item.total_fee - item.discount
        ),
        totalPaid: Number(ledger?.total_paid ?? 0),
        balance: Number(
          ledger?.balance ?? item.total_fee - item.discount
        ),
        guardianName: studentObj?.guardian_name ?? null,
        billingContactName: billingAddr?.contact_name ?? null,
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record Payment"
        subtitle="Issue an official gapless receipt voucher for candidate fee payment"
      />
      <PaymentForm
        initialEnrollment={initialEnrollment}
        quickAddMetadata={{
          universities: universitiesData || [],
          courses: coursesData || [],
          specializations: specializationsData || [],
          staffList: staffData || [],
          currentUserId: user.id,
          isOwner,
        }}
      />
    </div>
  )
}
