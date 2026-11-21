'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CreditCard,
  Banknote,
  QrCode,
  Building2,
  Calendar,
  CheckCircle2,
  Search,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { formatAED } from '@/lib/money'
import {
  recordPaymentAction,
  searchEnrollmentsForPayment,
} from '@/app/(app)/receipts/actions'

export interface PreselectedEnrollment {
  enrollmentId: string
  studentId: string
  studentName: string
  studentCode: string
  studentMobile: string
  universityName: string
  courseName: string
  specializationName?: string | null
  intake?: string | null
  vatType: string
  vatRate: number
  totalPayable: number
  totalPaid: number
  balance: number
}

interface PaymentFormProps {
  initialEnrollment?: PreselectedEnrollment | null
}

type PaymentMode = 'card' | 'cash' | 'link' | 'bank_transfer'
type PaymentPurpose = 'admission' | 'repayment' | 'other'

export function PaymentForm({ initialEnrollment }: PaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Selected enrollment state
  const [selectedEnrollment, setSelectedEnrollment] =
    useState<PreselectedEnrollment | null>(initialEnrollment ?? null)

  // Search state when opened globally without preselected enrollment
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PreselectedEnrollment[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Form fields
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('card')
  const [referenceNo, setReferenceNo] = useState('')
  const [purpose, setPurpose] = useState<PaymentPurpose>(() =>
    initialEnrollment && initialEnrollment.totalPaid > 0 ? 'repayment' : 'admission'
  )
  const [purposeNote, setPurposeNote] = useState('')
  const [payeeName, setPayeeName] = useState(
    initialEnrollment?.studentName ?? ''
  )
  const [paidAt, setPaidAt] = useState(() => {
    const now = new Date()
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  })
  const [comments, setComments] = useState('')
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''
  )

  // Validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const handleSelectEnrollment = (item: PreselectedEnrollment) => {
    setSelectedEnrollment(item)
    setPayeeName(item.studentName)
    setPurpose(item.totalPaid > 0 ? 'repayment' : 'admission')
    setSearchQuery('')
    setSearchResults([])
    if (formErrors.enrollment) {
      setFormErrors((prev) => {
        const next = { ...prev }
        delete next.enrollment
        return next
      })
    }
  }

  // Search effect
  useEffect(() => {
    let isMounted = true
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await searchEnrollmentsForPayment(searchQuery)
        if (isMounted) setSearchResults(results)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        if (isMounted) setIsSearching(false)
      }
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [searchQuery])

  const balance = selectedEnrollment?.balance ?? 0

  const handleFullBalance = () => {
    if (balance > 0) {
      setAmount(balance.toFixed(2))
      if (formErrors.amount) {
        setFormErrors((prev) => {
          const next = { ...prev }
          delete next.amount
          return next
        })
      }
    }
  }

  const getRefLabel = () => {
    switch (mode) {
      case 'card':
        return 'Card Approval Code / Auth No *'
      case 'link':
        return 'Payment Link ID / Reference *'
      case 'bank_transfer':
        return 'Bank Transfer Reference / IBAN *'
      case 'cash':
        return 'Receipt Note / Cash Reference (optional)'
    }
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!selectedEnrollment) {
      errors.enrollment = 'Please select a student and course enrollment'
    }

    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Please enter a valid amount greater than 0'
    } else if (selectedEnrollment && numericAmount > balance) {
      errors.amount = `Amount cannot exceed balance of ${formatAED(balance)}`
    }

    if (mode !== 'cash' && (!referenceNo || referenceNo.trim().length < 2)) {
      errors.referenceNo = 'Reference number is required for non-cash payments'
    }

    if (purpose === 'other' && (!purposeNote || purposeNote.trim().length < 2)) {
      errors.purposeNote = 'Please specify the payment purpose'
    }

    if (!paidAt) {
      errors.paidAt = 'Payment date is required'
    } else {
      const d = new Date(paidAt)
      if (isNaN(d.getTime())) {
        errors.paidAt = 'Invalid payment date'
      } else {
        const now = new Date()
        if (d.getTime() > now.getTime() + 5 * 60 * 1000) {
          errors.paidAt = 'Payment date cannot be in the future'
        }
      }
    }

    setFormErrors(errors)
    const isValid = Object.keys(errors).length === 0
    return isValid
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    if (!selectedEnrollment) return

    startTransition(async () => {
      const res = await recordPaymentAction({
        enrollmentId: selectedEnrollment.enrollmentId,
        amount: parseFloat(amount),
        mode,
        purpose,
        purposeNote: purpose === 'other' ? purposeNote : null,
        referenceNo: referenceNo.trim() || null,
        paidAt: new Date(paidAt).toISOString(),
        payeeName: payeeName.trim() || null,
        comments: comments.trim() || null,
        idempotencyKey,
      })

      if (res.success && res.data) {
        toast.success(`Payment recorded! Voucher ${res.data.receiptNo} created.`)
        router.push(`/receipts/${res.data.paymentId}`)
      } else {
        toast.error(res.error || 'Failed to record payment')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* 1. Student / Enrollment Picker */}
      <Card className="border-[#E4E7E7]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[#0A0A0A] flex items-center justify-between">
            <span>Student & Course Enrollment</span>
            {selectedEnrollment && !initialEnrollment && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedEnrollment(null)
                  setAmount('')
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Change student
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedEnrollment ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search student by name, mobile, code, or email..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    if (e.target.value.trim().length < 2) {
                      setSearchResults([])
                    }
                  }}
                  className="pl-9"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {formErrors.enrollment && (
                <p className="text-sm text-destructive">{formErrors.enrollment}</p>
              )}

              {searchResults.length > 0 && (
                <div className="border border-[#E4E7E7] rounded-md divide-y divide-[#E4E7E7] max-h-64 overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item.enrollmentId}
                      type="button"
                      onClick={() => handleSelectEnrollment(item)}
                      className="w-full text-left p-3 hover:bg-[#F5F6F6] transition flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-sm text-[#0A0A0A]">
                          {item.studentName}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({item.studentCode})
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.universityName} · {item.courseName}
                          {item.specializationName ? ` (${item.specializationName})` : ''}
                        </div>
                        <div className="text-xs text-muted-foreground">{item.studentMobile}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Balance Due</div>
                        <div
                          className={`text-sm font-semibold ${
                            item.balance > 0 ? 'text-[#00A57E]' : 'text-muted-foreground'
                          }`}
                        >
                          {formatAED(item.balance)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim().length >= 2 &&
                !isSearching &&
                searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active student enrollments found matching &quot;{searchQuery}&quot;
                  </p>
                )}
            </div>
          ) : (
            <div className="bg-[#F5F6F6] p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base text-[#0A0A0A]">
                    {selectedEnrollment.studentName}
                  </span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {selectedEnrollment.studentCode}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedEnrollment.universityName} · {selectedEnrollment.courseName}
                  {selectedEnrollment.specializationName
                    ? ` (${selectedEnrollment.specializationName})`
                    : ''}
                  {selectedEnrollment.intake ? ` · Intake: ${selectedEnrollment.intake}` : ''}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Mobile: {selectedEnrollment.studentMobile}
                </div>
              </div>

              {/* Prominent Balance Display */}
              <div className="bg-white p-3 rounded-md border border-[#E4E7E7] shadow-xs text-right min-w-[180px]">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Current Balance Due
                </div>
                <div className="text-xl font-bold text-[#00A57E] mt-0.5">
                  {formatAED(selectedEnrollment.balance)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total: {formatAED(selectedEnrollment.totalPayable)} | Paid:{' '}
                  {formatAED(selectedEnrollment.totalPaid)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Payment Amount & Full Balance */}
      <Card className="border-[#E4E7E7]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[#0A0A0A]">
            Payment Amount
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount in AED *</Label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-sm font-semibold text-muted-foreground">
                  AED
                </span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    if (formErrors.amount) {
                      setFormErrors((prev) => {
                        const next = { ...prev }
                        delete next.amount
                        return next
                      })
                    }
                  }}
                  className="pl-14 text-lg font-semibold tracking-wide"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleFullBalance}
                disabled={!selectedEnrollment || balance <= 0}
                className="whitespace-nowrap font-medium"
              >
                Full balance ({formatAED(balance)})
              </Button>
            </div>
            {formErrors.amount && (
              <p className="text-sm text-destructive">{formErrors.amount}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Payment Mode: 4 Big Tiles */}
      <Card className="border-[#E4E7E7]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[#0A0A0A]">
            Payment Mode *
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 'card', label: 'Card', icon: CreditCard, desc: 'POS / Credit / Debit' },
              { id: 'cash', label: 'Cash', icon: Banknote, desc: 'Counter Cash' },
              { id: 'link', label: 'Payment Link', icon: QrCode, desc: 'Online Gateway' },
              { id: 'bank_transfer', label: 'Bank Transfer', icon: Building2, desc: 'Wire / A/C Transfer' },
            ].map((item) => {
              const Icon = item.icon
              const isSelected = mode === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id as PaymentMode)}
                  className={`p-4 rounded-lg border-2 text-left transition flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#00A57E] bg-[#E6F6F2]/40 text-[#0A0A0A]'
                      : 'border-[#E4E7E7] hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <Icon
                      className={`h-6 w-6 ${
                        isSelected ? 'text-[#00A57E]' : 'text-muted-foreground'
                      }`}
                    />
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-[#00A57E]" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.desc}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Reference Input */}
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="referenceNo">{getRefLabel()}</Label>
            <Input
              id="referenceNo"
              placeholder={
                mode === 'cash'
                  ? 'Optional reference note'
                  : 'Enter receipt / approval / transaction reference'
              }
              value={referenceNo}
              onChange={(e) => {
                setReferenceNo(e.target.value)
                if (formErrors.referenceNo) {
                  setFormErrors((prev) => {
                    const next = { ...prev }
                    delete next.referenceNo
                    return next
                  })
                }
              }}
            />
            {formErrors.referenceNo && (
              <p className="text-sm text-destructive">{formErrors.referenceNo}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. Purpose, Date, Payee, Comments */}
      <Card className="border-[#E4E7E7]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[#0A0A0A]">
            Transaction Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Purpose */}
          <div className="space-y-1.5">
            <Label>Payment Purpose *</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { id: 'admission', label: 'Admission Fee' },
                { id: 'repayment', label: 'Instalment / Re-payment' },
                { id: 'other', label: 'Other Purpose' },
              ].map((p) => {
                const isSelected = purpose === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPurpose(p.id as PaymentPurpose)}
                    className={`py-2.5 px-3 rounded-md border text-sm font-medium transition ${
                      isSelected
                        ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00A57E]'
                        : 'border-[#E4E7E7] text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>

            {purpose === 'other' && (
              <div className="pt-2">
                <Input
                  placeholder="Specify purpose (e.g. Visa fee, Registration, Books)..."
                  value={purposeNote}
                  onChange={(e) => {
                    setPurposeNote(e.target.value)
                    if (formErrors.purposeNote) {
                      setFormErrors((prev) => {
                        const next = { ...prev }
                        delete next.purposeNote
                        return next
                      })
                    }
                  }}
                />
                {formErrors.purposeNote && (
                  <p className="text-sm text-destructive mt-1">
                    {formErrors.purposeNote}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Paid At */}
            <div className="space-y-1.5">
              <Label htmlFor="paidAt" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Date & Time Paid (Asia/Dubai) *</span>
              </Label>
              <Input
                id="paidAt"
                type="datetime-local"
                value={paidAt}
                onChange={(e) => {
                  setPaidAt(e.target.value)
                  if (formErrors.paidAt) {
                    setFormErrors((prev) => {
                      const next = { ...prev }
                      delete next.paidAt
                      return next
                    })
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Editable up to 30 days back. Future dates are blocked.
              </p>
              {formErrors.paidAt && (
                <p className="text-sm text-destructive">{formErrors.paidAt}</p>
              )}
            </div>

            {/* Payee Name */}
            <div className="space-y-1.5">
              <Label htmlFor="payeeName">Payee / Received From</Label>
              <Input
                id="payeeName"
                placeholder="Student or Sponsor Full Name"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to student name. Enter sponsor or guardian if paid on behalf.
              </p>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <Label htmlFor="comments">Internal Comments (optional)</Label>
            <Textarea
              id="comments"
              placeholder="Add any internal notes about this transaction..."
              rows={2}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Global error banner */}
      {Object.keys(formErrors).length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Please fix the errors above before submitting.</span>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          id="btn-issue-receipt"
          type="submit"
          disabled={isPending || !selectedEnrollment}
          className="bg-[#00A57E] hover:bg-[#00805F] text-white min-w-[160px] font-semibold"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Recording...
            </>
          ) : (
            'Issue Receipt Voucher'
          )}
        </Button>
      </div>
    </form>
  )
}
