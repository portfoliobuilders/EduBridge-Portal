import { parsePhoneNumberFromString } from 'libphonenumber-js'

/**
 * Formats a phone number in international format (e.g., "+971 58 107 3898").
 * Falls back to AE as default country.
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '—'
  try {
    const parsed = parsePhoneNumberFromString(phone, 'AE')
    if (parsed && parsed.isValid()) {
      return parsed.formatInternational()
    }
  } catch {
    // ignore parse error and fall back
  }
  return phone
}

/**
 * Strips non-digits for wa.me / tel URL schemes
 */
export function cleanPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}
