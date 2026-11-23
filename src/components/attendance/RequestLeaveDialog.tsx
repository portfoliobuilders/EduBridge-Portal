'use client'

import React, { useState, useMemo } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Calendar } from 'lucide-react'
import { submitLeaveRequestAction } from '@/app/(app)/attendance/actions'
import { calculateLeaveWorkingDays } from '@/lib/attendance/utils'

interface RequestLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
  weeklyOff?: number[]
  holidays?: (string | { date: string })[]
}

export function RequestLeaveDialog({
  open,
  onOpenChange,
  onSubmitted,
  weeklyOff = [0],
  holidays = [],
}: RequestLeaveDialogProps) {
  const [type, setType] = useState<'annual' | 'sick' | 'unpaid' | 'other'>('annual')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Compute working days from configured weekly off days and holidays
  const workingDays = useMemo(() => {
    return calculateLeaveWorkingDays({
      fromDate,
      toDate,
      weeklyOff,
      holidays,
      halfDay,
    })
  }, [fromDate, toDate, halfDay, weeklyOff, holidays])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromDate || !toDate) {
      setError('Please select both from and to dates.')
      return
    }
    if (toDate < fromDate) {
      setError('To Date cannot be earlier than From Date.')
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
          <DialogDescription>
            Submit your leave request for admin approval. Approved days will be recorded on your attendance ledger.
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
              <Label htmlFor="leave-type" className="text-xs font-semibold text-[#0A0A0A]">
                Leave Type <span className="text-destructive">*</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="from-date" className="text-xs font-semibold text-[#0A0A0A]">
                  From Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                    if (!toDate || toDate < e.target.value) {
                      setToDate(e.target.value)
                    }
                  }}
                  className="text-xs rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="to-date" className="text-xs font-semibold text-[#0A0A0A]">
                  To Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="to-date"
                  type="date"
                  min={fromDate || undefined}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-xs rounded-xl"
                  required
                />
              </div>
            </div>

            {/* Working days pill */}
            {fromDate && toDate && toDate >= fromDate && workingDays > 0 && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#E6F6F2] border border-[#CCEDE5] text-[#00805F] text-xs font-semibold animate-in fade-in">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>
                  Duration: {workingDays} working {workingDays === 1 ? 'day' : 'days'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/60">
              <div>
                <p className="text-xs font-semibold text-[#0A0A0A]">Half-Day Leave</p>
                <p className="text-[11px] text-[#6B7272]">Counts as 0.5 days off</p>
              </div>
              <Switch
                checked={halfDay}
                onCheckedChange={setHalfDay}
                className="data-[state=checked]:bg-[#00A57E]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leave-reason" className="text-xs font-semibold text-[#0A0A0A]">
                Reason / Note <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="leave-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the purpose of your leave..."
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
              disabled={submitting || !fromDate || !toDate || toDate < fromDate}
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
