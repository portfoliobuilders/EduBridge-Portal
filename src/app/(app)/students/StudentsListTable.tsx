'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { BalancePill } from '@/components/BalancePill'
import { formatDubaiDate } from '@/lib/date'
import { formatAED } from '@/lib/money'
import {
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Phone,
  Users,
} from 'lucide-react'
import type { Database } from '@/types/database'

export type StudentDirectoryRow = Database['public']['Views']['student_directory_view']['Row']

interface StudentsListTableProps {
  students: StudentDirectoryRow[]
  totalCount: number
  currentPage: number
  pageSize: number
}

export function StudentsListTable({
  students,
  totalCount,
  currentPage,
  pageSize,
}: StudentsListTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', newPage.toString())
    router.push(`/students?${params.toString()}`)
  }

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E4E7E7] bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F6F2] text-[#00A57E]">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-[#0A0A0A]">
          No students found
        </h3>
        <p className="mt-1 text-sm text-[#6B7272]">
          No matching student records found. Try adjusting your search query or filters.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ----------------------------------------------------------------------- */}
      {/* DESKTOP TABLE VIEW (hidden on mobile, visible on sm and up)            */}
      {/* ----------------------------------------------------------------------- */}
      <div className="hidden sm:block rounded-2xl bg-white shadow-sm border border-[#E4E7E7] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#F5F6F6]/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold text-xs text-[#0A0A0A]">Student</TableHead>
              <TableHead className="font-semibold text-xs text-[#0A0A0A]">Mobile</TableHead>
              <TableHead className="font-semibold text-xs text-[#0A0A0A]">University · Course</TableHead>
              <TableHead className="font-semibold text-xs text-[#0A0A0A] text-right">Fee / Paid</TableHead>
              <TableHead className="font-semibold text-xs text-[#0A0A0A] text-center">Balance Due</TableHead>
              <TableHead className="font-semibold text-xs text-[#0A0A0A]">Last Payment</TableHead>
              <TableHead className="text-right font-semibold text-xs text-[#0A0A0A]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => {
              const programText = [student.university_names, student.course_names]
                .filter(Boolean)
                .join(' · ') || 'No enrollment'

              return (
                <TableRow
                  key={student.id}
                  className="group hover:bg-[#F5F6F6]/50 transition cursor-pointer"
                  onClick={() => router.push(`/students/${student.id}`)}
                >
                  <TableCell className="py-3.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-[#0A0A0A] group-hover:text-[#00A57E] transition">
                        {student.full_name}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {student.student_code}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="py-3.5 font-mono text-xs tabular-nums text-[#0A0A0A]">
                    {student.mobile || '—'}
                  </TableCell>

                  <TableCell className="py-3.5 text-xs text-[#0A0A0A] max-w-[240px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <GraduationCap className="h-3.5 w-3.5 text-[#00A57E] shrink-0" />
                      <span className="truncate">{programText}</span>
                    </div>
                  </TableCell>

                  <TableCell className="py-3.5 text-right font-mono text-xs tabular-nums">
                    <div className="text-[#0A0A0A] font-medium">
                      {formatAED(student.total_net_fee)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Paid: {formatAED(student.total_paid)}
                    </div>
                  </TableCell>

                  <TableCell className="py-3.5 text-center">
                    <BalancePill balance={student.total_balance} />
                  </TableCell>

                  <TableCell className="py-3.5 text-xs text-[#6B7272]">
                    {student.last_payment_at ? (
                      formatDubaiDate(student.last_payment_at)
                    ) : (
                      <span className="text-muted-foreground/60 italic">None</span>
                    )}
                  </TableCell>

                  <TableCell className="py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/students/${student.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E6F6F2] text-[#00805F] hover:bg-[#CCEDE5] transition min-h-[36px]"
                    >
                      <span>Ledger</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* MOBILE CARD VIEW (visible on mobile < 640px, hidden on desktop)        */}
      {/* ----------------------------------------------------------------------- */}
      <div className="sm:hidden space-y-3">
        {students.map((student) => {
          const programText = [student.university_names, student.course_names]
            .filter(Boolean)
            .join(' · ') || 'No active enrollment'

          return (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="block rounded-2xl bg-white p-4 border border-[#E4E7E7] shadow-sm hover:border-[#00A57E]/50 transition active:bg-[#F5F6F6]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[#0A0A0A] truncate">
                    {student.full_name}
                  </h3>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px] font-medium bg-[#F5F6F6] px-1.5 py-0.5 rounded">
                      {student.student_code}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="h-3 w-3 text-[#00A57E]" />
                      {student.mobile}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <BalancePill balance={student.total_balance} />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#F5F6F6] flex items-center justify-between text-xs text-[#6B7272]">
                <div className="flex items-center gap-1.5 truncate max-w-[240px]">
                  <GraduationCap className="h-3.5 w-3.5 text-[#00A57E] shrink-0" />
                  <span className="truncate">{programText}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* PAGINATION BAR (25/page)                                                */}
      {/* ----------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 px-1 text-xs text-[#6B7272]">
        <div>
          Showing{' '}
          <span className="font-semibold text-[#0A0A0A]">
            {Math.min((currentPage - 1) * pageSize + 1, totalCount)}
          </span>{' '}
          to{' '}
          <span className="font-semibold text-[#0A0A0A]">
            {Math.min(currentPage * pageSize, totalCount)}
          </span>{' '}
          of <span className="font-semibold text-[#0A0A0A]">{totalCount}</span> students
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="min-h-[38px] px-3 gap-1 border-[#E4E7E7]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </Button>

          <span className="px-2 font-medium text-[#0A0A0A]">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
            className="min-h-[38px] px-3 gap-1 border-[#E4E7E7]"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
