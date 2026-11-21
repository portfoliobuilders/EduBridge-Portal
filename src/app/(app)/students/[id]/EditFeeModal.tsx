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
import { updateEnrollmentFeeAction } from '../actions'
import { formatAED } from '@/lib/money'
import { Loader2, AlertCircle } from 'lucide-react'

interface EditFeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enrollmentId: string
  currentTotalFee: number
  currentDiscount: number
  totalPaid: number
  paymentCount: number
}

export function EditFeeModal({
  open,
  onOpenChange,
  enrollmentId,
  currentTotalFee,
  currentDiscount,
  totalPaid,
  paymentCount,
}: EditFeeModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [totalFee, setTotalFee] = useState(currentTotalFee.toString())
  const [discount, setDiscount] = useState(currentDiscount.toString())
  const [reason, setReason] = useState('')

  const hasPayments = paymentCount > 0 || totalPaid > 0

  const numFee = parseFloat(totalFee) || 0
  const numDiscount = parseFloat(discount) || 0
  const netFee = Math.max(0, numFee - numDiscount)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isNaN(numFee) || numFee < 0) {
      setError('Total fee must be positive')
      return
    }
    if (isNaN(numDiscount) || numDiscount < 0 || numDiscount > numFee) {
      setError('Discount must be between 0 and total fee')
      return
    }

    if (hasPayments && !reason.trim()) {
      setError('A reason is mandatory when modifying fee structure with existing payments.')
      return
    }

    setError(null)

    startTransition(async () => {
      const res = await updateEnrollmentFeeAction({
        enrollmentId,
        totalFee: numFee,
        discount: numDiscount,
        reason: reason.trim() || null,
      })

      if (!res.success) {
        // Show SQL error verbatim (e.g. Net fee cannot be reduced below total already paid)
        setError(res.error || 'Failed to update fee package')
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
              Adjust Fee Package (Owner Only)
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272]">
              Modify total tuition fee or scholarship discount. Net fee cannot be reduced below AED {formatAED(totalPaid)}.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="font-mono text-xs">{error}</div>
            </div>
          )}

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fee-total" className="text-xs font-semibold text-[#0A0A0A]">
                  Total Fee (AED) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fee-total"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalFee}
                  onChange={(e) => setTotalFee(e.target.value)}
                  className="mt-1 font-mono tabular-nums min-h-[44px]"
                  required
                />
              </div>

              <div>
                <Label htmlFor="fee-discount" className="text-xs font-semibold text-[#0A0A0A]">
                  Discount (AED)
                </Label>
                <Input
                  id="fee-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="mt-1 font-mono tabular-nums min-h-[44px]"
                />
              </div>
            </div>

            {/* Calculations preview */}
            <div className="rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-[#6B7272]">
                <span>Total Paid to Date:</span>
                <span className="font-mono font-semibold text-[#0A0A0A]">{formatAED(totalPaid)}</span>
              </div>
              <div className="flex justify-between font-semibold text-[#0A0A0A] pt-1 border-t border-[#E4E7E7]">
                <span>New Net Fee:</span>
                <span className="font-mono">{formatAED(netFee)}</span>
              </div>
              <div className="flex justify-between font-semibold text-[#00805F]">
                <span>New Balance Due:</span>
                <span className="font-mono">{formatAED(Math.max(0, netFee - totalPaid))}</span>
              </div>
            </div>

            {/* Reason is required if payments exist */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="fee-reason" className="text-xs font-semibold text-[#0A0A0A]">
                  Reason for Fee Adjustment {hasPayments && <span className="text-red-500">*</span>}
                </Label>
                {hasPayments && (
                  <span className="text-[10px] text-amber-600 font-semibold uppercase">
                    Mandatory ({paymentCount} payments recorded)
                  </span>
                )}
              </div>
              <Textarea
                id="fee-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  hasPayments
                    ? 'State official reason for adjusting fee after payments (logged to audit trail)...'
                    : 'Optional reason for adjustment...'
                }
                rows={2}
                required={hasPayments}
                className="mt-1 text-xs"
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
                'Update Fee Package'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
