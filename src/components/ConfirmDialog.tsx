'use client'

import React, { useState } from 'react'
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

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmName?: string
  confirmLabel?: string
  isDestructive?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmName,
  confirmLabel = 'Confirm',
  isDestructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [typedInput, setTypedInput] = useState('')
  const [loading, setLoading] = useState(false)

  const isMatched = !confirmName || typedInput.trim() === confirmName.trim()

  const handleConfirm = async () => {
    if (!isMatched) return
    try {
      setLoading(true)
      await onConfirm()
      onOpenChange(false)
      setTypedInput('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {confirmName && (
          <div className="space-y-2 py-2">
            <Label className="text-xs font-medium text-foreground">
              Type <strong className="text-destructive font-mono">{confirmName}</strong> to confirm:
            </Label>
            <Input
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={confirmName}
              className="text-sm font-mono"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!isMatched || loading}
            className={
              isDestructive
                ? 'bg-[#C53030] hover:bg-[#9B2C2C] text-white'
                : 'bg-primary hover:bg-[#00805F] text-white'
            }
          >
            {loading ? 'Processing...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
