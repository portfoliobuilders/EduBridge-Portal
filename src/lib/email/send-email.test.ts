import { describe, it, expect } from 'vitest'
import {
  buildReceiptMailtoUrl,
  buildStatementMailtoUrl,
} from './send-email'

describe('Email helper functions', () => {
  it('builds receipt mailto URL with proper encoding and candidate details', () => {
    const url = buildReceiptMailtoUrl({
      to: 'candidate@test.local',
      studentName: 'Fatima Al Mansoori',
      receiptNo: 'EB-RV-2026-00001',
      amount: 1500,
      balance: 50500,
      publicLink: 'https://app.edubridgeeducation.com/r/test-token',
    })

    expect(url).toContain('mailto:candidate@test.local')
    expect(url).toContain('EB-RV-2026-00001')
    expect(decodeURIComponent(url)).toContain('Fatima Al Mansoori')
    expect(decodeURIComponent(url)).toContain('AED 1,500.00')
    expect(decodeURIComponent(url)).toContain('AED 50,500.00')
  })

  it('builds statement mailto URL with proper encoding and candidate details', () => {
    const url = buildStatementMailtoUrl({
      to: 'guardian@test.local',
      studentName: 'Zayed Sultan Al Dhaheri',
      statementNo: 'EB-FS-2026-TEST',
      balance: 12500,
      publicLink: 'https://app.edubridgeeducation.com/r/statement/test-statement-token',
    })

    expect(url).toContain('mailto:guardian@test.local')
    expect(url).toContain('EB-FS-2026-TEST')
    expect(decodeURIComponent(url)).toContain('Zayed Sultan Al Dhaheri')
    expect(decodeURIComponent(url)).toContain('AED 12,500.00')
    expect(decodeURIComponent(url)).toContain('https://app.edubridgeeducation.com/r/statement/test-statement-token')
  })
})
