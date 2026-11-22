'use client'

import React from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { StudentDirectoryRow } from '@/types/student-directory'

interface CandidatesHeaderProps {
  students: StudentDirectoryRow[]
  children?: React.ReactNode
}

export function CandidatesHeader({ students, children }: CandidatesHeaderProps) {
  const handleExportAll = () => {
    if (!students || students.length === 0) {
      toast.error('No candidate records to export')
      return
    }

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
      'Created At',
    ]

    const rows = students.map((s) => [
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
      `"${s.created_at || ''}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `EduBridge_Candidates_Directory_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Exported ${students.length} candidates to CSV`)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0A0A0A] tracking-tight font-display">
          Candidates
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#6B7272]">
          Manage admitted candidates, installment plans, and fee balances
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={handleExportAll}
          className="rounded-xl border-[#E4E7E7] bg-white text-xs font-semibold h-11 px-4 text-[#0A0A0A] hover:bg-[#F5F6F6] gap-1.5"
        >
          <Download className="w-4 h-4 text-[#6B7272]" />
          Export
        </Button>

        {children}
      </div>
    </div>
  )
}
