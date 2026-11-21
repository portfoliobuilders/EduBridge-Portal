'use client'

import React, { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  }

  const handleCourseChange = (cid: string) => {
    setCourseId(cid)
    setSpecializationId('')
    const c = courses.find((item) => item.id === cid)
    if (c && c.default_fee) {
      setTotalFee(c.default_fee.toString())
    } else {
      setTotalFee('')
    }
  }

  const handleSpecChange = (sid: string) => {
    setSpecializationId(sid)
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
    if (isNaN(numFee) || numFee < 0) {
      setError('Total fee must be positive')
      return
    }
    if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > numFee) {
      setError('Discount must be between 0 and total fee')
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#0A0A0A]">
              Add New Enrollment
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272]">
              Enroll this candidate into another degree or university program.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="add-uni" className="text-xs font-semibold text-[#0A0A0A]">
                University <span className="text-red-500">*</span>
              </Label>
              <select
                id="add-uni"
                value={universityId}
                onChange={(e) => handleUniversityChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] focus:border-[#00A57E] min-h-[44px]"
                required
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
              <Label htmlFor="add-course" className="text-xs font-semibold text-[#0A0A0A]">
                Course <span className="text-red-500">*</span>
              </Label>
              <select
                id="add-course"
                disabled={!universityId}
                value={courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] focus:border-[#00A57E] disabled:opacity-50 min-h-[44px]"
                required
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
                <Label htmlFor="add-spec" className="text-xs font-semibold text-[#0A0A0A]">
                  Specialization (optional)
                </Label>
                <select
                  id="add-spec"
                  value={specializationId}
                  onChange={(e) => handleSpecChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] focus:border-[#00A57E] min-h-[44px]"
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
                <Label htmlFor="add-fee" className="text-xs font-semibold text-[#0A0A0A]">
                  Total Fee (AED) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="add-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="12500"
                  value={totalFee}
                  onChange={(e) => setTotalFee(e.target.value)}
                  className="mt-1 tabular-nums font-mono min-h-[44px]"
                  required
                />
              </div>

              <div>
                <Label htmlFor="add-discount" className="text-xs font-semibold text-[#0A0A0A]">
                  Discount (AED)
                </Label>
                <Input
                  id="add-discount"
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

            <div className="rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] p-2.5 flex items-center justify-between text-xs">
              <span className="text-[#6B7272]">Agreed Net Fee:</span>
              <span className="font-semibold text-[#0A0A0A] font-mono">{formatAED(netFee)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="add-intake" className="text-xs font-semibold text-[#0A0A0A]">
                  Intake
                </Label>
                <Input
                  id="add-intake"
                  placeholder="e.g. Spring 2026"
                  value={intake}
                  onChange={(e) => setIntake(e.target.value)}
                  className="mt-1 min-h-[44px]"
                />
              </div>

              <div>
                <Label htmlFor="add-staff" className="text-xs font-semibold text-[#0A0A0A]">
                  Admission Staff <span className="text-red-500">*</span>
                </Label>
                {isOwner ? (
                  <select
                    id="add-staff"
                    value={admissionStaffId}
                    onChange={(e) => setAdmissionStaffId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2 text-xs bg-white text-[#0A0A0A] focus:border-[#00A57E] min-h-[44px]"
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  <span>Adding…</span>
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
