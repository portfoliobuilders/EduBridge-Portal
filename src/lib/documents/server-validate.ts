/**
 * Server-side document security, magic-byte validation, EXIF stripping, and path formatting.
 */
import 'server-only'
import sharp from 'sharp'

export interface ServerValidationResult {
  valid: boolean
  error?: string
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'
  buffer: Buffer
  cleanedBuffer: Buffer
  sizeBytes: number
}

// Magic bytes:
// JPEG: FF D8 FF
// PNG: 89 50 4E 47 (0x89 'P' 'N' 'G')
// PDF: 25 50 44 46 ('%PDF')
export function detectMagicBytes(buffer: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (buffer.length < 4) return null

  // JPEG check
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  // PNG check
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }

  // PDF check
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf'
  }

  return null
}

export async function validateAndProcessServerFile(
  buffer: Buffer,
  fileName?: string
): Promise<ServerValidationResult> {
  void fileName
  const mimeType = detectMagicBytes(buffer)

  if (!mimeType) {
    return {
      valid: false,
      error: 'Invalid file signature. File contents do not match an authentic JPG, PNG, or PDF file.',
      mimeType: 'application/pdf',
      buffer,
      cleanedBuffer: buffer,
      sizeBytes: buffer.length,
    }
  }

  // Enforce server limits:
  // image <= 1 MB (1,048,576 bytes)
  // PDF <= 2 MB (2,097,152 bytes)
  const maxImageBytes = 1024 * 1024 // 1 MB
  const maxPdfBytes = 2 * 1024 * 1024 // 2 MB

  if (mimeType === 'application/pdf') {
    if (buffer.length > maxPdfBytes) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
      return {
        valid: false,
        error: `This PDF is too large (${sizeMB} MB). Please reduce it below 2 MB — e.g. use ilovepdf.com/compress_pdf or scan at lower quality — then try again.`,
        mimeType,
        buffer,
        cleanedBuffer: buffer,
        sizeBytes: buffer.length,
      }
    }

    return {
      valid: true,
      mimeType,
      buffer,
      cleanedBuffer: buffer,
      sizeBytes: buffer.length,
    }
  }

  // Image size limit
  if (buffer.length > maxImageBytes) {
    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `Image exceeds maximum allowed size of 1 MB (${sizeMB} MB). Please compress before uploading.`,
      mimeType,
      buffer,
      cleanedBuffer: buffer,
      sizeBytes: buffer.length,
    }
  }

  // Strip EXIF & normalize rotation with sharp
  try {
    const cleaned = await sharp(buffer)
      .rotate() // auto-rotate based on EXIF before stripping
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()

    return {
      valid: true,
      mimeType: 'image/jpeg',
      buffer,
      cleanedBuffer: cleaned,
      sizeBytes: cleaned.length,
    }
  } catch (err) {
    console.warn('Sharp EXIF strip error, using original buffer:', err)
    return {
      valid: true,
      mimeType,
      buffer,
      cleanedBuffer: buffer,
      sizeBytes: buffer.length,
    }
  }
}

/**
 * Format storage file path:
 * <student_code>_<name-slug>/<doc-type-slug>/<YYYYMMDD-HHMMSS>_<n>.<ext>
 * e.g. EB-STU-00012_fatima-al-mansoori/10th-certificate/20261122-141500_1.jpg
 */
export function generateStoragePath(params: {
  studentCode: string
  studentName: string
  docTypeSlug: string
  extension: string
  index?: number
}): string {
  const nameSlug = params.studentName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'candidate'

  const codeSlug = params.studentCode.trim() || 'CANDIDATE'
  const folder = `${codeSlug}_${nameSlug}`
  const docTypeFolder = params.docTypeSlug.toLowerCase().trim()

  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const min = String(now.getUTCMinutes()).padStart(2, '0')
  const ss = String(now.getUTCSeconds()).padStart(2, '0')
  const timestamp = `${yyyy}${mm}${dd}-${hh}${min}${ss}`
  const n = params.index ?? 1
  const cleanExt = params.extension.replace(/^\./, '').toLowerCase()

  return `${folder}/${docTypeFolder}/${timestamp}_${n}.${cleanExt}`
}
