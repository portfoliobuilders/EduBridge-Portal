'use client'

import React, { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { addStudentEnrollmentAction } from '../actions'
import { formatAED } from '@/lib/money'
import { calculateVatBreakdown, type VatTreatment, type NoVatReason } from '@/lib/vat'
import { cn } from '@/lib/utils'
import { Loader2, Receipt } from 'lucide-react'
import type {
  UniversityOption,
  CourseOption,
  SpecializationOption,
  StaffOption,
} from '../CreateStudentSheet'

interface AddEnrollmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId: string
  universities: UniversityOption[]
  courses: CourseOption[]
  specializations: SpecializationOption[]
  staffList: StaffOption[]
  currentUserId: string
  isOwner: boolean
  companySettings?: {
    vat_enabled?: boolean | null
    vat_rate?: number | null
    default_vat_treatment?: string | null
    no_vat_reason?: string | null
  } | null
}

export function AddEnrollmentModal({
  open,
  onOpenChange,
  studentId,
  universities,
  courses,
  specializations,
  staffList,
  currentUserId,
  isOwner,
  companySettings,
}: AddEnrollmentModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [universityId, setUniversityId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [specializationId, setSpecializationId] = useState('')
  const [totalFee, setTotalFee] = useState('')
  const [discount, setDiscount] = useState('0')
  const [intake, setIntake] = useState('')
  const [admissionStaffId, setAdmissionStaffId] = useState(currentUserId)

  const vatEnabled = companySettings?.vat_enabled !== false
  const defaultTreatment = (companySettings?.default_vat_treatment || 'exclusive') as VatTreatment
  const defaultRate = Number(companySettings?.vat_rate ?? 5.0)
  const defaultNoVatReason = (companySettings?.no_vat_reason || 'zero_rated') as NoVatReason

  const [vatTreatment, setVatTreatment] = useState<VatTreatment>(
    vatEnabled ? defaultTreatment : 'none'
  )
  const [vatRate] = useState<number>(defaultRate)
  const [noVatReason, setNoVatReason] = useState<NoVatReason>(defaultNoVatReason)
  const [openingPaid, setOpeningPaid] = useState('0')
  const [openingPaidNote, setOpeningPaidNote] = useState('')

  const filteredCourses = courses.filter((c) => c.university_id === universityId)
  const filteredSpecs = specializations.filter((s) => s.course_id === courseId)

  const handleUniversityChange = (uid: string) => {
    setUniversityId(uid)
    setCourseId('')
    setSpecializationId('')
    setTotalFee('')
    setError(null)
  }

  const handleCourseChange = (cid: string) => {
    setCourseId(cid)
    setSpecializationId('')
    setError(null)
    const c = courses.find((item) => item.id === cid)
    if (c && c.default_fee) {
      setTotalFee(c.default_fee.toString())
    } else {
      setTotalFee('')
    }
  }

  const handleSpecChange = (sid: string) => {
    setSpecializationId(sid)
    setError(null)
    const s = specializations.find((item) => item.id === sid)
    if (s && s.default_fee) {
      setTotalFee(s.default_fee.toString())
    } else {
      const c = courses.find((item) => item.id === courseId)
      if (c && c.default_fee) {
        setTotalFee(c.default_fee.toString())
      }
    }
  }

  const numFee = parseFloat(totalFee) || 0
  const numDiscount = parseFloat(discount) || 0
  const effectiveTreatment = vatEnabled ? vatTreatment : 'none'
  const breakdown = calculateVatBreakdown(numFee, numDiscount, effectiveTreatment, vatRate)
  const netFee = breakdown.netFee
  const totalPayable = breakdown.totalPayable
  const numOpeningPaid = parseFloat(openingPaid) || 0
  const isDiscountExcessive = numDiscount > numFee

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!universityId) {
      setError('Please select a university')
      return
    }
    if (!courseId) {
      setError('Please select a course')
      return
    }
    if (isNaN(numFee) || numFee <= 0) {
      setError('Total fee must be positive')
      return
    }
    if (isDiscountExcessive) {
      setError('Discount cannot exceed total fee')
      return
    }
    if (numOpeningPaid > totalPayable) {
      setError('Opening paid cannot exceed total payable (AED ' + totalPayable.toFixed(2) + ')')
      return
    }

    setError(null)

    startTransition(async () => {
      const res = await addStudentEnrollmentAction({
        studentId,
        universityId,
        courseId,
        specializationId: specializationId || null,
        totalFee: numFee,
        discount: numDiscount,
        intake: intake.trim() || null,
        admissionStaffId: isOwner ? admissionStaffId : currentUserId,
        vatTreatment: effectiveTreatment,
        vatRate: vatRate,
        noVatReason: effectiveTreatment === 'none' ? noVatReason : null,
        openingPaid: numOpeningPaid,
        openingPaidNote: openingPaidNote.trim() || null,
      })

      if (!res.success) {
        setError(res.error || 'Failed to add enrollment')
        return
      }

      onOpenChange(false)
    })
  }

  const uniItems = universities.map((u) => ({
    value: u.id,
    label: u.name,
  }))

  const courseItems = filteredCourses.map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: `${c.level} · AED ${c.default_fee || 0}`,
  }))

  const specItems = [
    { value: '', label: 'General / None' },
    ...filteredSpecs.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: s.default_fee ? `AED ${s.default_fee}` : undefined,
    })),
  ]

  const salesStaff = staffList.filter((st) => st.is_sales_team)
  const otherStaff = staffList.filter((st) => !st.is_sales_team)
  const staffItems = [
    ...salesStaff.map((st) => ({
      value: st.id,
      label: `${st.full_name}${st.job_title ? ` · ${st.job_title}` : ''} (Sales Team)`,
    })),
    ...otherStaff.map((st) => ({
      value: st.id,
      label: `${st.full_name}${st.job_title ? ` · ${st.job_title}` : ''} (Other staff)`,
    })),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <DialogHeader>
            <DialogTitle>Add New Enrollment</DialogTitle>
            <DialogDescription>
              Enroll this candidate into an academic programme.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold text-[#0A0A0A]">
                University <span className="text-red-500">*</span>
              </Label>
              <Combobox
                items={uniItems}
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
                items={courseItems}
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
                  items={specItems}
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
                  <Label htmlFor="add-fee" className="text-xs font-semibold text-[#0A0A0A]">
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
                      id="add-fee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={totalFee}
                      onChange={(e) => setTotalFee(e.target.value)}
                      className="mt-1 tabular-nums font-mono"
                      required
                    />
                  </div>

                  <div>
                    <Input
                      id="add-discount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Scholarship / Discount (AED)"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="mt-1 tabular-nums font-mono"
                    />
                  </div>
                </div>
              </div>

              {vatEnabled && vatTreatment === 'none' && (
                <div className="flex items-center gap-2 pt-0.5">
                  <Label htmlFor="add-noVatReason" className="text-xs font-medium text-[#6B7272] shrink-0">
                    No-VAT Reason:
                  </Label>
                  <select
                    id="add-noVatReason"
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

              {isDiscountExcessive && (
                <p className="text-xs text-[#C53030] font-medium">
                  Discount cannot exceed the total agreed fee.
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
            <div className="rounded-xl border border-[#CCEDE5] bg-[#E6F6F2]/60 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#00805F]">
                <Receipt className="h-4 w-4" />
                <span>Already paid before this system (opening amount)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-openingPaid" className="text-xs font-medium text-[#0A0A0A]">
                    Opening Amount (AED)
                  </Label>
                  <Input
                    id="add-openingPaid"
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
                  <Label htmlFor="add-openingPaidNote" className="text-xs font-medium text-[#0A0A0A]">
                    Opening Paid Note
                  </Label>
                  <Input
                    id="add-openingPaidNote"
                    placeholder="e.g. Receipt #123 from old paper ledger"
                    value={openingPaidNote}
                    onChange={(e) => setOpeningPaidNote(e.target.value)}
                    className="mt-1 bg-white text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="add-intake" className="text-xs font-semibold text-[#0A0A0A]">
                  Intake (optional)
                </Label>
                <Input
                  id="add-intake"
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
                    items={staffItems}
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
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[#E4E7E7]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || isDiscountExcessive}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white min-w-[140px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  <span>Enrolling…</span>
                </>
              ) : (
                'Add Enrollment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
