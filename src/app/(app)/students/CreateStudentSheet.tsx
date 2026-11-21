'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/PhoneInput'
import {
  createStudentAction,
  checkDuplicateMobileAction,
} from './actions'
import {
  UserPlus,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { formatAED } from '@/lib/money'

export interface UniversityOption {
  id: string
  name: string
}

export interface CourseOption {
  id: string
  university_id: string
  name: string
  level: string
  default_fee: number | null
}

export interface SpecializationOption {
  id: string
  course_id: string
  name: string
  default_fee: number | null
}

export interface StaffOption {
  id: string
  full_name: string
  role: string
}

interface CreateStudentSheetProps {
  universities: UniversityOption[]
  courses: CourseOption[]
  specializations: SpecializationOption[]
  staffList: StaffOption[]
  currentUserId: string
  isOwner: boolean
  triggerButton?: React.ReactNode
}

export function CreateStudentSheet({
  universities,
  courses,
  specializations,
  staffList,
  currentUserId,
  isOwner,
  triggerButton,
}: CreateStudentSheetProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Step 1: Student info
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [sameAsMobile, setSameAsMobile] = useState(true)
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<{
    id: string
    fullName: string
    studentCode: string
  } | null>(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)

  // Step 2: Enrollment info
  const [universityId, setUniversityId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [specializationId, setSpecializationId] = useState('')
  const [totalFee, setTotalFee] = useState<string>('')
  const [discount, setDiscount] = useState<string>('0')
  const [intake, setIntake] = useState('')
  const [admissionStaffId, setAdmissionStaffId] = useState(currentUserId)

  // Success state
  const [createdResult, setCreatedResult] = useState<{
    studentId: string
    studentCode: string
    enrollmentId: string
  } | null>(null)

  // Filter courses by selected university
  const filteredCourses = courses.filter((c) => c.university_id === universityId)
  // Filter specializations by selected course
  const filteredSpecs = specializations.filter((s) => s.course_id === courseId)

  // Reset form
  const resetForm = () => {
    setStep(1)
    setFullName('')
    setMobile('')
    setWhatsapp('')
    setSameAsMobile(true)
    setEmail('')
    setNotes('')
    setDuplicateWarning(null)
    setUniversityId('')
    setCourseId('')
    setSpecializationId('')
    setTotalFee('')
    setDiscount('0')
    setIntake('')
    setAdmissionStaffId(currentUserId)
    setError(null)
    setCreatedResult(null)
  }

  // Handle mobile blur duplicate check
  const handleMobileBlur = async () => {
    if (!mobile || mobile.trim().length < 7) {
      setDuplicateWarning(null)
      return
    }

    setCheckingDuplicate(true)
    try {
      const res = await checkDuplicateMobileAction(mobile)
      if (res.exists && res.student) {
        setDuplicateWarning(res.student)
      } else {
        setDuplicateWarning(null)
      }
    } catch {
      setDuplicateWarning(null)
    } finally {
      setCheckingDuplicate(false)
    }
  }

  // Handle university change
  const handleUniversityChange = (uid: string) => {
    setUniversityId(uid)
    setCourseId('')
    setSpecializationId('')
    setTotalFee('')
  }

  // Handle course change
  const handleCourseChange = (cid: string) => {
    setCourseId(cid)
    setSpecializationId('')
    const selectedCourse = courses.find((c) => c.id === cid)
    if (selectedCourse && selectedCourse.default_fee) {
      setTotalFee(selectedCourse.default_fee.toString())
    } else {
      setTotalFee('')
    }
  }

  // Handle specialization change
  const handleSpecChange = (sid: string) => {
    setSpecializationId(sid)
    const selectedSpec = specializations.find((s) => s.id === sid)
    if (selectedSpec && selectedSpec.default_fee) {
      setTotalFee(selectedSpec.default_fee.toString())
    } else {
      const selectedCourse = courses.find((c) => c.id === courseId)
      if (selectedCourse && selectedCourse.default_fee) {
        setTotalFee(selectedCourse.default_fee.toString())
      }
    }
  }

  // Validate step 1 before going to step 2
  const handleNextStep = () => {
    if (!fullName.trim()) {
      setError('Full name is required')
      return
    }
    if (!mobile.trim() || mobile.trim().length < 7) {
      setError('A valid mobile number is required')
      return
    }
    setError(null)
    setStep(2)
  }

  // Calculate Net Fee
  const numFee = parseFloat(totalFee) || 0
  const numDiscount = parseFloat(discount) || 0
  const netFee = Math.max(0, numFee - numDiscount)

  // Submit creation
  const handleSubmit = () => {
    if (!universityId) {
      setError('Please select a university')
      return
    }
    if (!courseId) {
      setError('Please select a course')
      return
    }
    if (isNaN(numFee) || numFee < 0) {
      setError('Total fee must be a positive number')
      return
    }
    if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > numFee) {
      setError('Discount must be between 0 and total fee')
      return
    }

    setError(null)

    startTransition(async () => {
      const res = await createStudentAction({
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        whatsapp: sameAsMobile ? mobile.trim() : whatsapp.trim() || mobile.trim(),
        email: email.trim() || null,
        notes: notes.trim() || null,
        universityId,
        courseId,
        specializationId: specializationId || null,
        totalFee: numFee,
        discount: numDiscount,
        intake: intake.trim() || null,
        admissionStaffId: isOwner ? admissionStaffId : currentUserId,
      })

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to create student')
        return
      }

      setCreatedResult(res.data)
    })
  }

  return (
    <>
      {triggerButton ? (
        <span onClick={() => setOpen(true)}>{triggerButton}</span>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="bg-[#00A57E] hover:bg-[#00805F] text-white gap-2 font-medium min-h-[44px]"
        >
          <UserPlus className="h-4 w-4" />
          <span>New Student</span>
        </Button>
      )}

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) resetForm()
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto p-6 sm:p-8 flex flex-col justify-between"
        >
        <div>
          <SheetHeader className="text-left mb-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#00A57E]">
                Admissions Desk
              </span>
              {!createdResult && (
                <span className="text-xs font-medium text-muted-foreground">
                  Step {step} of 2
                </span>
              )}
            </div>
            <SheetTitle className="text-xl font-semibold text-[#0A0A0A]">
              {createdResult
                ? 'Student Enrolled!'
                : step === 1
                ? 'Create New Student'
                : 'Program & Fee Setup'}
            </SheetTitle>
            <SheetDescription className="text-sm text-[#6B7272]">
              {createdResult
                ? 'Student record and enrollment package created atomically.'
                : step === 1
                ? 'Fast student onboarding for counter staff.'
                : 'Assign university, course, and agreed tuition fee package.'}
            </SheetDescription>
          </SheetHeader>

          {/* Success Screen */}
          {createdResult ? (
            <div className="space-y-6 py-4">
              <div className="rounded-2xl bg-[#E6F6F2] border border-[#CCEDE5] p-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#00A57E] text-white">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-[#0A0A0A]">
                  {fullName}
                </h3>
                <div className="inline-block px-3 py-1 bg-white rounded-full text-xs font-mono font-semibold text-[#00805F] border border-[#CCEDE5]">
                  Student Code: {createdResult.studentCode}
                </div>
                <p className="text-xs text-[#6B7272]">
                  Enrollment created with Net Fee: {formatAED(netFee)}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  onClick={() => {
                    setOpen(false)
                    router.push(`/receipts/new?enrollment=${createdResult.enrollmentId}`)
                  }}
                  className="w-full bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] gap-2 font-medium"
                >
                  <Receipt className="h-4 w-4" />
                  <span>Record First Payment</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false)
                    router.push(`/students/${createdResult.studentId}`)
                  }}
                  className="w-full min-h-[44px] gap-2 border-[#E4E7E7]"
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  <span>View Student Ledger</span>
                </Button>

                <Button
                  variant="ghost"
                  onClick={resetForm}
                  className="w-full min-h-[44px] text-xs text-muted-foreground"
                >
                  + Add Another Student
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* STEP 1: Student Contact Details */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fullName" className="text-xs font-semibold text-[#0A0A0A]">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="fullName"
                      placeholder="e.g. Rahul Sharma"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1 min-h-[44px]"
                      autoFocus
                    />
                  </div>

                  <div>
                    <Label htmlFor="mobile" className="text-xs font-semibold text-[#0A0A0A]">
                      Mobile Number <span className="text-red-500">*</span>
                    </Label>
                    <div className="mt-1">
                      <PhoneInput
                        value={mobile}
                        onChange={(val) => {
                          setMobile(val)
                          if (duplicateWarning) setDuplicateWarning(null)
                        }}
                        onBlur={handleMobileBlur}
                        placeholder="50 123 4567"
                        defaultCountry="AE"
                      />
                    </div>
                    {checkingDuplicate && (
                      <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking duplicate...
                      </p>
                    )}

                    {/* Duplicate Warning Guard */}
                    {duplicateWarning && (
                      <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start justify-between gap-3 text-xs text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Existing student:</span>{' '}
                            {duplicateWarning.fullName} ({duplicateWarning.studentCode})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            router.push(`/students/${duplicateWarning.id}`)
                          }}
                          className="shrink-0 font-semibold underline text-[#00805F] hover:text-[#005c44]"
                        >
                          Open instead?
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="whatsapp" className="text-xs font-semibold text-[#0A0A0A]">
                        WhatsApp
                      </Label>
                      <label className="flex items-center gap-1.5 text-xs text-[#6B7272] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sameAsMobile}
                          onChange={(e) => setSameAsMobile(e.target.checked)}
                          className="rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E]"
                        />
                        <span>Same as mobile</span>
                      </label>
                    </div>
                    {!sameAsMobile && (
                      <PhoneInput
                        value={whatsapp}
                        onChange={setWhatsapp}
                        placeholder="50 123 4567"
                        defaultCountry="AE"
                      />
                    )}
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-xs font-semibold text-[#0A0A0A]">
                      Email Address (optional)
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="student@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 min-h-[44px]"
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes" className="text-xs font-semibold text-[#0A0A0A]">
                      Admissions Notes (optional)
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Special background, referrals, notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Program & Fee Setup */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="university" className="text-xs font-semibold text-[#0A0A0A]">
                      University <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="university"
                      value={universityId}
                      onChange={(e) => handleUniversityChange(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2.5 text-sm bg-white text-[#0A0A0A] focus:border-[#00A57E] focus:ring-1 focus:ring-[#00A57E] min-h-[44px]"
                    >
                      <option value="">Select University...</option>
                      {universities.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="course" className="text-xs font-semibold text-[#0A0A0A]">
                      Course <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="course"
                      disabled={!universityId}
                      value={courseId}
                      onChange={(e) => handleCourseChange(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2.5 text-sm bg-white text-[#0A0A0A] focus:border-[#00A57E] focus:ring-1 focus:ring-[#00A57E] disabled:opacity-50 min-h-[44px]"
                    >
                      <option value="">
                        {!universityId ? 'Select university first' : 'Select Course...'}
                      </option>
                      {filteredCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.level}) {c.default_fee ? `· AED ${c.default_fee}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {filteredSpecs.length > 0 && (
                    <div>
                      <Label htmlFor="specialization" className="text-xs font-semibold text-[#0A0A0A]">
                        Specialization (optional)
                      </Label>
                      <select
                        id="specialization"
                        value={specializationId}
                        onChange={(e) => handleSpecChange(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2.5 text-sm bg-white text-[#0A0A0A] focus:border-[#00A57E] focus:ring-1 focus:ring-[#00A57E] min-h-[44px]"
                      >
                        <option value="">None / General</option>
                        {filteredSpecs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.default_fee ? `· AED ${s.default_fee}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="totalFee" className="text-xs font-semibold text-[#0A0A0A]">
                        Total Fee (AED) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="totalFee"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="12500"
                        value={totalFee}
                        onChange={(e) => setTotalFee(e.target.value)}
                        className="mt-1 tabular-nums font-mono min-h-[44px]"
                      />
                    </div>

                    <div>
                      <Label htmlFor="discount" className="text-xs font-semibold text-[#0A0A0A]">
                        Discount (AED)
                      </Label>
                      <Input
                        id="discount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        className="mt-1 tabular-nums font-mono min-h-[44px]"
                      />
                    </div>
                  </div>

                  {/* Net Fee Display Card */}
                  <div className="rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] p-3.5 flex items-center justify-between text-xs">
                    <span className="text-[#6B7272] font-medium">Agreed Net Fee:</span>
                    <span className="text-base font-semibold text-[#0A0A0A] tabular-nums font-mono">
                      {formatAED(netFee)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="intake" className="text-xs font-semibold text-[#0A0A0A]">
                        Intake
                      </Label>
                      <Input
                        id="intake"
                        placeholder="e.g. Fall 2026"
                        value={intake}
                        onChange={(e) => setIntake(e.target.value)}
                        className="mt-1 min-h-[44px]"
                      />
                    </div>

                    <div>
                      <Label htmlFor="admissionStaff" className="text-xs font-semibold text-[#0A0A0A]">
                        Admission Staff <span className="text-red-500">*</span>
                      </Label>
                      {isOwner ? (
                        <select
                          id="admissionStaff"
                          value={admissionStaffId}
                          onChange={(e) => setAdmissionStaffId(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2.5 text-sm bg-white text-[#0A0A0A] focus:border-[#00A57E] min-h-[44px]"
                        >
                          {staffList.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.full_name} ({st.role})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          disabled
                          value="Assigned to me (Staff)"
                          className="mt-1 bg-muted/40 min-h-[44px]"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        {!createdResult && (
          <div className="pt-6 border-t border-[#E4E7E7] flex items-center justify-between gap-3">
            {step === 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="min-h-[44px] px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleNextStep}
                  className="bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] gap-2 px-6 font-medium"
                >
                  <span>Next: Program & Fee</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={isPending}
                  className="min-h-[44px] gap-1 px-4"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] gap-2 px-6 font-medium"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Student…</span>
                    </>
                  ) : (
                    <span>Create Student & Enrollment</span>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
