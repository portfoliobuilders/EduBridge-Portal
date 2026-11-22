'use client'

import React, { useState, useEffect, useTransition, useCallback } from 'react'
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
  UserPlus,
  User,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { formatAED } from '@/lib/money'
import { formatPhoneNumber } from '@/lib/phone'
import { calculatePaymentVat, type VatTreatment } from '@/lib/vat'
import { cn } from '@/lib/utils'
import {
  recordPaymentAction,
  searchEnrollmentsForPayment,
} from '@/app/(app)/receipts/actions'
import {
  CreateStudentSheet,
  type CreateCandidateSuccessData,
  type UniversityOption,
  type CourseOption,
  type SpecializationOption,
  type StaffOption,
} from '@/app/(app)/candidates/CreateStudentSheet'

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
  vatType?: string
  vatTreatment?: string
  vatRate: number
  noVatReason?: string | null
  totalPayable: number
  totalPaid: number
  balance: number
  guardianName?: string | null
  billingContactName?: string | null
}

export interface QuickAddMetadata {
  universities: UniversityOption[]
  courses: CourseOption[]
  specializations: SpecializationOption[]
  staffList: StaffOption[]
  currentUserId: string
  isOwner: boolean
}

interface PaymentFormProps {
  initialEnrollment?: PreselectedEnrollment | null
  quickAddMetadata?: QuickAddMetadata | null
}

type PaymentMode = 'cash' | 'card' | 'link' | 'bank_transfer'
type PaymentPurpose = 'admission' | 'repayment' | 'other'

export function PaymentForm({
  initialEnrollment,
  quickAddMetadata,
}: PaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Selected enrollment state
  const [selectedEnrollment, setSelectedEnrollment] =
    useState<PreselectedEnrollment | null>(initialEnrollment ?? null)

  // Quick Add Candidate Sheet state
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddPrefill, setQuickAddPrefill] = useState<{
    name: string
    mobile: string
  }>({ name: '', mobile: '' })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PreselectedEnrollment[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Form fields
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')
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
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next.enrollment
      return next
    })
  }

  // Live Search
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

  const handleOpenQuickAdd = () => {
    setQuickAddPrefill({ name: '', mobile: '' })
    setQuickAddOpen(true)
  }

  const handleCreateFromQuery = (query: string) => {
    const trimmed = query.trim()
    const hasLetters = /[a-zA-Z]/.test(trimmed)
    const isDigits = /^[\d+\s()-]+$/.test(trimmed)

    if (hasLetters) {
      setQuickAddPrefill({ name: trimmed, mobile: '' })
    } else if (isDigits) {
      setQuickAddPrefill({ name: '', mobile: trimmed })
    } else {
      setQuickAddPrefill({ name: trimmed, mobile: '' })
    }
    setQuickAddOpen(true)
  }

  const handleCandidateCreated = (created: CreateCandidateSuccessData) => {
    setQuickAddOpen(false)
    setSearchQuery('')
    setSearchResults([])

    const preselected: PreselectedEnrollment = {
      enrollmentId: created.enrollmentId,
      studentId: created.studentId,
      studentName: created.fullName,
      studentCode: created.studentCode,
      studentMobile: created.mobile,
      universityName: created.universityName,
      courseName: created.courseName,
      specializationName: created.specializationName,
      intake: created.intake,
      vatType: created.vatType,
      vatRate: created.vatRate,
      totalPayable: created.totalPayable,
      totalPaid: 0,
      balance: created.balance,
      guardianName: created.guardianName ?? null,
      billingContactName: created.billingContactName ?? null,
    }

    setSelectedEnrollment(preselected)
    setPayeeName(created.fullName)
    setPurpose('admission')
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next.enrollment
      return next
    })

    // Auto-focus amount field
    setTimeout(() => {
      const amountInput = document.getElementById('amount') as HTMLInputElement | null
      amountInput?.focus()
    }, 100)
  }

  const balance = selectedEnrollment?.balance ?? 0
  const numAmount = parseFloat(amount) || 0
  const balanceAfter = Math.max(0, balance - numAmount)

  const treatment = (selectedEnrollment?.vatTreatment || selectedEnrollment?.vatType || 'exclusive') as VatTreatment
  const vatRate = Number(selectedEnrollment?.vatRate ?? 5.0)
  const paymentVatBreakdown = selectedEnrollment
    ? calculatePaymentVat({
        amount: numAmount,
        treatment,
        rate: vatRate,
      })
    : { vatAmount: 0, taxableAmount: 0 }

  const handleFullBalance = () => {
    if (balance > 0) {
      setAmount(balance.toFixed(2))
      setFormErrors((prev) => {
        const next = { ...prev }
        delete next.amount
        return next
      })
    }
  }

  const handleSetQuickAmount = (pct: number) => {
    if (!selectedEnrollment || balance <= 0) return
    const calculated = (balance * pct).toFixed(2)
    setAmount(calculated)
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next.amount
      return next
    })
  }

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {}

    if (!selectedEnrollment) {
      errors.enrollment = 'Please select a candidate and course enrollment'
    }

    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Please enter a valid amount greater than 0'
    } else if (selectedEnrollment && numericAmount > balance) {
      errors.amount = `Amount cannot exceed balance of ${formatAED(balance)}`
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
    return Object.keys(errors).length === 0
  }, [selectedEnrollment, amount, balance, purpose, purposeNote, paidAt])

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
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-24 lg:pb-8">
        {/* LEFT COLUMN: Input Forms (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Candidate / Enrollment Picker */}
          <Card className="border-[#E4E7E7] bg-white rounded-2xl shadow-xs">
            <CardHeader className="pb-3 border-b border-[#E4E7E7]/60">
              <CardTitle className="text-base font-semibold text-[#0A0A0A] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#00A57E]" />
                  <span>1. Candidate & Enrollment</span>
                </span>
                {selectedEnrollment && !initialEnrollment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedEnrollment(null)
                      setAmount('')
                    }}
                    className="text-xs text-[#6B7272] hover:text-[#0A0A0A]"
                  >
                    Change Candidate
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {!selectedEnrollment ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-[#6B7272]" />
                      <Input
                        id="candidate-search-input"
                        placeholder="Search candidate by name, mobile, code, or email..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value)
                          if (e.target.value.trim().length < 2) {
                            setSearchResults([])
                          }
                        }}
                        className="pl-9 min-h-[44px] bg-white"
                        autoFocus
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-[#00A57E]" />
                      )}
                    </div>
                    {quickAddMetadata && (
                      <Button
                        id="btn-quick-add-candidate"
                        type="button"
                        onClick={handleOpenQuickAdd}
                        className="bg-[#00A57E] hover:bg-[#00805F] text-white shrink-0 gap-1.5 font-semibold min-h-[44px] rounded-xl"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>+ New Candidate</span>
                      </Button>
                    )}
                  </div>

                  {formErrors.enrollment && (
                    <p className="text-xs text-[#C53030] font-medium">{formErrors.enrollment}</p>
                  )}

                  {searchResults.length > 0 && (
                    <div className="border border-[#E4E7E7] rounded-xl divide-y divide-[#E4E7E7] max-h-72 overflow-y-auto bg-white shadow-xs">
                      {searchResults.map((item) => (
                        <button
                          key={item.enrollmentId}
                          type="button"
                          onClick={() => handleSelectEnrollment(item)}
                          className="w-full text-left p-3.5 hover:bg-[#E6F6F2]/40 transition-colors flex items-center justify-between group"
                        >
                          <div>
                            <div className="font-semibold text-sm text-[#0A0A0A] flex items-center gap-2">
                              <span>{item.studentName}</span>
                              <Badge variant="outline" className="text-[11px] font-mono border-[#E4E7E7]">
                                {item.studentCode}
                              </Badge>
                            </div>
                            <div className="text-xs text-[#6B7272] mt-0.5">
                              {item.universityName} · {item.courseName}
                              {item.specializationName ? ` (${item.specializationName})` : ''}
                              {item.intake ? ` · ${item.intake}` : ''}
                            </div>
                            <div className="text-xs text-[#6B7272] font-mono mt-0.5">
                              {formatPhoneNumber(item.studentMobile)}
                            </div>
                          </div>
                          <div className="text-right shrink-0 pl-3">
                            <div className="text-[11px] text-[#6B7272] uppercase tracking-wider">Balance</div>
                            <div className="text-sm font-semibold text-[#00A57E] font-mono tabular-nums">
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
                      <div className="border border-dashed border-[#E4E7E7] rounded-xl p-6 text-center space-y-3 bg-[#F5F6F6]/60">
                        <p className="text-xs text-[#6B7272]">
                          No candidate found for &quot;<span className="font-semibold text-[#0A0A0A]">{searchQuery}</span>&quot;
                        </p>
                        {quickAddMetadata && (
                          <Button
                            id="btn-create-from-query"
                            type="button"
                            variant="outline"
                            onClick={() => handleCreateFromQuery(searchQuery)}
                            className="border-[#00A57E] text-[#00805F] hover:bg-[#E6F6F2] font-semibold text-xs rounded-xl"
                          >
                            <UserPlus className="h-4 w-4 mr-1.5" />
                            <span>Create &quot;{searchQuery}&quot; as new candidate</span>
                          </Button>
                        )}
                      </div>
                    )}
                </div>
              ) : (
                <div className="bg-[#F5F6F6] p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#E4E7E7]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base text-[#0A0A0A]">
                        {selectedEnrollment.studentName}
                      </span>
                      <Badge variant="outline" className="text-xs font-mono border-[#E4E7E7] bg-white">
                        {selectedEnrollment.studentCode}
                      </Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-[#6B7272] mt-1">
                      {selectedEnrollment.universityName} · {selectedEnrollment.courseName}
                      {selectedEnrollment.specializationName ? ` (${selectedEnrollment.specializationName})` : ''}
                      {selectedEnrollment.intake ? ` · Intake: ${selectedEnrollment.intake}` : ''}
                    </div>
                    <div className="text-xs text-[#6B7272] mt-0.5 font-mono">
                      Mobile: {formatPhoneNumber(selectedEnrollment.studentMobile)}
                    </div>
                  </div>

                  {/* Prominent Balance Display */}
                  <div className="bg-white p-3 rounded-xl border border-[#E4E7E7] shadow-xs text-right min-w-[170px]">
                    <div className="text-[11px] text-[#6B7272] font-medium uppercase tracking-wider">
                      Current Balance Due
                    </div>
                    <div className="text-lg font-bold text-[#00A57E] mt-0.5 font-mono tabular-nums">
                      {formatAED(selectedEnrollment.balance)}
                    </div>
                    <div className="text-[11px] text-[#6B7272] font-mono tabular-nums">
                      Total: {formatAED(selectedEnrollment.totalPayable)} | Paid: {formatAED(selectedEnrollment.totalPaid)}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Payment Amount & Quick Chips */}
          <Card className="border-[#E4E7E7] bg-white rounded-2xl shadow-xs">
            <CardHeader className="pb-3 border-b border-[#E4E7E7]/60">
              <CardTitle className="text-base font-semibold text-[#0A0A0A] flex items-center justify-between">
                <span>2. Payment Amount</span>
                {selectedEnrollment && balance > 0 && (
                  <span className="text-xs font-normal text-[#6B7272]">
                    Max: <span className="font-semibold text-[#0A0A0A] font-mono">{formatAED(balance)}</span>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-[#6B7272]">
                  Amount in AED *
                </Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-sm font-semibold text-[#6B7272]">
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
                    className="pl-14 text-xl font-bold tracking-wide h-12 rounded-xl bg-white"
                  />
                </div>
                {formErrors.amount && (
                  <p className="text-xs text-[#C53030] font-medium">{formErrors.amount}</p>
                )}
              </div>

              {/* Quick Amount Chips */}
              {selectedEnrollment && balance > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-[#6B7272] mr-1">Quick fill:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFullBalance}
                    className="h-8 rounded-lg text-xs font-medium border-[#00A57E] text-[#00805F] bg-[#E6F6F2]/50 hover:bg-[#E6F6F2]"
                  >
                    Full Balance ({formatAED(balance)})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetQuickAmount(0.5)}
                    className="h-8 rounded-lg text-xs font-medium border-[#E4E7E7] text-[#0A0A0A] hover:bg-[#F5F6F6]"
                  >
                    50% ({formatAED(balance * 0.5)})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetQuickAmount(0.25)}
                    className="h-8 rounded-lg text-xs font-medium border-[#E4E7E7] text-[#0A0A0A] hover:bg-[#F5F6F6]"
                  >
                    25% ({formatAED(balance * 0.25)})
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Payment Mode: 4 Big Tiles */}
          <Card className="border-[#E4E7E7] bg-white rounded-2xl shadow-xs">
            <CardHeader className="pb-3 border-b border-[#E4E7E7]/60">
              <CardTitle className="text-base font-semibold text-[#0A0A0A]">
                3. Payment Mode *
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'cash', label: 'Cash', icon: Banknote, desc: 'Counter Cash' },
                  { id: 'card', label: 'Card', icon: CreditCard, desc: 'POS / Credit / Debit' },
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
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between min-h-[96px]",
                        isSelected
                          ? "border-[#00A57E] bg-[#E6F6F2]/40 text-[#0A0A0A] shadow-xs"
                          : "border-[#E4E7E7] hover:border-[#6B7272] bg-white text-[#0A0A0A]"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <Icon
                          className={cn("h-5 w-5", isSelected ? "text-[#00A57E]" : "text-[#6B7272]")}
                        />
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-[#00A57E]" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-sm leading-tight">{item.label}</div>
                        <div className="text-[11px] text-[#6B7272] mt-0.5 leading-tight">{item.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* 4. Purpose, Date, Payee, Comments */}
          <Card className="border-[#E4E7E7] bg-white rounded-2xl shadow-xs">
            <CardHeader className="pb-3 border-b border-[#E4E7E7]/60">
              <CardTitle className="text-base font-semibold text-[#0A0A0A]">
                4. Transaction Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Purpose */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-[#6B7272]">
                  Payment Purpose *
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                        className={cn(
                          "py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-semibold transition-colors",
                          isSelected
                            ? "border-[#00A57E] bg-[#E6F6F2] text-[#00805F]"
                            : "border-[#E4E7E7] text-[#0A0A0A] hover:bg-[#F5F6F6] bg-white"
                        )}
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
                      className="bg-white rounded-xl"
                    />
                    {formErrors.purposeNote && (
                      <p className="text-xs text-[#C53030] font-medium mt-1">
                        {formErrors.purposeNote}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Paid At */}
                <div className="space-y-1.5">
                  <Label htmlFor="paidAt" className="text-xs font-semibold uppercase tracking-wider text-[#6B7272] flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#6B7272]" />
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
                    className="bg-white rounded-xl"
                  />
                  <p className="text-[11px] text-[#6B7272]">
                    Back-dating permitted up to 30 days. Future dates blocked.
                  </p>
                  {formErrors.paidAt && (
                    <p className="text-xs text-[#C53030] font-medium">{formErrors.paidAt}</p>
                  )}
                </div>

                {/* Payee Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="payeeName" className="text-xs font-semibold uppercase tracking-wider text-[#6B7272]">
                    Payee / Received From
                  </Label>

                  {/* Quick choices when candidate / guardian / billing contact available */}
                  {selectedEnrollment && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pb-1">
                      <span className="text-[11px] text-[#6B7272]">Quick pick:</span>
                      <button
                        type="button"
                        onClick={() => setPayeeName(selectedEnrollment.studentName)}
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors",
                          payeeName === selectedEnrollment.studentName
                            ? "bg-[#E6F6F2] text-[#00805F] border-[#CCEDE5]"
                            : "bg-white text-[#6B7272] border-[#E4E7E7] hover:bg-[#F5F6F6]"
                        )}
                      >
                        {selectedEnrollment.studentName}
                      </button>
                      {selectedEnrollment.guardianName && (
                        <button
                          type="button"
                          onClick={() => setPayeeName(selectedEnrollment.guardianName!)}
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors",
                            payeeName === selectedEnrollment.guardianName
                              ? "bg-[#E6F6F2] text-[#00805F] border-[#CCEDE5]"
                              : "bg-white text-[#6B7272] border-[#E4E7E7] hover:bg-[#F5F6F6]"
                          )}
                        >
                          Guardian: {selectedEnrollment.guardianName}
                        </button>
                      )}
                    </div>
                  )}

                  <Input
                    id="payeeName"
                    placeholder="Candidate or Sponsor Full Name"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    className="bg-white rounded-xl"
                  />
                  <p className="text-[11px] text-[#6B7272]">
                    Defaults to candidate name. Enter sponsor or guardian if paid on behalf.
                  </p>
                </div>
              </div>

              {/* Comments */}
              <div className="space-y-1.5">
                <Label htmlFor="comments" className="text-xs font-semibold uppercase tracking-wider text-[#6B7272]">
                  Internal Comments (optional)
                </Label>
                <Textarea
                  id="comments"
                  placeholder="Add internal notes about this transaction (e.g. cheque #, bank transaction reference)..."
                  rows={2}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="bg-white rounded-xl"
                />
              </div>
            </CardContent>
          </Card>

          {/* Form validation alert */}
          {Object.keys(formErrors).length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-[#C53030] text-xs sm:text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Please resolve the errors highlighted above before issuing receipt.</span>
            </div>
          )}

          {/* Standard desktop button footer */}
          <div className="hidden lg:flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isPending}
              className="h-11 px-5 rounded-xl border-[#E4E7E7] text-[#0A0A0A]"
            >
              Cancel
            </Button>
            <Button
              id="btn-issue-receipt-desktop"
              type="submit"
              disabled={isPending || !selectedEnrollment}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white min-w-[200px] h-11 rounded-xl font-semibold shadow-xs"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <span>Issue Receipt Voucher</span>
              )}
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: Sticky Receipt Summary (Desktop >= 1024px) */}
        <div className="hidden lg:block lg:col-span-4 sticky top-6 space-y-4">
          <Card className="border-[#E4E7E7] bg-white rounded-2xl shadow-sm overflow-hidden">
            <CardHeader className="bg-[#F5F6F6] pb-3 border-b border-[#E4E7E7]">
              <CardTitle className="text-sm font-semibold text-[#0A0A0A] flex items-center justify-between">
                <span>Receipt Summary</span>
                <ShieldCheck className="w-4 h-4 text-[#00A57E]" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5">
              {selectedEnrollment ? (
                <>
                  <div className="border-b border-[#E4E7E7] pb-3 space-y-1">
                    <div className="font-semibold text-sm text-[#0A0A0A]">{selectedEnrollment.studentName}</div>
                    <div className="text-xs text-[#6B7272]">{selectedEnrollment.universityName} · {selectedEnrollment.courseName}</div>
                    <div className="text-xs text-[#6B7272] font-mono">{selectedEnrollment.studentCode}</div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-[#6B7272]">
                      <span>Total Payable</span>
                      <span className="font-mono tabular-nums">{formatAED(selectedEnrollment.totalPayable)}</span>
                    </div>
                    <div className="flex justify-between text-[#6B7272]">
                      <span>Previously Paid</span>
                      <span className="font-mono tabular-nums">{formatAED(selectedEnrollment.totalPaid)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-[#0A0A0A] pt-1 border-t border-[#E4E7E7]">
                      <span>Current Balance</span>
                      <span className="font-mono tabular-nums text-[#B7791F] font-semibold">{formatAED(balance)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-[#00A57E] pt-1">
                      <span>Receipt Amount</span>
                      <span className="font-mono tabular-nums">{formatAED(numAmount)}</span>
                    </div>
                    {treatment !== 'none' && numAmount > 0 && (
                      <div className="flex justify-between text-xs text-[#6B7272]">
                        <span>of which VAT ({vatRate}%):</span>
                        <span className="font-mono tabular-nums text-[#0A0A0A] font-medium">
                          {formatAED(paymentVatBreakdown.vatAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-semibold text-[#0A0A0A] pt-1 border-t border-[#E4E7E7]">
                      <span>Balance After Receipt</span>
                      <span className={cn("font-mono tabular-nums", balanceAfter === 0 ? "text-[#00A57E]" : "text-[#B7791F]")}>
                        {formatAED(balanceAfter)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      id="btn-issue-receipt"
                      type="submit"
                      disabled={isPending || !selectedEnrollment}
                      className="w-full bg-[#00A57E] hover:bg-[#00805F] text-white h-11 rounded-xl font-semibold shadow-xs"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Recording...</span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span>Issue Receipt Voucher</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-[#6B7272] space-y-1">
                  <p className="font-medium text-[#0A0A0A]">No candidate selected</p>
                  <p>Search candidate on the left to preview receipt summary</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* MOBILE STICKY ACTION BAR (<1024px) */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E4E7E7] px-4 py-3 z-40 shadow-lg flex items-center justify-between gap-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div>
            <div className="text-[11px] text-[#6B7272] uppercase font-medium">Payment</div>
            <div className="text-base font-bold text-[#00A57E] font-mono tabular-nums">
              {formatAED(numAmount)}
            </div>
            {treatment !== 'none' && numAmount > 0 && (
              <div className="text-[10px] text-[#6B7272] font-mono">
                incl. VAT {formatAED(paymentVatBreakdown.vatAmount)}
              </div>
            )}
          </div>
          <Button
            id="btn-issue-receipt-mobile"
            type="submit"
            disabled={isPending || !selectedEnrollment}
            className="bg-[#00A57E] hover:bg-[#00805F] text-white h-11 px-5 rounded-xl font-semibold shadow-xs"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Recording...</span>
              </>
            ) : (
              <span>Issue Receipt</span>
            )}
          </Button>
        </div>
      </form>

      {/* Quick Add Candidate Sheet Modal */}
      {quickAddMetadata && (
        <CreateStudentSheet
          key={`${quickAddPrefill.name}-${quickAddPrefill.mobile}-${quickAddOpen}`}
          universities={quickAddMetadata.universities}
          courses={quickAddMetadata.courses}
          specializations={quickAddMetadata.specializations}
          staffList={quickAddMetadata.staffList}
          currentUserId={quickAddMetadata.currentUserId}
          isOwner={quickAddMetadata.isOwner}
          isOpen={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          initialName={quickAddPrefill.name}
          initialMobile={quickAddPrefill.mobile}
          onCandidateCreated={handleCandidateCreated}
        />
      )}
    </>
  )
}
