'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { submitRegularizationAction } from '@/app/(app)/attendance/actions'

interface RequestRegularizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate?: string
  onSubmitted?: () => void
}

export function RequestRegularizationDialog({
  open,
  onOpenChange,
  defaultDate,
  onSubmitted,
}: RequestRegularizationDialogProps) {
  // Current date in Asia/Dubai format YYYY-MM-DD
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())

  const [date, setDate] = useState(defaultDate || '')
  const [inTime, setInTime] = useState('09:00')
  const [outTime, setOutTime] = useState('18:00')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) {
      setError('Please choose the date you wish to regularize.')
      return
    }
    if (date > todayStr) {
      setError('Regularization date cannot be in the future.')
      return
    }
    if (!inTime || !outTime) {
      setError('Please provide both in and out times.')
      return
    }
    if (outTime <= inTime) {
      setError('Out time must be later than in time.')
      return
    }
    if (!reason || reason.trim().length < 3) {
      setError('Please state the reason for regularization (min 3 characters).')
      return
    }

    setSubmitting(true)
    setError(null)

    // Convert date + time to ISO timestamptz in Asia/Dubai
    const requestedIn = `${date}T${inTime}:00+04:00`
    const requestedOut = `${date}T${outTime}:00+04:00`

    const res = await submitRegularizationAction({
      date,
      requestedIn,
      requestedOut,
      reason,
    })

    setSubmitting(false)

    if (res.success) {
      onOpenChange(false)
      setReason('')
      if (onSubmitted) onSubmitted()
    } else {
      setError(res.error || 'Failed to submit regularization request.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Request Attendance Regularization</DialogTitle>
          <DialogDescription>
            Submit a correction for missed punches, machine errors, or approved out-of-office duties.
            Future dates are not permitted.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogBody>
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reg-date" className="text-xs font-semibold text-[#0A0A0A]">
                Attendance Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="reg-date"
                type="date"
                max={todayStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs rounded-xl"
                required
              />
              <p className="text-[10px] text-[#6B7272]">Cannot regularize future dates.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-in-time" className="text-xs font-semibold text-[#0A0A0A]">
                  Requested Punch In <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reg-in-time"
                  type="time"
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                  className="text-xs rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-out-time" className="text-xs font-semibold text-[#0A0A0A]">
                  Requested Punch Out <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reg-out-time"
                  type="time"
                  value={outTime}
                  onChange={(e) => setOutTime(e.target.value)}
                  className="text-xs rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-reason" className="text-xs font-semibold text-[#0A0A0A]">
                Reason for Adjustment <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reg-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why the punch was missed or needs adjustment..."
                rows={3}
                className="text-xs rounded-xl"
                required
              />
              <p className="text-[10px] text-[#6B7272]">Minimum 3 characters required.</p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="border-[#E4E7E7] text-xs h-9 rounded-xl font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !date || date > todayStr}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white text-xs h-9 rounded-xl font-semibold px-4"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
