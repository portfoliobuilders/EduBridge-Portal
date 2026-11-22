/**
 * Client-side document compression and validation utilities.
 * Handles HEIC/HEIF conversion to JPG, JPEG/PNG compression with browser-image-compression,
 * EXIF stripping, auto-rotation, and strict 2 MB PDF hard limit validation.
 */

export interface CompressionResult {
  file: File
  originalSize: number
  compressedSize: number
  mimeType: string
  previewUrl: string
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`
}

export async function processFileForUpload(
  file: File,
  isPhoto: boolean = false
): Promise<CompressionResult> {
  const originalSize = file.size
  const lowerName = file.name.toLowerCase()
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif')

  let workingFile = file

  // 1. Convert HEIC/HEIF to JPEG in browser
  if (isHeic) {
    try {
      const heic2anyModule = await import('heic2any')
      const heic2any = heic2anyModule.default || heic2anyModule
      const conversionResult = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8,
      })
      const convertedBlob = Array.isArray(conversionResult)
        ? conversionResult[0]
        : conversionResult

      const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
      workingFile = new File([convertedBlob], newFileName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
    } catch (err) {
      console.error('HEIC conversion error:', err)
      throw new Error(
        'Could not convert iPhone HEIC photo. Please save as JPEG or choose another image.'
      )
    }
  }

  const mime = workingFile.type || 'application/octet-stream'
  const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf')
  const isJpgOrPng =
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png')

  // Accept ONLY: JPG, JPEG, PDF, PNG (after HEIC conversion)
  if (!isPdf && !isJpgOrPng) {
    throw new Error(
      `Unsupported file format (${file.type || 'unknown'}). Please upload a JPG, JPEG, or PDF document.`
    )
  }

  // 2. PDFs: hard limit 2 MB
  if (isPdf) {
    const maxPdfBytes = 2 * 1024 * 1024 // 2 MB
    if (workingFile.size > maxPdfBytes) {
      const sizeMB = (workingFile.size / (1024 * 1024)).toFixed(1)
      throw new Error(
        `This PDF is too large (${sizeMB} MB). Please reduce it below 2 MB — e.g. use ilovepdf.com/compress_pdf or scan at lower quality — then try again.`
      )
    }

    return {
      file: workingFile,
      originalSize,
      compressedSize: workingFile.size,
      mimeType: 'application/pdf',
      previewUrl: '',
    }
  }

  // 3. Images: compress in browser
  try {
    const imageCompressionModule = await import('browser-image-compression')
    const imageCompression =
      imageCompressionModule.default || imageCompressionModule

    const options = {
      maxSizeMB: isPhoto ? 0.2 : 0.5, // Passport photo <= 200KB; other <= 500KB
      maxWidthOrHeight: isPhoto ? 800 : 1600, // Passport photo max 800px; other max 1600px
      useWebWorker: true,
      libURL:
        typeof window !== 'undefined'
          ? `${window.location.origin}/vendor/browser-image-compression.js`
          : undefined,
      initialQuality: 0.7,
      fileType: 'image/jpeg',
    }

    const compressedBlob = await imageCompression(workingFile, options)
    const newName = workingFile.name.replace(/\.(png|jpeg|jpg)$/i, '.jpg')
    const compressedFile = new File([compressedBlob], newName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })

    const previewUrl = URL.createObjectURL(compressedFile)

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      mimeType: 'image/jpeg',
      previewUrl,
    }
  } catch (err) {
    console.warn('Image compression fallback:', err)
    // If browser compression fails, check if original is within safe 1 MB limit
    if (workingFile.size <= 1048576) {
      return {
        file: workingFile,
        originalSize,
        compressedSize: workingFile.size,
        mimeType: workingFile.type,
        previewUrl: URL.createObjectURL(workingFile),
      }
    }
    throw new Error(
      'Image could not be compressed below 1 MB. Please choose a smaller photo.'
    )
  }
}
