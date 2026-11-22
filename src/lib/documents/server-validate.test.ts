import { describe, it, expect } from 'vitest'
import {
  detectMagicBytes,
  validateAndProcessServerFile,
  generateStoragePath,
} from './server-validate'

describe('Document Upload Server Validation', () => {
  it('detects JPEG magic bytes correctly', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    expect(detectMagicBytes(jpegHeader)).toBe('image/jpeg')
  })

  it('detects PNG magic bytes correctly', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(detectMagicBytes(pngHeader)).toBe('image/png')
  })

  it('detects PDF magic bytes (%PDF) correctly', () => {
    const pdfHeader = Buffer.from('%PDF-1.4\n%...')
    expect(detectMagicBytes(pdfHeader)).toBe('application/pdf')
  })

  it('rejects disguised executable files', async () => {
    // MZ header for DOS/PE executable disguised as PDF
    const fakePdf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00')
    const result = await validateAndProcessServerFile(fakePdf)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file signature')
  })

  it('rejects oversized PDF > 2 MB with exact quotation guidance', async () => {
    // 2.5 MB fake PDF buffer
    const largePdf = Buffer.alloc(2.5 * 1024 * 1024)
    largePdf.write('%PDF-1.4')
    const result = await validateAndProcessServerFile(largePdf)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('This PDF is too large')
    expect(result.error).toContain('ilovepdf.com/compress_pdf')
  })

  it('accepts valid PDF within 2 MB', async () => {
    const validPdf = Buffer.alloc(500 * 1024)
    validPdf.write('%PDF-1.4')
    const result = await validateAndProcessServerFile(validPdf)
    expect(result.valid).toBe(true)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('formats clean storage paths with student code and sanitized name', () => {
    const path = generateStoragePath({
      studentCode: 'EB-STU-00012',
      studentName: 'Fatima Al Mansoori',
      docTypeSlug: '10th-certificate',
      extension: 'jpg',
      index: 1,
    })
    expect(path).toMatch(/^EB-STU-00012_fatima-al-mansoori\/10th-certificate\/\d{8}-\d{6}_1\.jpg$/)
  })
})
