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
import { Switch } from '@/components/ui/switch'
import { submitLeaveRequestAction } from '@/app/(app)/attendance/actions'

interface RequestLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

export function RequestLeaveDialog({ open, onOpenChange, onSubmitted }: RequestLeaveDialogProps) {
  const [type, setType] = useState<'annual' | 'sick' | 'unpaid' | 'other'>('annual')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromDate || !toDate) {
      setError('Please select both from and to dates.')
      return
    }
    if (toDate < fromDate) {
      setError('To date cannot be earlier than from date.')
      return
    }
    if (!reason || reason.trim().length < 3) {
      setError('Please provide a reason (minimum 3 characters).')
      return
    }

    setSubmitting(true)
    setError(null)

    const res = await submitLeaveRequestAction({
      type,
      fromDate,
      toDate,
      halfDay,
      reason,
    })

    setSubmitting(false)

    if (res.success) {
      onOpenChange(false)
      setReason('')
      if (onSubmitted) onSubmitted()
    } else {
      setError(res.error || 'Failed to submit leave request.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#0A0A0A]">Apply for Leave</DialogTitle>
          <DialogDescription className="text-xs text-[#6B7272]">
            Submit your leave request for admin approval. Approved days will be recorded on your attendance ledger.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="leave-type" className="text-xs font-semibold text-[#0A0A0A]">
              Leave Type
            </Label>
            <select
              id="leave-type"
              value={type}
              onChange={(e) => setType(e.target.value as 'annual' | 'sick' | 'unpaid' | 'other')}
              className="w-full text-xs rounded-xl border border-[#E4E7E7] bg-white px-3 py-2 text-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#00A57E]"
            >
              <option value="annual">Annual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="unpaid">Unpaid Leave</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from-date" className="text-xs font-semibold text-[#0A0A0A]">
                From Date
              </Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  if (!toDate) setToDate(e.target.value)
                }}
                className="text-xs rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="to-date" className="text-xs font-semibold text-[#0A0A0A]">
                To Date
              </Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs rounded-xl"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/50">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]">Half-Day Leave</p>
              <p className="text-[11px] text-[#6B7272]">Deducts half day only</p>
            </div>
            <Switch
              checked={halfDay}
              onCheckedChange={setHalfDay}
              className="data-[state=checked]:bg-[#00A57E]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-reason" className="text-xs font-semibold text-[#0A0A0A]">
              Reason
            </Label>
            <Textarea
              id="leave-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide a brief explanation for your leave request..."
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
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
