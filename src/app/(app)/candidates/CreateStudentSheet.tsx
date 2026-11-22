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
import { Combobox } from '@/components/ui/combobox'
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
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
} from 'lucide-react'
import { formatAED } from '@/lib/money'
import { COUNTRIES, GUARDIAN_RELATIONS } from '@/lib/constants'
import { calculateVatBreakdown, type VatTreatment, type NoVatReason } from '@/lib/vat'
import { cn } from '@/lib/utils'

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
  job_title?: string | null
}

export interface CreateCandidateSuccessData {
  studentId: string
  studentCode: string
  enrollmentId: string
  fullName: string
  mobile: string
  universityName: string
  courseName: string
  specializationName: string | null
  intake: string | null
  vatType: 'inclusive' | 'exclusive' | 'none'
  vatRate: number
  netFee: number
  totalPayable: number
  balance: number
  guardianName?: string | null
  billingContactName?: string | null
}

interface CreateStudentSheetProps {
  universities: UniversityOption[]
  courses: CourseOption[]
  specializations: SpecializationOption[]
  staffList: StaffOption[]
  currentUserId: string
  isOwner: boolean
  triggerButton?: React.ReactNode
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  initialName?: string
  initialMobile?: string
  companySettings?: {
    vat_enabled?: boolean | null
    vat_rate?: number | null
    default_vat_treatment?: string | null
    no_vat_reason?: string | null
  } | null
  onCandidateCreated?: (created: CreateCandidateSuccessData) => void
}

export function CreateStudentSheet({
  universities,
  courses,
  specializations,
  staffList,
  currentUserId,
  isOwner,
  triggerButton,
  isOpen,
  onOpenChange,
  initialName,
  initialMobile,
  companySettings,
  onCandidateCreated,
}: CreateStudentSheetProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = typeof isOpen === 'boolean'
  const activeOpen = isControlled ? isOpen : internalOpen

  const handleOpenChange = (v: boolean) => {
    if (onOpenChange) onOpenChange(v)
    if (!isControlled) setInternalOpen(v)
    if (v) {
      if (initialName) setFullName(initialName)
      if (initialMobile) setMobile(initialMobile)
    } else {
      resetForm()
    }
  }

  const [step, setStep] = useState<1 | 2>(1)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Step 1: Candidate info
  const [fullName, setFullName] = useState(initialName || '')
  const [mobile, setMobile] = useState(initialMobile || '')
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

  // Collapsed "More details (optional)" section
  const [showMoreDetails, setShowMoreDetails] = useState(false)

  // Guardian details
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelation, setGuardianRelation] = useState<string>('father')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianWhatsapp, setGuardianWhatsapp] = useState('')
  const [sameAsGuardianPhone, setSameAsGuardianPhone] = useState(true)
  const [guardianEmail, setGuardianEmail] = useState('')

  // Billing address
  const [billingContactName, setBillingContactName] = useState('')
  const [billingContactPhone, setBillingContactPhone] = useState('')
  const [billingLine1, setBillingLine1] = useState('')
  const [billingLine2, setBillingLine2] = useState('')
  const [billingCity, setBillingCity] = useState('Dubai')
  const [billingState, setBillingState] = useState('')
  const [billingPostalCode, setBillingPostalCode] = useState('')
  const [billingCountry, setBillingCountry] = useState('United Arab Emirates')

  // Shipping address
  const [sameAsBilling, setSameAsBilling] = useState(true)
  const [shippingContactName, setShippingContactName] = useState('')
  const [shippingContactPhone, setShippingContactPhone] = useState('')
  const [shippingLine1, setShippingLine1] = useState('')
  const [shippingLine2, setShippingLine2] = useState('')
  const [shippingCity, setShippingCity] = useState('Dubai')
  const [shippingState, setShippingState] = useState('')
  const [shippingPostalCode, setShippingPostalCode] = useState('')
  const [shippingCountry, setShippingCountry] = useState('United Arab Emirates')

  // Step 2: Enrollment info
  const [universityId, setUniversityId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [specializationId, setSpecializationId] = useState('')
  const [totalFee, setTotalFee] = useState<string>('')
  const [discount, setDiscount] = useState<string>('0')
  const [intake, setIntake] = useState('')
  const [admissionStaffId, setAdmissionStaffId] = useState(currentUserId)

  // VAT Treatment fields
  const vatEnabled = companySettings?.vat_enabled !== false
  const defaultTreatment = (companySettings?.default_vat_treatment || 'exclusive') as VatTreatment
  const defaultRate = Number(companySettings?.vat_rate ?? 5.0)
  const defaultNoVatReason = (companySettings?.no_vat_reason || 'zero_rated') as NoVatReason

  const [vatTreatment, setVatTreatment] = useState<VatTreatment>(
    vatEnabled ? defaultTreatment : 'none'
  )
  const [vatRate] = useState<number>(defaultRate)
  const [noVatReason, setNoVatReason] = useState<NoVatReason>(defaultNoVatReason)

  // Opening balance fields
  const [openingPaid, setOpeningPaid] = useState<string>('0')
  const [openingPaidNote, setOpeningPaidNote] = useState<string>('')

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
    setShowMoreDetails(false)
    setGuardianName('')
    setGuardianRelation('father')
    setGuardianPhone('')
    setGuardianWhatsapp('')
    setSameAsGuardianPhone(true)
    setGuardianEmail('')
    setBillingContactName('')
    setBillingContactPhone('')
    setBillingLine1('')
    setBillingLine2('')
    setBillingCity('Dubai')
    setBillingState('')
    setBillingPostalCode('')
    setBillingCountry('United Arab Emirates')
    setSameAsBilling(true)
    setShippingContactName('')
    setShippingContactPhone('')
    setShippingLine1('')
    setShippingLine2('')
    setShippingCity('Dubai')
    setShippingState('')
    setShippingPostalCode('')
    setShippingCountry('United Arab Emirates')
    setUniversityId('')
    setCourseId('')
    setSpecializationId('')
    setTotalFee('')
    setDiscount('0')
    setIntake('')
    setAdmissionStaffId(currentUserId)
    setOpeningPaid('0')
    setOpeningPaidNote('')
    setVatTreatment(vatEnabled ? defaultTreatment : 'none')
    setNoVatReason(defaultNoVatReason)
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

  // Calculate Net Fee, VAT Breakdown & Balance
  const numFee = parseFloat(totalFee) || 0
  const numDiscount = parseFloat(discount) || 0
  const effectiveTreatment = vatEnabled ? vatTreatment : 'none'
  const breakdown = calculateVatBreakdown(numFee, numDiscount, effectiveTreatment, vatRate)
  const netFee = breakdown.netFee
  const totalPayable = breakdown.totalPayable
  const numOpeningPaid = parseFloat(openingPaid) || 0
  const balanceDue = Math.max(0, totalPayable - numOpeningPaid)

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
    if (isNaN(numOpeningPaid) || numOpeningPaid < 0) {
      setError('Opening paid must be 0 or greater')
      return
    }
    if (numOpeningPaid > totalPayable) {
      setError('Opening paid cannot exceed total payable (AED ' + totalPayable.toFixed(2) + ')')
      return
    }

    setError(null)

    startTransition(async () => {
      const billingPayload = billingLine1.trim() ? {
        contactName: billingContactName.trim() || null,
        contactPhone: billingContactPhone.trim() || null,
        line1: billingLine1.trim(),
        line2: billingLine2.trim() || null,
        city: billingCity.trim() || 'Dubai',
        state: billingState.trim() || null,
        postalCode: billingPostalCode.trim() || null,
        country: billingCountry.trim() || 'United Arab Emirates',
      } : null

      const shippingPayload = sameAsBilling ? billingPayload : (shippingLine1.trim() ? {
        contactName: shippingContactName.trim() || null,
        contactPhone: shippingContactPhone.trim() || null,
        line1: shippingLine1.trim(),
        line2: shippingLine2.trim() || null,
        city: shippingCity.trim() || 'Dubai',
        state: shippingState.trim() || null,
        postalCode: shippingPostalCode.trim() || null,
        country: shippingCountry.trim() || 'United Arab Emirates',
      } : null)

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
        guardianName: guardianName.trim() || null,
        guardianRelation: guardianName.trim() ? guardianRelation : null,
        guardianPhone: guardianPhone.trim() || null,
        guardianWhatsapp: sameAsGuardianPhone ? (guardianPhone.trim() || null) : (guardianWhatsapp.trim() || null),
        guardianEmail: guardianEmail.trim() || null,
        openingPaid: numOpeningPaid,
        openingPaidNote: openingPaidNote.trim() || null,
        vatTreatment: effectiveTreatment,
        vatRate: vatRate,
        noVatReason: effectiveTreatment === 'none' ? noVatReason : null,
        billingAddress: billingPayload,
        shippingAddress: shippingPayload,
      })

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to create candidate')
        return
      }

      if (onCandidateCreated) {
        const selectedUni = universities.find((u) => u.id === universityId)
        const selectedC = courses.find((c) => c.id === courseId)
        const selectedS = specializations.find((s) => s.id === specializationId)
        onCandidateCreated({
          studentId: res.data.studentId,
          studentCode: res.data.studentCode,
          enrollmentId: res.data.enrollmentId,
          fullName: fullName.trim(),
          mobile: mobile.trim(),
          universityName: selectedUni?.name ?? '',
          courseName: selectedC?.name ?? '',
          specializationName: selectedS?.name ?? null,
          intake: intake.trim() || null,
          vatType: 'inclusive',
          vatRate: 5.0,
          netFee,
          totalPayable: netFee,
          balance: balanceDue,
          guardianName: guardianName.trim() || null,
          billingContactName: billingContactName.trim() || null,
        })
        handleOpenChange(false)
        return
      }

      setCreatedResult(res.data)
    })
  }

  return (
    <>
      {triggerButton ? (
        <span onClick={() => handleOpenChange(true)}>{triggerButton}</span>
      ) : !isControlled ? (
        <Button
          id="btn-create-candidate-trigger"
          onClick={() => handleOpenChange(true)}
          className="bg-[#00A57E] hover:bg-[#00805F] text-white gap-2 font-medium min-h-[44px]"
        >
          <UserPlus className="h-4 w-4" />
          <span>New Candidate</span>
        </Button>
      ) : null}

      <Sheet
        open={activeOpen}
        onOpenChange={handleOpenChange}
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
                  ? 'Candidate Enrolled!'
                  : step === 1
                    ? 'Create New Candidate'
                    : 'Program & Fee Setup'}
              </SheetTitle>
              <SheetDescription className="text-sm text-[#6B7272]">
                {createdResult
                  ? 'Candidate record and enrollment package created atomically.'
                  : step === 1
                    ? 'Fast candidate onboarding for counter staff.'
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
                    Candidate Code: {createdResult.studentCode}
                  </div>
                  <p className="text-xs text-[#6B7272]">
                    Enrollment created with Net Fee: {formatAED(netFee)}
                    {numOpeningPaid > 0 && ` · Opening Paid: ${formatAED(numOpeningPaid)}`}
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <Button
                    id="btn-record-first-payment"
                    onClick={() => {
                      handleOpenChange(false)
                      router.push(`/receipts/new?enrollment=${createdResult.enrollmentId}`)
                    }}
                    className="w-full bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] gap-2 font-medium"
                  >
                    <Receipt className="h-4 w-4" />
                    <span>Record First Payment</span>
                  </Button>

                  <Button
                    id="btn-view-candidate-ledger"
                    variant="outline"
                    onClick={() => {
                      handleOpenChange(false)
                      router.push(`/candidates/${createdResult.studentId}`)
                    }}
                    className="w-full min-h-[44px] gap-2 border-[#E4E7E7]"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <span>View Candidate Ledger</span>
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={resetForm}
                    className="w-full min-h-[44px] text-xs text-muted-foreground"
                  >
                    + Add Another Candidate
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

                {/* STEP 1: Candidate Contact Details */}
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
                          id="mobile"
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
                              <span className="font-semibold">Existing candidate:</span>{' '}
                              {duplicateWarning.fullName} ({duplicateWarning.studentCode})
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenChange(false)
                              router.push(`/candidates/${duplicateWarning.id}`)
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
                        placeholder="candidate@example.com"
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

                    {/* Collapsed "More details (optional)" Section */}
                    <div className="border border-[#E4E7E7] rounded-xl overflow-hidden bg-white mt-4">
                      <button
                        type="button"
                        id="btn-more-details-toggle"
                        onClick={() => setShowMoreDetails((prev) => !prev)}
                        className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-[#0A0A0A] bg-[#F5F6F6] hover:bg-[#EEF0F0] transition"
                      >
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-[#00A57E]" />
                          <span>More details (optional) — Guardian & Addresses</span>
                        </span>
                        {showMoreDetails ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {showMoreDetails && (
                        <div className="p-4 space-y-5 border-t border-[#E4E7E7]">
                          {/* Parent / Guardian Information */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00805F]">
                              <Users className="h-3.5 w-3.5" />
                              <span>Parent / Guardian Information</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="guardianName" className="text-xs font-medium text-[#0A0A0A]">
                                  Guardian Name
                                </Label>
                                <Input
                                  id="guardianName"
                                  placeholder="e.g. Tariq Sharma"
                                  value={guardianName}
                                  onChange={(e) => setGuardianName(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs"
                                />
                              </div>
                              <div>
                                <Label htmlFor="guardianRelation" className="text-xs font-medium text-[#0A0A0A]">
                                  Relationship
                                </Label>
                                <select
                                  id="guardianRelation"
                                  value={guardianRelation}
                                  onChange={(e) => setGuardianRelation(e.target.value)}
                                  className="mt-1 w-full rounded-md border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] min-h-[40px]"
                                >
                                  {GUARDIAN_RELATIONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                      {r.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="guardianPhone" className="text-xs font-medium text-[#0A0A0A]">
                                  Guardian Phone
                                </Label>
                                <div className="mt-1">
                                  <PhoneInput
                                    value={guardianPhone}
                                    onChange={setGuardianPhone}
                                    placeholder="50 987 6543"
                                    defaultCountry="AE"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label htmlFor="guardianEmail" className="text-xs font-medium text-[#0A0A0A]">
                                  Guardian Email
                                </Label>
                                <Input
                                  id="guardianEmail"
                                  type="email"
                                  placeholder="guardian@example.com"
                                  value={guardianEmail}
                                  onChange={(e) => setGuardianEmail(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs"
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <Label htmlFor="guardianWhatsapp" className="text-xs font-medium text-[#0A0A0A]">
                                  Guardian WhatsApp
                                </Label>
                                <label className="flex items-center gap-1.5 text-xs text-[#6B7272] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={sameAsGuardianPhone}
                                    onChange={(e) => setSameAsGuardianPhone(e.target.checked)}
                                    className="rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E]"
                                  />
                                  <span>Same as phone</span>
                                </label>
                              </div>
                              {!sameAsGuardianPhone && (
                                <PhoneInput
                                  value={guardianWhatsapp}
                                  onChange={setGuardianWhatsapp}
                                  placeholder="50 987 6543"
                                  defaultCountry="AE"
                                />
                              )}
                            </div>
                          </div>

                          {/* Billing Address */}
                          <div className="pt-3 border-t border-[#E4E7E7] space-y-3">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00805F]">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>Billing Address</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="billingContactName" className="text-xs font-medium text-[#0A0A0A]">
                                  Contact / Attention Name
                                </Label>
                                <Input
                                  id="billingContactName"
                                  placeholder="e.g. Accounts or Parent"
                                  value={billingContactName}
                                  onChange={(e) => setBillingContactName(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs"
                                />
                              </div>
                              <div>
                                <Label htmlFor="billingContactPhone" className="text-xs font-medium text-[#0A0A0A]">
                                  Contact Phone
                                </Label>
                                <Input
                                  id="billingContactPhone"
                                  placeholder="+971 50 123 4567"
                                  value={billingContactPhone}
                                  onChange={(e) => setBillingContactPhone(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs font-mono"
                                />
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="billingLine1" className="text-xs font-medium text-[#0A0A0A]">
                                Address Line 1
                              </Label>
                              <Input
                                id="billingLine1"
                                placeholder="Building, street, villa/apt no."
                                value={billingLine1}
                                onChange={(e) => setBillingLine1(e.target.value)}
                                className="mt-1 min-h-[40px] text-xs"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="billingLine2" className="text-xs font-medium text-[#0A0A0A]">
                                  Line 2 (optional)
                                </Label>
                                <Input
                                  id="billingLine2"
                                  placeholder="Area, landmark"
                                  value={billingLine2}
                                  onChange={(e) => setBillingLine2(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs"
                                />
                              </div>
                              <div>
                                <Label htmlFor="billingCity" className="text-xs font-medium text-[#0A0A0A]">
                                  City
                                </Label>
                                <Input
                                  id="billingCity"
                                  placeholder="Dubai"
                                  value={billingCity}
                                  onChange={(e) => setBillingCity(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="billingCountry" className="text-xs font-medium text-[#0A0A0A]">
                                  Country
                                </Label>
                                <select
                                  id="billingCountry"
                                  value={billingCountry}
                                  onChange={(e) => setBillingCountry(e.target.value)}
                                  className="mt-1 w-full rounded-md border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] min-h-[40px]"
                                >
                                  {COUNTRIES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label htmlFor="billingPostalCode" className="text-xs font-medium text-[#0A0A0A]">
                                  Postal Code / PO Box
                                </Label>
                                <Input
                                  id="billingPostalCode"
                                  placeholder="e.g. 12345"
                                  value={billingPostalCode}
                                  onChange={(e) => setBillingPostalCode(e.target.value)}
                                  className="mt-1 min-h-[40px] text-xs"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Shipping Address */}
                          <div className="pt-3 border-t border-[#E4E7E7] space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00805F]">
                                <MapPin className="h-3.5 w-3.5" />
                                <span>Shipping / Delivery Address</span>
                              </div>
                              <label className="flex items-center gap-1.5 text-xs text-[#6B7272] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sameAsBilling}
                                  onChange={(e) => setSameAsBilling(e.target.checked)}
                                  className="rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E]"
                                />
                                <span>Same as billing</span>
                              </label>
                            </div>

                            {!sameAsBilling && (
                              <div className="space-y-3 pt-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="shippingContactName" className="text-xs font-medium text-[#0A0A0A]">
                                      Contact Name
                                    </Label>
                                    <Input
                                      id="shippingContactName"
                                      placeholder="Recipient Name"
                                      value={shippingContactName}
                                      onChange={(e) => setShippingContactName(e.target.value)}
                                      className="mt-1 min-h-[40px] text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="shippingContactPhone" className="text-xs font-medium text-[#0A0A0A]">
                                      Contact Phone
                                    </Label>
                                    <Input
                                      id="shippingContactPhone"
                                      placeholder="+971 50 123 4567"
                                      value={shippingContactPhone}
                                      onChange={(e) => setShippingContactPhone(e.target.value)}
                                      className="mt-1 min-h-[40px] text-xs font-mono"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <Label htmlFor="shippingLine1" className="text-xs font-medium text-[#0A0A0A]">
                                    Address Line 1
                                  </Label>
                                  <Input
                                    id="shippingLine1"
                                    placeholder="Building, street, villa/apt no."
                                    value={shippingLine1}
                                    onChange={(e) => setShippingLine1(e.target.value)}
                                    className="mt-1 min-h-[40px] text-xs"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="shippingLine2" className="text-xs font-medium text-[#0A0A0A]">
                                      Line 2 (optional)
                                    </Label>
                                    <Input
                                      id="shippingLine2"
                                      placeholder="Area, landmark"
                                      value={shippingLine2}
                                      onChange={(e) => setShippingLine2(e.target.value)}
                                      className="mt-1 min-h-[40px] text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="shippingCity" className="text-xs font-medium text-[#0A0A0A]">
                                      City
                                    </Label>
                                    <Input
                                      id="shippingCity"
                                      placeholder="Dubai"
                                      value={shippingCity}
                                      onChange={(e) => setShippingCity(e.target.value)}
                                      className="mt-1 min-h-[40px] text-xs"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor="shippingCountry" className="text-xs font-medium text-[#0A0A0A]">
                                      Country
                                    </Label>
                                    <select
                                      id="shippingCountry"
                                      value={shippingCountry}
                                      onChange={(e) => setShippingCountry(e.target.value)}
                                      className="mt-1 w-full rounded-md border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] min-h-[40px]"
                                    >
                                      {COUNTRIES.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <Label htmlFor="shippingPostalCode" className="text-xs font-medium text-[#0A0A0A]">
                                      Postal Code
                                    </Label>
                                    <Input
                                      id="shippingPostalCode"
                                      placeholder="e.g. 12345"
                                      value={shippingPostalCode}
                                      onChange={(e) => setShippingPostalCode(e.target.value)}
                                      className="mt-1 min-h-[40px] text-xs"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 2: Program & Fee Setup */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold text-[#0A0A0A]">
                        University <span className="text-red-500">*</span>
                      </Label>
                      <Combobox
                        id="university"
                        items={universities.map((u) => ({ value: u.id, label: u.name }))}
                        value={universityId}
                        onChange={handleUniversityChange}
                        placeholder="Select University..."
                        searchPlaceholder="Search university..."
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-[#0A0A0A]">
                        Course <span className="text-red-500">*</span>
                      </Label>
                      <Combobox
                        id="course"
                        items={filteredCourses.map((c) => ({
                          value: c.id,
                          label: c.name,
                          sublabel: `${c.level} · AED ${c.default_fee || 0}`,
                        }))}
                        value={courseId}
                        onChange={handleCourseChange}
                        placeholder={!universityId ? 'Select university first' : 'Select Course...'}
                        searchPlaceholder="Search course..."
                        disabled={!universityId}
                        className="mt-1"
                      />
                    </div>

                    {filteredSpecs.length > 0 && (
                      <div>
                        <Label className="text-xs font-semibold text-[#0A0A0A]">
                          Specialization (optional)
                        </Label>
                        <Combobox
                          items={[
                            { value: '', label: 'None / General' },
                            ...filteredSpecs.map((s) => ({
                              value: s.id,
                              label: s.name,
                              sublabel: s.default_fee ? `AED ${s.default_fee}` : undefined,
                            })),
                          ]}
                          value={specializationId}
                          onChange={handleSpecChange}
                          placeholder="Select Specialization..."
                          searchPlaceholder="Search specialization..."
                          className="mt-1"
                        />
                      </div>
                    )}

                    {/* Fee & VAT Treatment */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1">
                          <Label htmlFor="totalFee" className="text-xs font-semibold text-[#0A0A0A]">
                            Tuition Fee (AED) <span className="text-red-500">*</span>
                          </Label>

                          {vatEnabled && (
                            <div className="inline-flex items-center p-0.5 bg-[#F5F6F6] border border-[#E4E7E7] rounded-lg">
                              <button
                                type="button"
                                onClick={() => setVatTreatment('exclusive')}
                                className={cn(
                                  'px-2 py-1 text-[11px] font-medium rounded-md transition-all',
                                  vatTreatment === 'exclusive'
                                    ? 'bg-[#00A57E] text-white shadow-xs font-semibold'
                                    : 'text-[#6B7272] hover:text-[#0A0A0A]'
                                )}
                              >
                                + VAT on top
                              </button>
                              <button
                                type="button"
                                onClick={() => setVatTreatment('inclusive')}
                                className={cn(
                                  'px-2 py-1 text-[11px] font-medium rounded-md transition-all',
                                  vatTreatment === 'inclusive'
                                    ? 'bg-[#00A57E] text-white shadow-xs font-semibold'
                                    : 'text-[#6B7272] hover:text-[#0A0A0A]'
                                )}
                              >
                                Includes VAT
                              </button>
                              <button
                                type="button"
                                onClick={() => setVatTreatment('none')}
                                className={cn(
                                  'px-2 py-1 text-[11px] font-medium rounded-md transition-all',
                                  vatTreatment === 'none'
                                    ? 'bg-[#00A57E] text-white shadow-xs font-semibold'
                                    : 'text-[#6B7272] hover:text-[#0A0A0A]'
                                )}
                              >
                                No VAT
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Input
                              id="totalFee"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={totalFee}
                              onChange={(e) => setTotalFee(e.target.value)}
                              className="tabular-nums font-mono min-h-[40px]"
                            />
                          </div>

                          <div>
                            <Input
                              id="discount"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Scholarship / Discount (AED)"
                              value={discount}
                              onChange={(e) => setDiscount(e.target.value)}
                              className="tabular-nums font-mono min-h-[40px]"
                            />
                          </div>
                        </div>
                      </div>

                      {vatEnabled && vatTreatment === 'none' && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <Label htmlFor="noVatReason" className="text-xs font-medium text-[#6B7272] shrink-0">
                            No-VAT Reason:
                          </Label>
                          <select
                            id="noVatReason"
                            value={noVatReason}
                            onChange={(e) => setNoVatReason(e.target.value as NoVatReason)}
                            className="w-full text-xs h-8 px-2.5 bg-white border border-[#E4E7E7] rounded-lg"
                          >
                            <option value="zero_rated">Zero-rated (0%)</option>
                            <option value="exempt">Exempt</option>
                            <option value="out_of_scope">Out of scope</option>
                          </select>
                        </div>
                      )}

                      {numDiscount > numFee && (
                        <p className="text-xs text-[#C53030] font-medium">
                          Discount cannot exceed total fee.
                        </p>
                      )}

                      {/* Live Breakdown Card */}
                      <div className="rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-[#6B7272]">
                          <span>Net Tuition Fee:</span>
                          <span className="font-mono tabular-nums text-[#0A0A0A] font-medium">{formatAED(netFee)}</span>
                        </div>
                        {vatEnabled && vatTreatment !== 'none' && (
                          <>
                            <div className="flex items-center justify-between text-[#6B7272]">
                              <span>Taxable Amount:</span>
                              <span className="font-mono tabular-nums text-[#0A0A0A]">{formatAED(breakdown.taxable)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[#6B7272]">
                              <span>VAT ({vatRate}%):</span>
                              <span className="font-mono tabular-nums text-[#0A0A0A]">{formatAED(breakdown.vatTotal)}</span>
                            </div>
                          </>
                        )}
                        {vatEnabled && vatTreatment === 'none' && (
                          <div className="flex items-center justify-between text-[#6B7272]">
                            <span>VAT:</span>
                            <span className="font-mono tabular-nums text-[#0A0A0A]">
                              AED 0.00 ({noVatReason === 'zero_rated' ? 'Zero-rated' : noVatReason === 'exempt' ? 'Exempt' : 'Out of scope'})
                            </span>
                          </div>
                        )}
                        <div className="pt-2 border-t border-[#E4E7E7] flex items-center justify-between">
                          <span className="font-semibold text-[#0A0A0A]">Total Payable:</span>
                          <span className="text-base font-bold text-[#00A57E] font-mono tabular-nums">
                            {formatAED(totalPayable)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Opening Balance / Already Paid Before System */}
                    <div className="rounded-xl border border-[#CCEDE5] bg-[#E6F6F2]/60 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#00805F]">
                        <Receipt className="h-4 w-4" />
                        <span>Already paid before this system (opening amount)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="openingPaid" className="text-xs font-medium text-[#0A0A0A]">
                            Opening Amount (AED)
                          </Label>
                          <Input
                            id="openingPaid"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={openingPaid}
                            onChange={(e) => setOpeningPaid(e.target.value)}
                            className="mt-1 tabular-nums font-mono bg-white"
                          />
                        </div>
                        <div>
                          <Label htmlFor="openingPaidNote" className="text-xs font-medium text-[#0A0A0A]">
                            Opening Paid Note
                          </Label>
                          <Input
                            id="openingPaidNote"
                            placeholder="e.g. Receipt #123 from old paper ledger"
                            value={openingPaidNote}
                            onChange={(e) => setOpeningPaidNote(e.target.value)}
                            className="mt-1 bg-white"
                          />
                        </div>
                      </div>
                      {numOpeningPaid > 0 && (
                        <div className="pt-2 border-t border-[#CCEDE5] flex items-center justify-between text-xs">
                          <span className="text-[#00805F] font-medium">Balance Remaining to Pay:</span>
                          <span className="font-semibold text-sm font-mono text-[#0A0A0A]">
                            {formatAED(balanceDue)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="intake" className="text-xs font-semibold text-[#0A0A0A]">
                          Intake (optional)
                        </Label>
                        <Input
                          id="intake"
                          placeholder="e.g. Fall 2026"
                          value={intake}
                          onChange={(e) => setIntake(e.target.value)}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold text-[#0A0A0A]">
                          Admission Staff <span className="text-red-500">*</span>
                        </Label>
                        {isOwner ? (
                          <Combobox
                            items={staffList.map((st) => ({
                              value: st.id,
                              label: st.job_title ? `${st.full_name} · ${st.job_title}` : st.full_name,
                            }))}
                            value={admissionStaffId}
                            onChange={setAdmissionStaffId}
                            placeholder="Select staff member..."
                            searchPlaceholder="Search staff..."
                            className="mt-1"
                          />
                        ) : (
                          <Input
                            disabled
                            value="Assigned to me"
                            className="mt-1 bg-[#F5F6F6] text-[#6B7272]"
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
                    onClick={() => handleOpenChange(false)}
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
                    disabled={isPending || numDiscount > numFee}
                    className="bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] gap-2 px-6 font-medium"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving Candidate…</span>
                      </>
                    ) : (
                      <span>Create Candidate & Enrollment</span>
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

export { CreateStudentSheet as CreateCandidateSheet }
