'use client'

import React, { useState, useTransition } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  previewProgramsImportAction,
  executeProgramsImportAction,
  type ImportPreviewResult,
} from '../actions'
import { toast } from 'sonner'
import Link from 'next/link'

const CSV_TEMPLATE = `university,country,course,level,duration,course_default_fee,specialization,specialization_default_fee
Middlesex University Dubai,UAE,BSc Information Technology,Bachelor,3 Years,55000.00,Data Science,58000.00
Middlesex University Dubai,UAE,BSc Information Technology,Bachelor,3 Years,55000.00,Cyber Security,
Heriot-Watt University Dubai,UAE,BBA Business Administration,Bachelor,4 Years,62000.00,Marketing,
Heriot-Watt University Dubai,UAE,MSc Finance,Master,1 Year,75000.00,,`

function parseCsv(text: string): Array<Record<string, string>> {
  const lines: string[] = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentLine += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++
      }
      if (currentLine.trim()) {
        lines.push(currentLine)
      }
      currentLine = ''
    } else {
      currentLine += char
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine)
  }

  if (lines.length < 2) return []

  // Parse header
  const parseRow = (line: string): string[] => {
    const fields: string[] = []
    let field = ''
    let insideQuotes = false
    for (let j = 0; j < line.length; j++) {
      const c = line[j]
      if (c === '"') {
        if (insideQuotes && line[j + 1] === '"') {
          field += '"'
          j++
        } else {
          insideQuotes = !insideQuotes
        }
      } else if (c === ',' && !insideQuotes) {
        fields.push(field.trim())
        field = ''
      } else {
        field += c
      }
    }
    fields.push(field.trim())
    return fields
  }

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]+/g, '_'))
  const result: Array<Record<string, string>> = []

  for (let k = 1; k < lines.length; k++) {
    const values = parseRow(lines[k])
    const rowObj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] ?? ''
    })
    result.push(rowObj)
  }

  return result
}

export function BulkImportClient() {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([])
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
    created_universities: number
    created_courses: number
    created_specializations: number
    skipped: number
  } | null>(null)

  const [isPending, startTransition] = useTransition()
  const [isImporting, startImportTransition] = useTransition()

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'edubridge_programs_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null)
    setPreview(null)
    setImportResult(null)

    const selected = e.target.files?.[0]
    if (!selected) return

    // 1 MB limit
    if (selected.size > 1024 * 1024) {
      setErrorMsg('File size exceeds 1 MB limit')
      return
    }

    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setErrorMsg('Please select a valid CSV file')
      return
    }

    setFile(selected)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      try {
        const rows = parseCsv(text)
        if (rows.length === 0) {
          setErrorMsg('CSV file is empty or does not have valid header columns.')
          return
        }
        if (rows.length > 2000) {
          setErrorMsg(`CSV file has ${rows.length} rows, which exceeds the 2,000 row limit.`)
          return
        }
        setParsedRows(rows)

        // Trigger server preview
        startTransition(async () => {
          const res = await previewProgramsImportAction(rows)
          if (res.success && res.data) {
            setPreview(res.data)
          } else {
            setErrorMsg(res.error ?? 'Failed to preview CSV file')
          }
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg('Error parsing CSV: ' + msg)
      }
    }
    reader.readAsText(selected)
  }

  const handleExecuteImport = () => {
    if (!parsedRows.length) return

    startImportTransition(async () => {
      const res = await executeProgramsImportAction(parsedRows)
      if (res.success && res.data) {
        setImportResult(res.data)
        toast.success(
          `Import successful! Created ${res.data.created_universities} universities, ${res.data.created_courses} courses, ${res.data.created_specializations} specializations.`
        )
      } else {
        toast.error(res.error ?? 'Import failed')
        setErrorMsg(res.error ?? 'Import failed')
      }
    })
  }

  const handleReset = () => {
    setFile(null)
    setParsedRows([])
    setPreview(null)
    setErrorMsg(null)
    setImportResult(null)
  }

  return (
    <div className="space-y-6">
      {/* Action banner & Template download */}
      <div className="bg-white p-6 rounded-2xl border border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">
            Programmes CSV Import Guidelines
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload a UTF-8 encoded CSV file with up to 2,000 rows. Existing universities and
            courses will be matched case-insensitively and new specializations appended atomically.
          </p>
        </div>

        <Button
          onClick={handleDownloadTemplate}
          variant="outline"
          className="rounded-xl gap-2 text-xs font-semibold shrink-0 h-10"
        >
          <Download className="w-4 h-4 text-primary" />
          Download CSV Template
        </Button>
      </div>

      {/* Upload Dropzone */}
      {!preview && !importResult && (
        <div className="bg-white rounded-2xl border-2 border-dashed border-border p-8 md:p-12 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            id="csv-file-input"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <label
            htmlFor="csv-file-input"
            className="cursor-pointer flex flex-col items-center justify-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <UploadCloud className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Select or Drop Programmes CSV File
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">
              Columns: university, country, course, level, duration, course_default_fee,
              specialization, specialization_default_fee
            </p>
            <Button
              type="button"
              className="rounded-xl gap-2 font-semibold pointer-events-none"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Choose CSV File
            </Button>
          </label>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div className="text-xs">
            <p className="font-semibold mb-0.5">Import Error</p>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isPending && (
        <div className="bg-white p-12 rounded-2xl border border-border text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
          <p className="text-sm font-semibold text-foreground">Analyzing CSV data...</p>
          <p className="text-xs text-muted-foreground">Checking duplicates and verifying schemas against database</p>
        </div>
      )}

      {/* Preview Section */}
      {preview && !importResult && (
        <div className="space-y-6">
          {/* Summary counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-border">
              <p className="text-xs text-muted-foreground">Total Rows</p>
              <p className="text-xl font-bold text-foreground font-mono mt-1">
                {preview.totalRows}
              </p>
            </div>
            <div className="bg-green-50/60 border border-green-200 p-4 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                New Items
              </div>
              <p className="text-xl font-bold text-green-900 font-mono mt-1">
                {preview.newCount}
              </p>
            </div>
            <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                Already Exists (Skip)
              </div>
              <p className="text-xl font-bold text-amber-900 font-mono mt-1">
                {preview.existsCount}
              </p>
            </div>
            <div className="bg-red-50/60 border border-red-200 p-4 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                Invalid Rows
              </div>
              <p className="text-xl font-bold text-red-900 font-mono mt-1">
                {preview.invalidCount}
              </p>
            </div>
          </div>

          {/* Action bar */}
          <div className="bg-white p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{file?.name}</span> (
              {preview.totalRows} rows). Nothing will be saved to the database until you confirm.
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="rounded-xl h-9 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Choose Another File
              </Button>
              <Button
                size="sm"
                disabled={preview.invalidCount > 0 || isImporting || preview.newCount === 0}
                onClick={handleExecuteImport}
                className="rounded-xl h-9 text-xs font-semibold gap-1.5"
              >
                {isImporting ? (
                  'Importing...'
                ) : (
                  <>
                    Import {preview.newCount} New Items
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {preview.invalidCount > 0 && (
            <div className="p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>
                Please fix the {preview.invalidCount} invalid row(s) before importing. All or nothing
                transaction requires clean data.
              </span>
            </div>
          )}

          {/* Preview Table */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center">#</th>
                    <th className="py-3 px-3">University</th>
                    <th className="py-3 px-3">Country</th>
                    <th className="py-3 px-3">Course</th>
                    <th className="py-3 px-3">Level</th>
                    <th className="py-3 px-3">Fee</th>
                    <th className="py-3 px-3">Specialization</th>
                    <th className="py-3 px-3">Spec Fee</th>
                    <th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={
                        row.status === 'INVALID'
                          ? 'bg-red-50/40'
                          : row.status === 'EXISTS'
                          ? 'bg-neutral-50/40'
                          : ''
                      }
                    >
                      <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">
                        {row.rowIndex}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {row.university}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{row.country}</td>
                      <td className="py-2.5 px-3 font-medium text-foreground">{row.course}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-neutral-100 text-[10px]">
                          {row.level}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {row.course_default_fee || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-foreground">
                        {row.specialization || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {row.specialization_default_fee || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.status === 'NEW' && (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-none text-[10px]">
                            NEW
                          </Badge>
                        )}
                        {row.status === 'EXISTS' && (
                          <Badge variant="secondary" className="text-[10px]">
                            EXISTS (skip)
                          </Badge>
                        )}
                        {row.status === 'INVALID' && (
                          <div className="space-y-0.5">
                            <Badge variant="destructive" className="text-[10px]">
                              INVALID
                            </Badge>
                            {row.reason && (
                              <p className="text-[10px] text-red-600">{row.reason}</p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Success Result Card */}
      {importResult && (
        <div className="bg-white p-8 rounded-2xl border border-border shadow-xs text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground font-display">
              Bulk Import Completed!
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              All records have been committed in a single atomic transaction.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left bg-neutral-50 p-4 rounded-xl border border-border text-xs">
            <div>
              <span className="text-muted-foreground">Universities created:</span>
              <p className="font-bold text-foreground font-mono">
                {importResult.created_universities}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Courses created:</span>
              <p className="font-bold text-foreground font-mono">
                {importResult.created_courses}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Specializations created:</span>
              <p className="font-bold text-foreground font-mono">
                {importResult.created_specializations}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Items skipped:</span>
              <p className="font-bold text-muted-foreground font-mono">
                {importResult.skipped}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" onClick={handleReset} className="rounded-xl text-xs h-10">
              Import Another File
            </Button>
            <Link href="/admin/programs">
              <Button className="rounded-xl text-xs font-semibold h-10 gap-1.5">
                View Programmes Catalog
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
