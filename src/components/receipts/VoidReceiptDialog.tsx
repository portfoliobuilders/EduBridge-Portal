'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { voidPaymentAction } from '@/app/(app)/receipts/actions'

interface VoidReceiptDialogProps {
  paymentId: string
  receiptNo: string
  amount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VoidReceiptDialog({
  paymentId,
  receiptNo,
  amount,
  open,
  onOpenChange,
}: VoidReceiptDialogProps) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleVoid = () => {
    if (!reason || reason.trim().length < 5) {
      setError('Please provide a mandatory reason of at least 5 characters')
      return
    }

    setError(null)
    startTransition(async () => {
      const res = await voidPaymentAction({
        paymentId,
        reason: reason.trim(),
      })

      if (res.success) {
        toast.success(`Receipt ${receiptNo} has been voided.`)
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(res.error || 'Failed to void receipt')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-2">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg font-semibold text-destructive">
            Void Receipt Voucher
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            Are you sure you want to void receipt{' '}
            <span className="font-semibold text-foreground">{receiptNo}</span> for{' '}
            <span className="font-semibold text-foreground">AED {amount.toFixed(2)}</span>?
            This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="voidReason" className="text-sm font-medium">
              Void Reason * (minimum 5 characters)
            </Label>
            <Textarea
              id="voidReason"
              placeholder="e.g. Card transaction reversed, Entered wrong candidate..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (error) setError(null)
              }}
              rows={3}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            <strong>Permanent audit record:</strong> The receipt will remain in the database watermarked &quot;VOID&quot;. The candidate&apos;s ledger balance will be automatically adjusted back.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleVoid}
            disabled={isPending || reason.trim().length < 5}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Voiding...
              </>
            ) : (
              'Confirm Void Receipt'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
