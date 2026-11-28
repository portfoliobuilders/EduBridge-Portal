#!/usr/bin/env node
/**
 * scripts/seed-demo.mjs
 * Realistic, removable demo data seeder & cleaner for EduBridge Receipt & Billing App.
 *
 * Usage:
 *   npm run seed:demo
 *   npm run seed:demo:clean
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const DEV_PROJECT_REF = 'bhbgkhyewxaacqnjltwr'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
const secretKey = process.env.SUPABASE_SECRET_KEY || ''

if (!url.includes(DEV_PROJECT_REF)) {
  console.error(`❌ ABORT: NEXT_PUBLIC_SUPABASE_URL must contain dev ref "${DEV_PROJECT_REF}". Got: "${url}"`)
  process.exit(1)
}
if (!publishableKey || !secretKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IS_CLEAN = process.argv.includes('--clean')

function randomPassword() {
  return `Demo_${crypto.randomBytes(16).toString('hex')}!1`
}

async function createAuthedClient(email, password) {
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Failed signIn for ${email}: ${error.message}`)
  return client
}

function formatDubaiDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getDubaiWeekday(date) {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
  }).format(date)
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd]
}

async function cleanDemoRuns() {
  const { data: runs, error } = await admin
    .from('demo_seed_runs')
    .select('id, run_label, manifest')
    .is('cleaned_at', null)

  if (error) {
    console.error('❌ Failed to query demo_seed_runs:', error.message)
    process.exit(1)
  }

  if (!runs || runs.length === 0) {
    console.log('✅ No active demo seed runs found. Nothing to clean.')
    return
  }

  for (const run of runs) {
    const m = run.manifest || {}
    console.log(`🧹 Cleaning demo run "${run.run_label}" (${run.id})...`)

    // 1. Remove uploaded storage objects
    if (Array.isArray(m.storage_paths) && m.storage_paths.length > 0) {
      const { error: stErr } = await admin.storage.from('candidate-documents').remove(m.storage_paths)
      if (stErr) console.warn('  ⚠️ Storage cleanup warning:', stErr.message)
    }

    // 2. Restore Joe Tom's previous team fields if recorded
    if (m.joe_tom_prev && m.joe_tom_prev.id) {
      await admin
        .from('profiles')
        .update({
          is_sales_team: m.joe_tom_prev.is_sales_team ?? false,
          reports_to: m.joe_tom_prev.reports_to ?? null,
        })
        .eq('id', m.joe_tom_prev.id)
    }

    // 3. Call guarded DB cleanup RPC
    const { data: cleanRes, error: rpcErr } = await admin.rpc('cleanup_demo_seed_run', {
      p_run_id: run.id,
    })
    if (rpcErr) {
      console.error('❌ cleanup_demo_seed_run error:', rpcErr.message)
      process.exit(1)
    }
    console.log('  DB cleanup:', JSON.stringify(cleanRes))

    // 4. Delete demo auth users & profiles
    const userIds = Array.isArray(m.user_ids) ? m.user_ids : []
    for (const uid of userIds) {
      await admin.from('profiles').delete().eq('id', uid)
      const { error: delErr } = await admin.auth.admin.deleteUser(uid)
      if (delErr) console.warn(`  ⚠️ deleteUser(${uid}) warning:`, delErr.message)
    }
    console.log(`  Removed ${userIds.length} demo auth users.`)
  }

  console.log('✅ Demo cleanup complete.')
}

async function seedDemo() {
  // Ensure idempotency: clean any existing active demo run first
  await cleanDemoRuns()

  const runTag = `demo_${Date.now()}`
  const manifest = {
    university_ids: [],
    course_ids: [],
    specialization_ids: [],
    user_ids: [],
    student_ids: [],
    enrollment_ids: [],
    payment_ids: [],
    punch_ids: [],
    day_ids: [],
    leave_ids: [],
    regularization_ids: [],
    holiday_ids: [],
    notification_ids: [],
    storage_paths: [],
    joe_tom_prev: null,
  }

  console.log('🌱 Seeding EduBridge realistic demo data...')

  // Ensure vat_enabled = false
  const { data: settingsRow } = await admin.from('company_settings').select('id, vat_enabled').limit(1).maybeSingle()
  if (settingsRow && settingsRow.vat_enabled) {
    await admin.from('company_settings').update({ vat_enabled: false }).eq('id', settingsRow.id)
  }

  // Find office (EduBridge Main Office)
  const { data: offices } = await admin
    .from('offices')
    .select('id, name, latitude, longitude, radius_m')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  const mainOffice = offices?.find((o) => o.name === 'EduBridge Main Office') || offices?.[0]
  if (!mainOffice) throw new Error('No active office found')

  // 1. Create Demo Staff (1 admin team lead + 4 sales staff + 1 HR non-sales + 1 temp super_admin for void_payment if needed)
  const staffDefs = [
    { key: 'lead', email: `demo_lead_${runTag}@test.edubridge.local`, full_name: 'Rami Al Mansoori', role: 'admin', is_sales_team: true, job_title: 'Admissions Team Lead' },
    { key: 's1', email: `demo_sales1_${runTag}@test.edubridge.local`, full_name: 'Aisha Al Hashimi', role: 'staff', is_sales_team: true, job_title: 'Senior Admissions Counsellor' },
    { key: 's2', email: `demo_sales2_${runTag}@test.edubridge.local`, full_name: 'Omar Al Nuaimi', role: 'staff', is_sales_team: true, job_title: 'Admissions Counsellor' },
    { key: 's3', email: `demo_sales3_${runTag}@test.edubridge.local`, full_name: 'Fatima Al Suwaidi', role: 'staff', is_sales_team: true, job_title: 'Admissions Counsellor' },
    { key: 's4', email: `demo_sales4_${runTag}@test.edubridge.local`, full_name: 'Zayd Al Qasimi', role: 'staff', is_sales_team: true, job_title: 'Admissions Counsellor' },
    { key: 'hr', email: `demo_hr_${runTag}@test.edubridge.local`, full_name: 'Nadia Haddad', role: 'staff', is_sales_team: false, job_title: 'HR & Operations Coordinator' },
  ]

  const users = {}
  for (const def of staffDefs) {
    const pw = randomPassword()
    const { data: uData, error: uErr } = await admin.auth.admin.createUser({
      email: def.email,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: def.full_name },
    })
    if (uErr) throw uErr
    const uid = uData.user.id
    manifest.user_ids.push(uid)
    users[def.key] = { ...def, id: uid, pw }
  }

  // Update profiles (role, is_sales_team, reports_to)
  const leadId = users.lead.id
  for (const def of staffDefs) {
    const u = users[def.key]
    await admin
      .from('profiles')
      .update({
        full_name: u.full_name,
        role: u.role,
        is_sales_team: u.is_sales_team,
        job_title: u.job_title,
        reports_to: def.key === 'lead' ? null : leadId,
        is_active: true,
        joining_date: '2025-01-10',
      })
      .eq('id', u.id)

    await admin.from('staff_attendance_settings').upsert({
      user_id: u.id,
      office_id: mainOffice.id,
      shift_start: '09:00',
      shift_end: '18:00',
      grace_minutes: 15,
      weekly_off: [5],
      attendance_required: true,
      allow_field_punch: true,
    })

    u.client = await createAuthedClient(u.email, u.pw)
  }

  // Attach existing joetom@edubridgeeducation.com
  const { data: joeProfile } = await admin
    .from('profiles')
    .select('id, full_name, is_sales_team, reports_to')
    .eq('id', '9bfbe83e-ca82-4492-b61e-74998beec546')
    .maybeSingle()

  const joeId = joeProfile?.id || null
  if (joeProfile) {
    manifest.joe_tom_prev = {
      id: joeProfile.id,
      is_sales_team: joeProfile.is_sales_team,
      reports_to: joeProfile.reports_to,
    }
    await admin
      .from('profiles')
      .update({ is_sales_team: true, reports_to: leadId })
      .eq('id', joeId)

    await admin.from('staff_attendance_settings').upsert({
      user_id: joeId,
      office_id: mainOffice.id,
      shift_start: '09:00',
      shift_end: '18:00',
      grace_minutes: 15,
      weekly_off: [5],
      attendance_required: true,
      allow_field_punch: true,
    })
  }

  // 2. Programs: 4 universities, 3 courses each, 2 specializations each
  const uniSpecs = [
    {
      name: 'Heriot-Watt University Dubai',
      country: 'UAE',
      courses: [
        { name: 'BSc Computer Science', level: 'Undergraduate', fee: 62000, specs: ['Artificial Intelligence', 'Cyber Security'] },
        { name: 'MBA International Business', level: 'Postgraduate', fee: 84000, specs: ['Finance', 'Strategic Management'] },
        { name: 'MSc Data Science', level: 'Postgraduate', fee: 72000, specs: ['Machine Learning', 'Big Data Analytics'] },
      ],
    },
    {
      name: 'Middlesex University Dubai',
      country: 'UAE',
      courses: [
        { name: 'BA Business Management', level: 'Undergraduate', fee: 54000, specs: ['Marketing', 'Human Resources'] },
        { name: 'LLB Honours Law', level: 'Undergraduate', fee: 58000, specs: ['Commercial Law', 'International Law'] },
        { name: 'MSc Digital Marketing', level: 'Postgraduate', fee: 64000, specs: ['Performance Marketing', 'Brand Strategy'] },
      ],
    },
    {
      name: 'University of Wollongong in Dubai',
      country: 'UAE',
      courses: [
        { name: 'BEng Electrical Engineering', level: 'Undergraduate', fee: 68000, specs: ['Power Systems', 'Embedded Systems'] },
        { name: 'Master of Applied Finance', level: 'Postgraduate', fee: 78000, specs: ['Islamic Finance', 'Corporate Treasury'] },
        { name: 'Bachelor of Computer Science', level: 'Undergraduate', fee: 59000, specs: ['Software Engineering', 'Game Development'] },
      ],
    },
    {
      name: 'Manipal Academy of Higher Education Dubai',
      country: 'UAE',
      courses: [
        { name: 'BArch Architecture', level: 'Undergraduate', fee: 52000, specs: ['Sustainable Design', 'Urban Planning'] },
        { name: 'BBA Aviation Management', level: 'Undergraduate', fee: 46000, specs: ['Airport Operations', 'Airline Logistics'] },
        { name: 'MBA Healthcare Management', level: 'Postgraduate', fee: 66000, specs: ['Hospital Administration', 'Health Informatics'] },
      ],
    },
  ]

  const courseCatalog = []
  for (const u of uniSpecs) {
    let { data: uniRow } = await admin
      .from('universities')
      .select('id')
      .ilike('name', u.name)
      .maybeSingle()

    if (!uniRow) {
      const { data: createdUni, error: uniErr } = await admin
        .from('universities')
        .insert({ name: u.name, country: u.country, is_active: true })
        .select('id')
        .single()
      if (uniErr) throw uniErr
      uniRow = createdUni
      manifest.university_ids.push(uniRow.id)
    }

    for (const c of u.courses) {
      let { data: cRow } = await admin
        .from('courses')
        .select('id')
        .eq('university_id', uniRow.id)
        .ilike('name', c.name)
        .maybeSingle()

      if (!cRow) {
        const { data: createdCourse, error: cErr } = await admin
          .from('courses')
          .insert({ university_id: uniRow.id, name: c.name, level: c.level, default_fee: c.fee, is_active: true })
          .select('id')
          .single()
        if (cErr) throw cErr
        cRow = createdCourse
        manifest.course_ids.push(cRow.id)
      }

      const specIds = []
      for (const sName of c.specs) {
        let { data: sRow } = await admin
          .from('specializations')
          .select('id')
          .eq('course_id', cRow.id)
          .ilike('name', sName)
          .maybeSingle()

        if (!sRow) {
          const { data: createdSpec, error: sErr } = await admin
            .from('specializations')
            .insert({ course_id: cRow.id, name: sName, default_fee: c.fee, is_active: true })
            .select('id')
            .single()
          if (sErr) throw sErr
          sRow = createdSpec
          manifest.specialization_ids.push(sRow.id)
        }
        specIds.push(sRow.id)
      }
      courseCatalog.push({ universityId: uniRow.id, courseId: cRow.id, specIds, fee: c.fee })
    }
  }

  // 3. Candidates (~30) + Enrollments
  const uaeNames = [
    'Khalifa Al Maktoum', 'Mariam Al Dhaheri', 'Hamdan Al Falasi', 'Shamma Al Mazrouei',
    'Sultan Al Ketbi', 'Latifa Al Muhairi', 'Rashid Al Shamsi', 'Moza Al Kaabi',
    'Saeed Al Blooshi', 'Maitha Al Zaabi', 'Mansoor Al Ameri', 'Hessa Al Rumaithi',
    'Butti Al Khaili', 'Noora Al Marri', 'Maktoum Al Ghaith', 'Reem Al Memari',
    'Ahmed Al Harmoodi', 'Salama Al Tayer', 'Yousef Al Zarooni', 'Meera Al Rostamani',
    'Tarek Al Habtoor', 'Dana Al Ghurair', 'Faisal Al Futtaim', 'Laila Al Owais',
    'Nasser Al Banna', 'Alya Al Sharhan', 'Majid Al Serkal', 'Huda Al Hashemi',
    'Bader Al Suwaidi', 'Amna Al Mansoori',
  ]
  const emirates = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah']
  const salesOwners = [
    ...(joeId ? Array(8).fill(joeId) : []),
    users.s1.id, users.s1.id, users.s1.id, users.s1.id, users.s1.id, users.s1.id,
    users.s2.id, users.s2.id, users.s2.id, users.s2.id, users.s2.id,
    users.s3.id, users.s3.id, users.s3.id, users.s3.id, users.s3.id,
    users.s4.id, users.s4.id, users.s4.id, users.s4.id,
    users.lead.id, users.lead.id,
  ].slice(0, 30)

  const staffClients = [users.s1.client, users.s2.client, users.s3.client, users.s4.client, users.lead.client]
  const enrollments = []

  for (let i = 0; i < 30; i++) {
    const fullName = uaeNames[i]
    const slug = fullName.toLowerCase().replace(/[^a-z]+/g, '.')
    const ownerId = salesOwners[i]
    const phoneSuffix = String(1000000 + i * 3719).slice(0, 7)

    const { data: stu, error: stuErr } = await admin
      .from('students')
      .insert({
        full_name: fullName,
        mobile: `+97150${phoneSuffix}`,
        whatsapp: `+97150${phoneSuffix}`,
        email: `${slug}@example.ae`,
        guardian_name: `Parent of ${fullName.split(' ')[0]}`,
        guardian_relation: i % 2 === 0 ? 'father' : 'mother',
        guardian_phone: `+97155${phoneSuffix}`,
        notes: `[DEMO:${runTag}] Candidate profile`,
        owner_id: ownerId,
        created_by: ownerId,
      })
      .select('id, full_name')
      .single()
    if (stuErr) throw stuErr
    manifest.student_ids.push(stu.id)

    await admin.from('student_addresses').insert({
      student_id: stu.id,
      type: 'billing',
      contact_name: fullName,
      contact_phone: `+97150${phoneSuffix}`,
      line1: `Villa ${10 + i}, Al Wasl Road`,
      city: emirates[i % emirates.length],
      country: 'United Arab Emirates',
      is_default: true,
    })

    const prog = courseCatalog[i % courseCatalog.length]
    const discount = i % 5 === 0 ? 3000 : i % 7 === 0 ? 1500 : 0
    const openingPaid = i % 6 === 0 ? 5000 : 0

    const { data: enr, error: enrErr } = await admin
      .from('enrollments')
      .insert({
        student_id: stu.id,
        university_id: prog.universityId,
        course_id: prog.courseId,
        specialization_id: prog.specIds[i % prog.specIds.length],
        intake: i % 2 === 0 ? 'Sep 2026' : 'Jan 2027',
        total_fee: prog.fee,
        discount,
        opening_paid: openingPaid,
        opening_paid_note: openingPaid > 0 ? 'Prior registration deposit' : null,
        vat_treatment: 'none',
        vat_rate: 0,
        no_vat_reason: 'exempt',
        admission_staff_id: ownerId,
        created_by: ownerId,
        status: 'active',
      })
      .select('id, total_fee, discount, opening_paid')
      .single()
    if (enrErr) throw enrErr
    manifest.enrollment_ids.push(enr.id)
    enrollments.push({ ...enr, studentId: stu.id, studentName: stu.full_name, ownerId, idx: i })
  }

  // Transfer 2 candidates between counsellors
  await users.lead.client
    .from('students')
    .update({ owner_id: users.s2.id })
    .eq('id', manifest.student_ids[10])
  await users.lead.client
    .from('students')
    .update({ owner_id: joeId || users.s1.id })
    .eq('id', manifest.student_ids[11])

  // 4. Payments (~45 over last 60 days via record_payment RPC)
  const modes = ['cash', 'card', 'link', 'bank_transfer']
  const purposes = ['admission', 'repayment', 'other']
  let paymentsCreated = 0
  let firstPaymentId = null

  // Mix: 0-9 fully paid (2 payments each), 10-24 partly paid (1-2 payments), 25-29 unpaid
  for (let i = 0; i < 25; i++) {
    const enr = enrollments[i]
    const payable = Number(enr.total_fee) - Number(enr.discount) - Number(enr.opening_paid || 0)
    if (payable <= 0) continue

    const isFull = i < 10
    const numInst = isFull ? 2 : i < 20 ? 2 : 1
    let remaining = isFull ? payable : Math.round(payable * 0.45)

    for (let k = 0; k < numInst && remaining > 0; k++) {
      const amt = k === numInst - 1 ? remaining : Math.round(remaining * 0.5)
      if (amt <= 0) break
      remaining -= amt

      const daysAgo = Math.max(1, (i * 2 + k * 5) % 29)
      const paidAt = new Date(Date.now() - daysAgo * 86400000).toISOString()
      // Counter staff sometimes records payment for another counsellor's candidate
      const receiverClient = (i + k) % 4 === 0 ? users.s3.client : staffClients[i % 4]

      const { data: pmt, error: pErr } = await receiverClient.rpc('record_payment', {
        p_enrollment_id: enr.id,
        p_amount: amt,
        p_mode: modes[(i + k) % modes.length],
        p_purpose: purposes[(i + k) % purposes.length],
        p_purpose_note: k === 0 ? 'Initial instalment' : 'Second instalment',
        p_reference_no: `REF-${runTag.slice(-4)}-${i}-${k}`,
        p_payee_name: enr.studentName,
        p_paid_at: paidAt,
        p_comments: `[DEMO:${runTag}] Instalment ${k + 1}`,
        p_idempotency_key: crypto.randomUUID(),
      })
      if (pErr) throw new Error(`record_payment failed: ${pErr.message}`)
      const pRow = Array.isArray(pmt) ? pmt[0] : pmt
      if (pRow?.id) {
        manifest.payment_ids.push(pRow.id)
        if (!firstPaymentId) firstPaymentId = pRow.id
      }
      paymentsCreated++
    }
  }

  // Void 1 payment using a temporary super_admin (or check if lead can void; void_payment requires super_admin/owner)
  if (firstPaymentId) {
    const saPw = randomPassword()
    const saEmail = `demo_sa_${runTag}@test.edubridge.local`
    const { data: saData } = await admin.auth.admin.createUser({
      email: saEmail,
      password: saPw,
      email_confirm: true,
      user_metadata: { full_name: 'Demo Super Admin' },
    })
    const saId = saData.user.id
    manifest.user_ids.push(saId)
    await admin.from('profiles').update({ role: 'super_admin', is_active: true }).eq('id', saId)
    const saClient = await createAuthedClient(saEmail, saPw)
    const { error: voidErr } = await saClient.rpc('void_payment', {
      p_payment_id: firstPaymentId,
      p_reason: 'Duplicate entry during demo reconciliation',
    })
    if (voidErr) console.warn('⚠️ void_payment warning:', voidErr.message)
  }

  // 5. Documents: upload tiny placeholder PDFs/JPGs, some verified, some unverified, 1 active upload link
  const { data: docTypes } = await admin
    .from('document_types')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'utf-8')
  if (docTypes && docTypes.length > 0) {
    for (let i = 0; i < 6; i++) {
      const sid = manifest.student_ids[i]
      const dt = docTypes[i % docTypes.length]
      const fileName = `demo_${dt.slug}_${i}.pdf`
      const filePath = `${sid}/${runTag}_${fileName}`
      const { error: upErr } = await admin.storage
        .from('candidate-documents')
        .upload(filePath, samplePdf, { contentType: 'application/pdf', upsert: true })
      if (!upErr) {
        manifest.storage_paths.push(filePath)
        await admin.from('candidate_documents').insert({
          student_id: sid,
          document_type_id: dt.id,
          title: `${dt.name} (Demo)`,
          file_path: filePath,
          file_name: fileName,
          size_bytes: samplePdf.length,
          mime_type: 'application/pdf',
          status: i % 2 === 0 ? 'verified' : 'received',
          uploaded_via: 'staff',
          uploaded_by: users.s1.id,
          verified_by: i % 2 === 0 ? users.lead.id : null,
          verified_at: i % 2 === 0 ? new Date().toISOString() : null,
        })
      }
    }

    // 1 active upload link
    await admin.from('document_upload_links').insert({
      student_id: manifest.student_ids[6],
      token: `demo_link_${runTag}`,
      requested_types: [docTypes[0].id],
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_by: users.s1.id,
    })
  }

  // 6. Attendance: last 30 working days + 2 UAE public holidays
  const now = new Date()
  const workingDates = []
  const holidayDates = []
  for (let d = 1; d <= 42 && workingDates.length < 30; d++) {
    const dt = new Date(now.getTime() - d * 86400000)
    const wd = getDubaiWeekday(dt)
    const dStr = formatDubaiDate(dt)
    if (wd === 5) continue // Friday weekly off
    if (holidayDates.length < 2 && (d === 10 || d === 20)) {
      holidayDates.push(dStr)
      continue
    }
    workingDates.push(dStr)
  }

  for (let h = 0; h < holidayDates.length; h++) {
    const { data: hol, error: holErr } = await admin
      .from('holidays')
      .insert({
        date: holidayDates[h],
        name: h === 0 ? 'UAE Commemoration Day (Demo)' : 'UAE National Day (Demo)',
        half_day: false,
      })
      .select('id')
      .single()
    if (holErr) console.warn('⚠️ holiday insert warning:', holErr.message)
    if (hol) manifest.holiday_ids.push(hol.id)
  }

  const officeLat = Number(mainOffice.latitude)
  const officeLng = Number(mainOffice.longitude)

  // Seed punches for seeded staff via punch RPC
  const punchUsers = [users.s1, users.s2, users.s3, users.s4, users.hr]
  for (let uIdx = 0; uIdx < punchUsers.length; uIdx++) {
    const u = punchUsers[uIdx]
    for (let dIdx = 0; dIdx < workingDates.length; dIdx++) {
      const dateStr = workingDates[dIdx]
      // Make 1 absent day for s2 on dIdx === 5
      if (u.key === 's2' && dIdx === 5) continue

      const isLate = (uIdx + dIdx) % 6 === 0
      const inHour = isLate ? '09:35:00+04:00' : '08:55:00+04:00'
      const outHour = '18:05:00+04:00'

      const { data: inRes } = await u.client.rpc('punch', {
        p_kind: 'in',
        p_lat: officeLat,
        p_lng: officeLng,
        p_accuracy: 12,
        p_client_time: `${dateStr}T${inHour}`,
        p_device_hash: `demo_dev_${u.key}`,
      })
      if (inRes?.punch_id) manifest.punch_ids.push(inRes.punch_id)

      // Missing checkout on dIdx === 1 for s1
      if (u.key === 's1' && dIdx === 1) continue

      const { data: outRes } = await u.client.rpc('punch', {
        p_kind: 'out',
        p_lat: officeLat,
        p_lng: officeLng,
        p_accuracy: 12,
        p_client_time: `${dateStr}T${outHour}`,
        p_device_hash: `demo_dev_${u.key}`,
      })
      if (outRes?.punch_id) manifest.punch_ids.push(outRes.punch_id)
    }
  }

  // 1 field punch pending (outside geofence)
  const todayStr = formatDubaiDate(now)
  const { data: fieldRes } = await users.s3.client.rpc('punch', {
    p_kind: 'in',
    p_lat: 25.1972,
    p_lng: 55.2744,
    p_accuracy: 20,
    p_note: 'Meeting candidate at Dubai Mall campus desk',
    p_client_time: `${todayStr}T09:10:00+04:00`,
    p_device_hash: 'demo_dev_s3',
  })
  if (fieldRes?.punch_id) manifest.punch_ids.push(fieldRes.punch_id)

  // Joe Tom's 30 working days (service role + recalculate_attendance_day RPC, never touching his password)
  if (joeId) {
    for (let dIdx = 0; dIdx < workingDates.length; dIdx++) {
      const dateStr = workingDates[dIdx]
      if (dIdx === 8) continue // 1 absent day
      const inAt = `${dateStr}T${dIdx % 5 === 0 ? '09:28:00' : '08:52:00'}+04:00`
      const outAt = `${dateStr}T18:04:00+04:00`
      const { data: pIn } = await admin
        .from('attendance_punches')
        .insert({
          user_id: joeId,
          office_id: mainOffice.id,
          kind: 'in',
          at: inAt,
          lat: officeLat,
          lng: officeLng,
          accuracy_m: 10,
          distance_m: 5,
          inside_geofence: true,
          status: 'accepted',
          device_hash: 'demo_dev_joe',
        })
        .select('id')
        .single()
      if (pIn) manifest.punch_ids.push(pIn.id)

      const { data: pOut } = await admin
        .from('attendance_punches')
        .insert({
          user_id: joeId,
          office_id: mainOffice.id,
          kind: 'out',
          at: outAt,
          lat: officeLat,
          lng: officeLng,
          accuracy_m: 10,
          distance_m: 5,
          inside_geofence: true,
          status: 'accepted',
          device_hash: 'demo_dev_joe',
        })
        .select('id')
        .single()
      if (pOut) manifest.punch_ids.push(pOut.id)

      await admin.rpc('recalculate_attendance_day', { p_user_id: joeId, p_date: dateStr })
      const { data: dayRow } = await admin
        .from('attendance_days')
        .select('id')
        .eq('user_id', joeId)
        .eq('date', dateStr)
        .maybeSingle()
      if (dayRow) manifest.day_ids.push(dayRow.id)
    }
  }

  // 1 leave approved, 1 leave pending, 1 regularization pending
  const { data: leave1 } = await users.s4.client
    .from('leave_requests')
    .insert({
      user_id: users.s4.id,
      type: 'annual',
      from_date: workingDates[12],
      to_date: workingDates[12],
      reason: 'Family travel',
    })
    .select('id')
    .single()
  if (leave1) {
    manifest.leave_ids.push(leave1.id)
    await users.lead.client.rpc('approve_leave_request', { p_request_id: leave1.id, p_action: 'approve' })
  }

  const { data: leave2 } = await users.s2.client
    .from('leave_requests')
    .insert({
      user_id: users.s2.id,
      type: 'sick',
      from_date: todayStr,
      to_date: todayStr,
      reason: 'Dental appointment',
    })
    .select('id')
    .single()
  if (leave2) manifest.leave_ids.push(leave2.id)

  const { data: reg1 } = await users.s1.client
    .from('regularization_requests')
    .insert({
      user_id: users.s1.id,
      date: workingDates[1],
      requested_in: `${workingDates[1]}T09:00:00+04:00`,
      requested_out: `${workingDates[1]}T18:00:00+04:00`,
      reason: 'Forgot to punch out after evening parent call',
    })
    .select('id')
    .single()
  if (reg1) manifest.regularization_ids.push(reg1.id)

  // Save demo_seed_runs manifest
  const { data: runRow, error: runErr } = await admin
    .from('demo_seed_runs')
    .insert({ run_label: runTag, manifest })
    .select('id')
    .single()
  if (runErr) throw runErr

  console.log(`\n✅ Demo seed complete! Run ID: ${runRow.id}`)
  console.log('Counts:', {
    universities: manifest.university_ids.length,
    courses: manifest.course_ids.length,
    specializations: manifest.specialization_ids.length,
    demo_users: manifest.user_ids.length,
    students: manifest.student_ids.length,
    enrollments: manifest.enrollment_ids.length,
    payments: paymentsCreated,
    punches: manifest.punch_ids.length,
    holidays: manifest.holiday_ids.length,
    leaves: manifest.leave_ids.length,
    regularizations: manifest.regularization_ids.length,
  })
}

async function main() {
  if (IS_CLEAN) {
    await cleanDemoRuns()
  } else {
    await seedDemo()
  }
}

main().catch((err) => {
  console.error('❌ seed-demo failed:', err)
  process.exit(1)
})
