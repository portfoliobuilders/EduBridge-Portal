'use client'

import React from 'react'
import { Printer, Download, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function PublicReceiptActions({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    toast.success('Receipt link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyLink}
        className="text-xs h-9"
      >
        {copied ? (
          <Check className="h-4 w-4 mr-1.5 text-emerald-600" />
        ) : (
          <Copy className="h-4 w-4 mr-1.5 text-muted-foreground" />
        )}
        <span>{copied ? 'Copied' : 'Copy Link'}</span>
      </Button>

      <a
        href={`/api/public/receipts/${token}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-md border border-[#E4E7E7] bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground h-9"
      >
        <Download className="h-4 w-4 mr-1.5 text-[#00A57E]" />
        <span>Download PDF</span>
      </a>

      <Button
        variant="outline"
        size="sm"
        onClick={handlePrint}
        className="text-xs h-9"
      >
        <Printer className="h-4 w-4 mr-1.5 text-muted-foreground" />
        <span>Print Voucher</span>
      </Button>
    </div>
  )
}
