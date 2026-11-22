#!/usr/bin/env node
/**
 * cleanup-test-users.mjs
 * Finds and deletes all @test.edubridge.local users from Supabase Auth,
 * after cleaning up their FK-dependent rows in public tables.
 *
 * Usage: npx dotenvx run -f .env.local -- node scripts/cleanup-test-users.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // List ALL users (paginate)
  let allUsers = []
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) { console.error('listUsers error:', error.message); process.exit(1) }
    allUsers.push(...data.users)
    if (data.users.length < 100) break
    page++
  }

  const testUsers = allUsers.filter(u => u.email?.endsWith('@test.edubridge.local'))
  if (testUsers.length === 0) {
    console.log('✅ No @test.edubridge.local users found.')
    process.exit(0)
  }

  console.log(`Found ${testUsers.length} test user(s). Cleaning up...`)

  for (const user of testUsers) {
    const uid = user.id
    console.log(`\n--- ${user.email} (${uid}) ---`)

    // 1. Delete document_access_log entries referencing this user's upload links
    await admin.from('document_access_log').delete().eq('uploaded_by_ip', uid) // won't match, but safe

    // 2. Delete document_upload_links created by this user
    await admin.from('document_upload_links').delete().eq('created_by', uid)

    // 3. Delete candidate_documents created by this user
    // Note: candidate_documents has a delete trigger that blocks deletes.
    // We need to use the service role which bypasses RLS but NOT triggers.
    // So we archive them instead.
    const { data: docs } = await admin
      .from('candidate_documents')
      .select('id')
      .eq('uploaded_by', uid)
    if (docs && docs.length > 0) {
      console.log(`  Archiving ${docs.length} candidate_documents...`)
      for (const doc of docs) {
        await admin.from('candidate_documents')
          .update({ archived_at: new Date().toISOString(), archived_by: uid, archive_reason: 'Test cleanup' })
          .eq('id', doc.id)
      }
    }

    // 4. Delete share_logs
    await admin.from('share_logs').delete().eq('shared_by', uid)

    // 5. Delete email_rate_limits
    await admin.from('email_rate_limits').delete().eq('user_id', uid)

    // 6. Delete audit_log entries
    await admin.from('audit_log').delete().eq('actor', uid)

    // 6b. Clean company_settings.updated_by
    await admin.from('company_settings').update({ updated_by: null }).eq('updated_by', uid)

    // 6c. Clean holidays.created_by
    await admin.from('holidays').delete().eq('created_by', uid)

    // 7. Handle payments: payments are immutable - we can't delete them.
    //    Check if any exist; if so, just deactivate the user.
    const { data: payments } = await admin
      .from('payments')
      .select('id')
      .eq('received_by', uid)
      .limit(1)
    
    if (payments && payments.length > 0) {
      console.log(`  ⚠ User has payments — deactivating profile and banning auth user instead.`)
      await admin.from('profiles').update({ is_active: false }).eq('id', uid)
      await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' })
      continue
    }

    // 7b. Handle attendance punches: punches are immutable - we can't delete them.
    const { data: punches } = await admin
      .from('attendance_punches')
      .select('id')
      .eq('user_id', uid)
      .limit(1)

    if (punches && punches.length > 0) {
      console.log(`  ⚠ User has attendance punches — deactivating profile and banning auth user instead.`)
      await admin.from('profiles').update({ is_active: false }).eq('id', uid)
      await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' })
      continue
    }

    // 8. Handle enrollments created by this user
    const { data: enrollments } = await admin
      .from('enrollments')
      .select('id')
      .eq('created_by', uid)
    
    if (enrollments && enrollments.length > 0) {
      // Check if any enrollment has payments
      for (const enr of enrollments) {
        const { data: enrPayments } = await admin
          .from('payments')
          .select('id')
          .eq('enrollment_id', enr.id)
          .limit(1)
        if (enrPayments && enrPayments.length > 0) {
          console.log(`  ⚠ Enrollment ${enr.id} has payments — deactivating user instead.`)
          await admin.from('profiles').update({ is_active: false }).eq('id', uid)
          continue
        }
      }
      // Delete enrollments without payments
      for (const enr of enrollments) {
        await admin.from('enrollments').delete().eq('id', enr.id)
      }
    }

    // 9. Handle students created by this user
    const { data: students } = await admin
      .from('students')
      .select('id')
      .eq('created_by', uid)
    
    if (students && students.length > 0) {
      for (const stu of students) {
        // Delete student_addresses
        await admin.from('student_addresses').delete().eq('student_id', stu.id)
        // Delete enrollments of these students
        const { data: stuEnrollments } = await admin
          .from('enrollments')
          .select('id')
          .eq('student_id', stu.id)
        if (stuEnrollments) {
          for (const enr of stuEnrollments) {
            const { data: ep } = await admin.from('payments').select('id').eq('enrollment_id', enr.id).limit(1)
            if (ep && ep.length > 0) {
              console.log(`  ⚠ Student enrollment has payments — skipping student ${stu.id}`)
              continue
            }
            await admin.from('enrollments').delete().eq('id', enr.id)
          }
        }
        // Delete student if no remaining enrollments
        const { data: remaining } = await admin.from('enrollments').select('id').eq('student_id', stu.id).limit(1)
        if (!remaining || remaining.length === 0) {
          await admin.from('students').delete().eq('id', stu.id)
        }
      }
    }

    // 9b. Attendance, celebrations, notifications and sensitive details
    await admin.from('attendance_punches').delete().eq('user_id', uid)
    await admin.from('attendance_daily_summary').delete().eq('user_id', uid)
    await admin.from('leave_requests').delete().eq('user_id', uid)
    await admin.from('staff_attendance_settings').delete().eq('user_id', uid)
    await admin.from('notifications').delete().eq('user_id', uid)
    await admin.from('celebration_wishes').delete().or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
    await admin.from('staff_sensitive_details').delete().eq('profile_id', uid)

    // 10. Delete the profile
    await admin.from('profiles').delete().eq('id', uid)

    // 11. Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) {
      console.log(`  ⚠ Failed to delete auth user: ${delErr.message}. Deactivating and banning instead.`)
      await admin.from('profiles').update({ is_active: false }).eq('id', uid)
      await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' })
    } else {
      console.log(`  ✅ Deleted ${user.email}`)
    }
  }

  console.log('\n--- Cleanup complete ---')
}

main().catch(err => { console.error(err); process.exit(1) })
