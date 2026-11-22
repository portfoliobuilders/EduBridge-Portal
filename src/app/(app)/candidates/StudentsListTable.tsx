'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Phone,
  MessageCircle,
  MoreVertical,
  ExternalLink,
  Upload,
  Copy,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  UserPlus,
  RotateCcw,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CandidateAvatar } from '@/components/CandidateAvatar'
import { BalancePill } from '@/components/BalancePill'
import { WhatsAppReminderDialog } from '@/components/candidates/WhatsAppReminderDialog'
import { formatPhoneNumber, cleanPhoneForWhatsApp } from '@/lib/phone'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime, formatRelativeTime } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

export type StudentDirectoryRow = Database['public']['Views']['student_directory_view']['Row']

interface StudentsListTableProps {
  students: StudentDirectoryRow[]
  totalCount: number
  currentPage: number
  pageSize: number
  hasActiveFilters?: boolean
  onAddCandidate?: () => void
}

export function StudentsListTable({
  students,
  totalCount,
  currentPage,
  pageSize,
  hasActiveFilters = false,
  onAddCandidate,
}: StudentsListTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Selected row IDs for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false)

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', newPage.toString())
    router.push(`/candidates?${params.toString()}`)
  }

  const handlePageSizeChange = (newSize: string | null) => {
    if (!newSize) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('pageSize', newSize)
    params.set('page', '1')
    router.push(`/candidates?${params.toString()}`)
  }

  // Row selection helpers
  const isAllSelected =
    students.length > 0 && students.every((s) => s.id && selectedIds.includes(s.id))

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allCurrentIds = students.map((s) => s.id).filter((id): id is string => Boolean(id))
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allCurrentIds])))
    } else {
      const currentSet = new Set(students.map((s) => s.id).filter(Boolean))
      setSelectedIds((prev) => prev.filter((id) => !currentSet.has(id)))
    }
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const selectedStudents = students.filter((s): s is StudentDirectoryRow & { id: string } =>
    Boolean(s.id && selectedIds.includes(s.id))
  )

  // Copy candidate code
  const handleCopyCode = (code: string | null, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!code) return
    navigator.clipboard.writeText(code)
    toast.success(`Candidate code ${code} copied to clipboard`)
  }

  // Export selected to CSV
  const handleExportSelectedCsv = () => {
    if (selectedStudents.length === 0) return

    const headers = [
      'Candidate Code',
      'Full Name',
      'Mobile',
      'WhatsApp',
      'Email',
      'Status',
      'Total Net Fee (AED)',
      'Total Paid (AED)',
      'Total Balance (AED)',
      'University',
      'Course',
    ]

    const rows = selectedStudents.map((s) => [
      `"${s.student_code || ''}"`,
      `"${s.full_name || ''}"`,
      `"${s.mobile || ''}"`,
      `"${s.whatsapp || ''}"`,
      `"${s.email || ''}"`,
      `"${s.candidate_status || ''}"`,
      s.total_net_fee ?? 0,
      s.total_paid ?? 0,
      s.total_balance ?? 0,
      `"${(s.university_names || '').replace(/"/g, '""')}"`,
      `"${(s.course_names || '').replace(/"/g, '""')}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `EduBridge_Candidates_Selection_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Exported ${selectedStudents.length} candidates to CSV`)
  }

  // Row navigation handler
  const handleRowClick = (studentId: string) => {
    router.push(`/candidates/${studentId}`)
  }

  // Empty / No Results states
  if (students.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="rounded-[14px] border border-dashed border-[#E4E7E7] bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F6F6] text-[#6B7272]">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#0A0A0A]">
            No matching candidates found
          </h3>
          <p className="mt-1 text-xs text-[#6B7272] max-w-sm mx-auto">
            Try adjusting your search terms, changing the university/course filter, or switching status tabs.
          </p>
          <div className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/candidates')}
              className="rounded-xl border-[#E4E7E7] text-xs font-semibold gap-1.5 h-10 px-4"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear all filters
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-[14px] border border-dashed border-[#E4E7E7] bg-white p-12 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F6F2] text-[#00A57E]">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-bold text-[#0A0A0A]">
          No candidates yet
        </h3>
        <p className="mt-1 text-xs text-[#6B7272] max-w-sm mx-auto">
          Admit candidates to partner universities, configure installment packages, and issue instant receipts.
        </p>
        {onAddCandidate && (
          <div className="mt-5">
            <Button
              type="button"
              onClick={onAddCandidate}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl text-xs font-semibold gap-1.5 h-10 px-5 shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Add your first candidate
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Pagination calculation
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalCount)

  return (
    <div className="space-y-4">
      {/* --------------------------------------------------------------------- */}
      {/* DESKTOP TABLE VIEW (>=1024px)                                         */}
      {/* --------------------------------------------------------------------- */}
      <div className="hidden lg:block rounded-[14px] bg-white border border-[#E4E7E7] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#F5F6F6] sticky top-0 z-10 border-b border-[#E4E7E7]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E] cursor-pointer"
                    aria-label="Select all candidates on this page"
                  />
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5">
                  Candidate
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5">
                  Contact
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5">
                  Program
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5 min-w-[140px]">
                  Payment
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5">
                  Balance
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5 whitespace-nowrap">
                  Last payment
                </TableHead>
                <TableHead className="font-semibold text-xs text-[#0A0A0A] py-3.5 text-right pr-4">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((c) => {
                if (!c.id) return null
                const studentId = c.id
                const candidateName = c.full_name || 'Candidate'
                const isSelected = selectedIds.includes(studentId)
                const netFee = Number(c.total_net_fee || 0)
                const paid = Number(c.total_paid || 0)
                const pct = netFee > 0 ? Math.min(100, Math.round((paid / netFee) * 100)) : 0
                const docsRatio = `${c.verified_docs_count || 0}/${c.total_doc_types_count || 6}`
                const cleanPhone = cleanPhoneForWhatsApp(c.whatsapp || c.mobile)

                return (
                  <TableRow
                    key={studentId}
                    tabIndex={0}
                    role="link"
                    aria-label={`View ${candidateName}`}
                    onClick={() => handleRowClick(studentId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleRowClick(studentId)
                      }
                    }}
                    className={cn(
                      'h-16 cursor-pointer border-b border-[#E4E7E7]/70 transition-colors group',
                      isSelected ? 'bg-[#E6F6F2]/30' : 'hover:bg-[#F5F6F6]/80'
                    )}
                  >
                    {/* 1. Checkbox */}
                    <TableCell
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleToggleSelect(studentId, e as unknown as React.MouseEvent)}
                        className="w-4 h-4 rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E] cursor-pointer"
                        aria-label={`Select ${candidateName}`}
                      />
                    </TableCell>

                    {/* 2. Candidate */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <CandidateAvatar name={candidateName} code={c.student_code} size="md" />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-[#0A0A0A] group-hover:text-[#00A57E] transition-colors truncate">
                            {candidateName}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-xs text-[#6B7272]">
                              {c.student_code}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F5F6F6] text-[#6B7272] border border-[#E4E7E7]">
                              Docs {docsRatio}
                            </span>
                            {c.enrollment_count && c.enrollment_count > 1 ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5]">
                                {c.enrollment_count} programs
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* 3. Contact */}
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-[#0A0A0A] font-medium">
                          <span>{formatPhoneNumber(c.mobile)}</span>
                          <a
                            href={`tel:${c.mobile}`}
                            title="Call candidate"
                            className="p-1 rounded-md text-[#6B7272] hover:text-[#00A57E] hover:bg-[#E6F6F2] transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Chat on WhatsApp"
                              className="p-1 rounded-md text-[#6B7272] hover:text-[#00A57E] hover:bg-[#E6F6F2] transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {c.email && (
                          <div className="text-[11px] text-[#6B7272] truncate max-w-[170px] mt-0.5" title={c.email}>
                            {c.email}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* 4. Program */}
                    <TableCell className="py-3">
                      <div className="min-w-0 max-w-[200px]">
                        <div
                          className="font-medium text-xs text-[#0A0A0A] truncate"
                          title={c.university_names || 'No university'}
                        >
                          {c.university_names || '—'}
                        </div>
                        <div
                          className="text-[11px] text-[#6B7272] truncate mt-0.5"
                          title={c.course_names || 'No course'}
                        >
                          {c.course_names || '—'}
                        </div>
                      </div>
                    </TableCell>

                    {/* 5. Payment */}
                    <TableCell className="py-3">
                      <div className="min-w-[130px] space-y-1.5">
                        <div className="w-full h-1.5 rounded-full bg-[#E4E7E7] overflow-hidden">
                          <div
                            className="h-full bg-[#00A57E] transition-all rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[11px] font-medium text-[#0A0A0A] tabular-nums">
                          {formatAED(paid)} of {formatAED(netFee)}
                        </div>
                      </div>
                    </TableCell>

                    {/* 6. Balance */}
                    <TableCell className="py-3">
                      <BalancePill status={c.candidate_status} balance={c.total_balance} />
                    </TableCell>

                    {/* 7. Last payment */}
                    <TableCell className="py-3">
                      <div
                        className="text-xs text-[#6B7272] tabular-nums whitespace-nowrap"
                        title={formatDubaiDateTime(c.last_payment_at)}
                      >
                        {formatRelativeTime(c.last_payment_at)}
                      </div>
                    </TableCell>

                    {/* 8. Actions */}
                    <TableCell className="py-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Quick Record Payment */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/receipts/new?studentId=${c.id}`)}
                          className="h-8 px-2 rounded-lg text-xs font-semibold text-[#00A57E] hover:bg-[#E6F6F2] hover:text-[#00805F]"
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1" />
                          Pay
                        </Button>

                        {/* More menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-[#6B7272] hover:text-[#0A0A0A]"
                                aria-label="Candidate actions menu"
                              />
                            }
                          >
                            <MoreVertical className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-white border-[#E4E7E7] rounded-xl shadow-lg w-48 p-1 text-xs"
                          >
                            <DropdownMenuItem
                              onClick={() => router.push(`/candidates/${c.id}`)}
                              className="cursor-pointer gap-2 py-2"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-[#6B7272]" />
                              Open profile
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleCopyCode(c.student_code)}
                              className="cursor-pointer gap-2 py-2"
                            >
                              <Copy className="w-3.5 h-3.5 text-[#6B7272]" />
                              Copy candidate code
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => router.push(`/receipts/new?studentId=${c.id}`)}
                              className="cursor-pointer gap-2 py-2"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-[#6B7272]" />
                              Record payment
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => router.push(`/candidates/${c.id}?tab=documents`)}
                              className="cursor-pointer gap-2 py-2"
                            >
                              <Upload className="w-3.5 h-3.5 text-[#6B7272]" />
                              Request documents
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MOBILE / TABLET CARD VIEW (<1024px)                                   */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3">
        {students.map((c) => {
          if (!c.id) return null
          const studentId = c.id
          const candidateName = c.full_name || 'Candidate'
          const isSelected = selectedIds.includes(studentId)
          const netFee = Number(c.total_net_fee || 0)
          const paid = Number(c.total_paid || 0)
          const pct = netFee > 0 ? Math.min(100, Math.round((paid / netFee) * 100)) : 0
          const cleanPhone = cleanPhoneForWhatsApp(c.whatsapp || c.mobile)

          return (
            <div
              key={studentId}
              tabIndex={0}
              role="link"
              onClick={() => handleRowClick(studentId)}
              className={cn(
                'rounded-[14px] bg-white border p-4 space-y-3 transition-all cursor-pointer shadow-xs active:bg-[#F5F6F6]/60',
                isSelected ? 'border-[#00A57E] ring-1 ring-[#00A57E]' : 'border-[#E4E7E7]'
              )}
            >
              {/* Header: avatar, name, code, status pill */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CandidateAvatar name={candidateName} code={c.student_code} size="md" />
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-[#0A0A0A] block truncate">
                      {candidateName}
                    </span>
                    <span className="font-mono text-xs text-[#6B7272] block">
                      {c.student_code}
                    </span>
                  </div>
                </div>

                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <BalancePill status={c.candidate_status} balance={c.total_balance} />
                </div>
              </div>

              {/* Program & Fee line */}
              <div className="text-xs text-[#6B7272] bg-[#F5F6F6] p-2.5 rounded-xl space-y-1">
                <div className="font-semibold text-[#0A0A0A] truncate">
                  {c.university_names || 'No program assigned'}
                </div>
                {c.course_names && (
                  <div className="text-[11px] text-[#6B7272] truncate">
                    {c.course_names}
                  </div>
                )}
              </div>

              {/* Payment Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] tabular-nums font-medium text-[#0A0A0A]">
                  <span>Paid: {formatAED(paid)}</span>
                  <span className="text-[#6B7272]">Net: {formatAED(netFee)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#E4E7E7] overflow-hidden">
                  <div
                    className="h-full bg-[#00A57E] rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Footer row: last payment, quick buttons */}
              <div
                className="flex items-center justify-between pt-1 border-t border-[#E4E7E7]/60"
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  className="text-[11px] text-[#6B7272] truncate"
                  title={formatDubaiDateTime(c.last_payment_at)}
                >
                  Last paid: {formatRelativeTime(c.last_payment_at)}
                </span>

                <div className="flex items-center gap-1.5">
                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#E4E7E7] text-[#6B7272] hover:text-[#00A57E]"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => router.push(`/receipts/new?studentId=${studentId}`)}
                    className="h-8 px-2.5 rounded-lg bg-[#00A57E] hover:bg-[#00805F] text-white text-xs font-semibold shadow-xs"
                  >
                    <CreditCard className="w-3.5 h-3.5 mr-1" />
                    Pay
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* BULK SELECTION ACTION BAR (Floating at bottom when rows are selected) */}
      {/* --------------------------------------------------------------------- */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-16 lg:bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 bg-[#0A0A0A] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-4 max-w-lg w-full border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#00A57E] text-white text-xs font-bold flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-white/90">
              {selectedIds.length === 1 ? 'candidate selected' : 'candidates selected'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportSelectedCsv}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white rounded-xl text-xs h-8 px-3"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Export CSV
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setWhatsAppModalOpen(true)}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl text-xs font-semibold h-8 px-3"
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1" />
              Send WhatsApp reminders
            </Button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-white/60 hover:text-white px-2 py-1"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* PAGINATION BAR                                                        */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-[#6B7272]">
        <div className="flex items-center gap-3">
          <span>
            Showing <strong className="font-semibold text-[#0A0A0A] tabular-nums">{startItem}–{endItem}</strong> of{' '}
            <strong className="font-semibold text-[#0A0A0A] tabular-nums">{totalCount}</strong> candidates
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">Rows:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="h-8 w-16 rounded-lg border-[#E4E7E7] bg-white text-xs">
                <SelectValue placeholder={pageSize.toString()} />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E4E7E7] rounded-xl shadow-lg">
                <SelectItem value="25" className="text-xs">25</SelectItem>
                <SelectItem value="50" className="text-xs">50</SelectItem>
                <SelectItem value="100" className="text-xs">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="h-8 px-2.5 rounded-lg border-[#E4E7E7] bg-white text-xs font-semibold disabled:opacity-50"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
            Prev
          </Button>

          <span className="px-2 font-medium text-[#0A0A0A] tabular-nums">
            {currentPage} of {totalPages}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
            className="h-8 px-2.5 rounded-lg border-[#E4E7E7] bg-white text-xs font-semibold disabled:opacity-50"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </Button>
        </div>
      </div>

      {/* WhatsApp Reminder Review Dialog */}
      <WhatsAppReminderDialog
        open={whatsAppModalOpen}
        onOpenChange={setWhatsAppModalOpen}
        candidates={selectedStudents}
      />
    </div>
  )
}
