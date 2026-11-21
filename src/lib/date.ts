import { toZonedTime, format } from 'date-fns-tz'

export const TIMEZONE_DUBAI = 'Asia/Dubai'

export function formatDubaiDate(
  date: string | Date | null | undefined,
  fmt = 'dd MMM yyyy'
): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return format(toZonedTime(d, TIMEZONE_DUBAI), fmt)
}

export function formatDubaiDateTime(
  date: string | Date | null | undefined,
  fmt = 'dd MMM yyyy, hh:mm a'
): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return format(toZonedTime(d, TIMEZONE_DUBAI), fmt)
}
