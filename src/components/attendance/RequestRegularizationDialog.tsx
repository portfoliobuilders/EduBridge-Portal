'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#0A0A0A]">
            Request Attendance Regularization
          </DialogTitle>
          <DialogDescription className="text-xs text-[#6B7272]">
            Submit a correction for missed punches, machine errors, or approved out-of-office duties.
            Once approved by an administrator, your hours and day status will be updated automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reg-date" className="text-xs font-semibold text-[#0A0A0A]">
              Attendance Date
            </Label>
            <Input
              id="reg-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs rounded-xl"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-in-time" className="text-xs font-semibold text-[#0A0A0A]">
                Requested Punch In
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
                Requested Punch Out
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
              Reason for Correction
            </Label>
            <Textarea
              id="reg-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Forgot to punch out due to offsite candidate consultation..."
              rows={3}
              className="text-xs rounded-xl"
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="text-xs bg-[#00A57E] hover:bg-[#00805F] text-white"
            >
              {submitting ? 'Submitting...' : 'Submit Regularization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
