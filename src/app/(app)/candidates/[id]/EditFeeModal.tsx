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
import { Textarea } from '@/components/ui/textarea'
import { updateEnrollmentFeeAction } from '../actions'
import { formatAED } from '@/lib/money'
import { Loader2, AlertCircle, Lock } from 'lucide-react'
import { calculateVatBreakdown, type VatTreatment, type NoVatReason } from '@/lib/vat'
import { cn } from '@/lib/utils'

interface EditFeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enrollmentId: string
  currentTotalFee: number
  currentDiscount: number
  totalPaid: number
  paymentCount: number
  currentVatTreatment?: 'exclusive' | 'inclusive' | 'none'
  currentVatRate?: number
  currentNoVatReason?: 'zero_rated' | 'exempt' | 'out_of_scope' | null
  vatEnabled?: boolean
}

export function EditFeeModal({
  open,
  onOpenChange,
  enrollmentId,
  currentTotalFee,
  currentDiscount,
  totalPaid,
  paymentCount,
  currentVatTreatment = 'exclusive',
  currentVatRate = 5.0,
  currentNoVatReason = 'zero_rated',
  vatEnabled = true,
}: EditFeeModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [totalFee, setTotalFee] = useState(currentTotalFee.toString())
  const [discount, setDiscount] = useState(currentDiscount.toString())
  const [reason, setReason] = useState('')

  const hasPayments = paymentCount > 0 || totalPaid > 0
  const vatLocked = hasPayments

  const [vatTreatment, setVatTreatment] = useState<VatTreatment>(
    vatEnabled ? currentVatTreatment : 'none'
  )
  const [vatRate] = useState<number>(Number(currentVatRate ?? 5.0))
  const [noVatReason, setNoVatReason] = useState<NoVatReason>(
    (currentNoVatReason || 'zero_rated') as NoVatReason
  )

  const numFee = parseFloat(totalFee) || 0
  const numDiscount = parseFloat(discount) || 0
  const effectiveTreatment = vatEnabled ? vatTreatment : 'none'
  const breakdown = calculateVatBreakdown(numFee, numDiscount, effectiveTreatment, vatRate)
  const netFee = breakdown.netFee
  const totalPayable = breakdown.totalPayable
  const isDiscountExcessive = numDiscount > numFee

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isNaN(numFee) || numFee <= 0) {
      setError('Total fee must be positive')
      return
    }
    if (isDiscountExcessive) {
      setError('Discount cannot exceed total fee')
      return
    }

    if (totalPayable < totalPaid) {
      setError(
        `Total payable (${formatAED(totalPayable)}) cannot be reduced below total amount already paid (${formatAED(totalPaid)}).`
      )
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
        vatTreatment: !vatLocked ? effectiveTreatment : undefined,
        noVatReason: !vatLocked && effectiveTreatment === 'none' ? noVatReason : undefined,
      })

      if (!res.success) {
        setError(res.error || 'Failed to update fee package')
        return
      }

      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <DialogHeader>
            <DialogTitle>Adjust Fee Package</DialogTitle>
            <DialogDescription>
              Modify total tuition fee or scholarship discount. Total payable cannot be reduced below AED {formatAED(totalPaid)}.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <div className="font-mono text-xs">{error}</div>
              </div>
            )}

            {/* Fee & VAT Treatment */}
            <div className="space-y-3">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1">
                  <Label htmlFor="fee-total" className="text-xs font-semibold text-[#0A0A0A]">
                    Tuition Fee (AED) <span className="text-red-500">*</span>
                  </Label>

                  {vatEnabled && (
                    <div className="flex items-center gap-1.5">
                      {vatLocked && (
                        <div
                          className="flex items-center gap-1 text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200"
                          title="VAT treatment is locked because payments exist for this enrollment."
                        >
                          <Lock className="h-3 w-3 text-amber-600" />
                          <span>Locked</span>
                        </div>
                      )}
                      <div className="inline-flex items-center p-0.5 bg-[#F5F6F6] border border-[#E4E7E7] rounded-lg">
                        <button
                          type="button"
                          disabled={vatLocked}
                          onClick={() => setVatTreatment('exclusive')}
                          className={cn(
                            'px-2 py-1 text-[11px] font-medium rounded-md transition-all',
                            vatTreatment === 'exclusive'
                              ? 'bg-[#00A57E] text-white shadow-xs font-semibold'
                              : 'text-[#6B7272] hover:text-[#0A0A0A]',
                            vatLocked && 'opacity-60 cursor-not-allowed'
                          )}
                        >
                          + VAT on top
                        </button>
                        <button
                          type="button"
                          disabled={vatLocked}
                          onClick={() => setVatTreatment('inclusive')}
                          className={cn(
                            'px-2 py-1 text-[11px] font-medium rounded-md transition-all',
                            vatTreatment === 'inclusive'
                              ? 'bg-[#00A57E] text-white shadow-xs font-semibold'
                              : 'text-[#6B7272] hover:text-[#0A0A0A]',
                            vatLocked && 'opacity-60 cursor-not-allowed'
                          )}
                        >
                          Includes VAT
                        </button>
                        <button
                          type="button"
                          disabled={vatLocked}
                          onClick={() => setVatTreatment('none')}
                          className={cn(
                            'px-2 py-1 text-[11px] font-medium rounded-md transition-all',
                            vatTreatment === 'none'
                              ? 'bg-[#00A57E] text-white shadow-xs font-semibold'
                              : 'text-[#6B7272] hover:text-[#0A0A0A]',
                            vatLocked && 'opacity-60 cursor-not-allowed'
                          )}
                        >
                          No VAT
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input
                      id="fee-total"
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalFee}
                      onChange={(e) => setTotalFee(e.target.value)}
                      className="mt-1 font-mono tabular-nums"
                      required
                    />
                  </div>

                  <div>
                    <Input
                      id="fee-discount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="mt-1 font-mono tabular-nums"
                      placeholder="Scholarship / Discount (AED)"
                    />
                  </div>
                </div>
              </div>

              {vatEnabled && vatTreatment === 'none' && !vatLocked && (
                <div className="flex items-center gap-2 pt-0.5">
                  <Label htmlFor="edit-noVatReason" className="text-xs font-medium text-[#6B7272] shrink-0">
                    No-VAT Reason:
                  </Label>
                  <select
                    id="edit-noVatReason"
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
                  Discount cannot exceed total fee.
                </p>
              )}

              {/* Calculations preview / Live Breakdown */}
              <div className="rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] p-3 text-xs space-y-1.5">
                <div className="flex justify-between text-[#6B7272]">
                  <span>Total Paid to Date:</span>
                  <span className="font-mono font-semibold text-[#0A0A0A]">{formatAED(totalPaid)}</span>
                </div>
                <div className="flex justify-between text-[#6B7272]">
                  <span>Net Tuition Fee:</span>
                  <span className="font-mono">{formatAED(netFee)}</span>
                </div>
                {vatEnabled && vatTreatment !== 'none' && (
                  <>
                    <div className="flex justify-between text-[#6B7272]">
                      <span>Taxable Amount:</span>
                      <span className="font-mono">{formatAED(breakdown.taxable)}</span>
                    </div>
                    <div className="flex justify-between text-[#6B7272]">
                      <span>VAT ({vatRate}%):</span>
                      <span className="font-mono">{formatAED(breakdown.vatTotal)}</span>
                    </div>
                  </>
                )}
                {vatEnabled && vatTreatment === 'none' && (
                  <div className="flex justify-between text-[#6B7272]">
                    <span>VAT:</span>
                    <span className="font-mono">
                      AED 0.00 ({noVatReason === 'zero_rated' ? 'Zero-rated' : noVatReason === 'exempt' ? 'Exempt' : 'Out of scope'})
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#0A0A0A] pt-1.5 border-t border-[#E4E7E7]">
                  <span>Total Payable:</span>
                  <span className="font-mono text-sm text-[#00A57E]">{formatAED(totalPayable)}</span>
                </div>
                <div className="flex justify-between font-semibold text-[#B7791F] pt-0.5">
                  <span>New Balance Due:</span>
                  <span className="font-mono">{formatAED(Math.max(0, totalPayable - totalPaid))}</span>
                </div>
              </div>
            </div>

            {/* Reason is required if payments exist */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="fee-reason" className="text-xs font-semibold text-[#0A0A0A]">
                  Reason for Fee Change {hasPayments && <span className="text-red-500">*</span>}
                </Label>
                {hasPayments && (
                  <span className="text-[10px] text-amber-700 font-medium">
                    Mandatory for audited ledger
                  </span>
                )}
              </div>
              <Textarea
                id="fee-reason"
                placeholder={
                  hasPayments
                    ? 'e.g. Scholarship approved by Academic Board, Waiver agreed on email...'
                    : 'Optional reason for this fee change...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1"
                required={hasPayments}
              />
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
              className="bg-[#00A57E] hover:bg-[#00805F] text-white min-w-[150px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  <span>Updating…</span>
                </>
              ) : (
                'Save Fee Structure'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
