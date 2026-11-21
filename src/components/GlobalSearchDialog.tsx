'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { globalSearchAction, SearchResult } from '@/app/(app)/actions/search'
import { User, Receipt, Loader2 } from 'lucide-react'
import { Money } from '@/components/Money'

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>({ students: [], receipts: [] })
  const [isPending, startTransition] = useTransition()

  // Debounced search (250ms)
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      return
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await globalSearchAction(trimmed)
          setResults(res)
        } catch {
          setResults({ students: [], receipts: [] })
        }
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [query])

  const isShort = query.trim().length < 2
  const activeResults = isShort ? { students: [], receipts: [] } : results

  const handleSelectStudent = (id: string) => {
    onOpenChange(false)
    router.push(`/candidates/${id}`)
  }

  const handleSelectReceipt = (id: string) => {
    onOpenChange(false)
    router.push(`/receipts/${id}`)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search candidates, mobile, code, receipt no..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isPending && (
          <div className="flex items-center justify-center p-4 text-xs text-muted-foreground gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            Searching...
          </div>
        )}

        {!isPending && !isShort && activeResults.students.length === 0 && activeResults.receipts.length === 0 && (
          <CommandEmpty>No matching candidates or receipts found.</CommandEmpty>
        )}

        {activeResults.students.length > 0 && (
          <CommandGroup heading="Candidates">
            {activeResults.students.map((stu) => (
              <CommandItem
                key={stu.id}
                onSelect={() => handleSelectStudent(stu.id)}
                className="flex items-center justify-between py-2 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{stu.full_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{stu.student_code} · {stu.mobile}</p>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {activeResults.receipts.length > 0 && (
          <CommandGroup heading="Receipt Vouchers">
            {activeResults.receipts.map((rec) => (
              <CommandItem
                key={rec.id}
                onSelect={() => handleSelectReceipt(rec.id)}
                className="flex items-center justify-between py-2 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium font-mono text-foreground">{rec.receipt_no}</p>
                    <p className="text-xs text-muted-foreground">{rec.student_name}</p>
                  </div>
                </div>
                <Money amount={rec.amount} className="text-xs font-semibold text-primary" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
