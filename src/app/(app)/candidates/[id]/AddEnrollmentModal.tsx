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
import { Loader2 } from 'lucide-react'
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
  const isDiscountExcessive = numDiscount > numFee
  const netFee = Math.max(0, numFee - numDiscount)

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

  const staffItems = staffList.map((st) => ({
    value: st.id,
    label: st.job_title ? `${st.full_name} · ${st.job_title}` : st.full_name,
  }))

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="add-fee" className="text-xs font-semibold text-[#0A0A0A]">
                  Total Fee (AED) <span className="text-red-500">*</span>
                </Label>
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
                <Label htmlFor="add-discount" className="text-xs font-semibold text-[#0A0A0A]">
                  Discount (AED) (optional)
                </Label>
                <Input
                  id="add-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="mt-1 tabular-nums font-mono"
                />
              </div>
            </div>

            {isDiscountExcessive && (
              <p className="text-xs text-[#C53030] font-medium">
                Discount cannot exceed the total agreed fee.
              </p>
            )}

            <div className="rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] p-3 flex items-center justify-between text-xs">
              <span className="text-[#6B7272]">Agreed Net Fee:</span>
              <span className="font-semibold text-[#0A0A0A] font-mono text-sm">{formatAED(netFee)}</span>
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
