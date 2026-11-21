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
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/PhoneInput'
import { updateStudentContactAction } from '../actions'
import { Loader2 } from 'lucide-react'

interface EditStudentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: {
    id: string
    full_name: string
    mobile: string
    whatsapp: string | null
    email: string | null
    notes: string | null
  }
}

export function EditStudentModal({
  open,
  onOpenChange,
  student,
}: EditStudentModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(student.full_name)
  const [mobile, setMobile] = useState(student.mobile)
  const [whatsapp, setWhatsapp] = useState(student.whatsapp || student.mobile)
  const [email, setEmail] = useState(student.email || '')
  const [notes, setNotes] = useState(student.notes || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('Full name is required')
      return
    }
    if (!mobile.trim()) {
      setError('Mobile number is required')
      return
    }

    setError(null)

    startTransition(async () => {
      const res = await updateStudentContactAction({
        studentId: student.id,
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        whatsapp: whatsapp.trim() || mobile.trim(),
        email: email.trim() || null,
        notes: notes.trim() || null,
      })

      if (!res.success) {
        setError(res.error || 'Failed to update student')
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
              Edit Student Details
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272]">
              Update contact information and admission notes.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name" className="text-xs font-semibold text-[#0A0A0A]">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 min-h-[44px]"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-mobile" className="text-xs font-semibold text-[#0A0A0A]">
                Mobile Number <span className="text-red-500">*</span>
              </Label>
              <div className="mt-1">
                <PhoneInput
                  value={mobile}
                  onChange={setMobile}
                  defaultCountry="AE"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-whatsapp" className="text-xs font-semibold text-[#0A0A0A]">
                WhatsApp Number
              </Label>
              <div className="mt-1">
                <PhoneInput
                  value={whatsapp}
                  onChange={setWhatsapp}
                  defaultCountry="AE"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-email" className="text-xs font-semibold text-[#0A0A0A]">
                Email Address
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="mt-1 min-h-[44px]"
              />
            </div>

            <div>
              <Label htmlFor="edit-notes" className="text-xs font-semibold text-[#0A0A0A]">
                Notes
              </Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 text-sm"
              />
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
                  <span>Saving…</span>
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
